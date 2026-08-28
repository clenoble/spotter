import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  runDigest,
  createSearxngAdapter,
  createOpenAlexAdapter,
  createFeedsAdapter,
  createFetcher,
  createProvider,
  standardScorers,
  CancelledError,
  type DigestOutcome,
  type PreferenceDoc,
  type SearchAdapter,
  type SpotterStore,
  type Transport
} from '../src/core/index';
import { createFileStore } from './store-file';
import type { DigestView, DigestEntryView } from '../src/shared/messages';
import { toSessionReport, latestRunOffers, type SessionReport } from '../src/shared/report';

/**
 * The companion's production and read model — host #3's composition root.
 *
 * Everything the core needs is handed in here, exactly as the browser host
 * hands it in from `digest-host.ts`: transport with caller-set timeouts,
 * adapters, fetcher, provider, the standard scorer set, a store passing the
 * shared contract. Swapping this file's bindings for Sovereign's capabilities
 * is the whole of the later integration — the core does not know which host
 * it runs under, and must never learn.
 */

export interface Declarations {
  prefs: PreferenceDoc;
  backend: {
    provider: 'ollama' | 'anthropic' | 'gemini';
    model: string;
    apiKeys: Partial<Record<'ollama' | 'anthropic' | 'gemini', string>>;
    ollamaHost: string;
    searxngUrl: string;
    /** Candidates examined per funnel — the user's cost dial (clamped in core). */
    fetchBudget?: number;
  };
}

const DEFAULT_DECLARATIONS: Declarations = {
  prefs: {
    version: 1,
    topicsMore: [],
    topicsLess: [],
    tonePreferences: [],
    authorsBoost: [],
    authorsMute: [],
    explorationRate: 0.2,
    explorationMode: 'mixed',
    customRules: [],
    feeds: [],
    examples: [],
    updatedAt: new Date(0).toISOString()
  },
  backend: {
    provider: 'ollama',
    model: 'mistral',
    apiKeys: {},
    ollamaHost: 'http://localhost:11434',
    searxngUrl: 'http://localhost:8888'
  }
};

/** Node's fetch leaves no browser cache; the timeout contract is honoured. */
const transport: Transport = (url, init) =>
  fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000)
  });

// Session-class state: alive exactly as long as the process, like the
// extension's storage.session. A run report that outlived the process would
// describe a run nobody can ask about.
let lastOutcome: { report: SessionReport; at: string } | null = null;
let runInfo: { startedAt: string; tier: string } | null = null;
let running: Promise<void> | null = null;
let lastError: { at: string; tier: string; message: string } | null = null;
let cancelRequested = false;

export function currentRun(): typeof runInfo {
  return runInfo;
}

/**
 * The reader's stop. Sets the flag the run polls at candidate boundaries —
 * never a kill: the run finishes the judgment in its hands and throws at the
 * next checkpoint, so nothing is half-written. Returns whether a run was
 * there to cancel.
 */
export function cancelRun(): boolean {
  if (!running) return false;
  cancelRequested = true;
  return true;
}

export function startRun(dataDir: string, tier: 'overnight' | 'manual'): Promise<void> {
  if (!running) {
    runInfo = { startedAt: new Date().toISOString(), tier };
    lastError = null;
    cancelRequested = false;
    // The attempt is recorded at start, success or not — the overnight tier
    // compares against it, so a failed or cancelled run stays down for the
    // day instead of relaunching itself ten minutes later (the extension
    // learned this rule on 2026-08-19; the companion inherits it).
    writeFileSync(join(dataDir, 'lastattempt.json'), JSON.stringify({ at: runInfo.startedAt, tier }), 'utf8');
    running = produce(dataDir, tier)
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof CancelledError) console.log(`[companion] run cancelled: ${message}`);
        else console.warn(`[companion] digest run failed: ${message}`);
        lastError = { at: new Date().toISOString(), tier, message };
      })
      .then(() => {
        running = null;
        runInfo = null;
      });
  }
  return running;
}

async function produce(dataDir: string, tier: 'overnight' | 'manual'): Promise<void> {
  const { prefs, backend } = loadDeclarations(dataDir);
  const topics = prefs.topicsMore.filter(t => t.trim());
  if (topics.length === 0 && !(prefs.feeds ?? []).length) {
    throw new Error('no topics and no feeds declared — push declarations from the extension first');
  }

  const search: SearchAdapter[] = [
    createSearxngAdapter({ baseUrl: backend.searxngUrl, transport }),
    createOpenAlexAdapter({ transport })
  ];
  const store = storeFor(dataDir);

  const outcome = await runDigest({
    topics,
    search,
    feeds: (prefs.feeds ?? []).length ? createFeedsAdapter({ feeds: prefs.feeds ?? [], transport }) : undefined,
    fetcher: createFetcher(transport),
    provider: createProvider({
      id: backend.provider,
      host: backend.ollamaHost,
      apiKey: backend.apiKeys[backend.provider],
      transport
    }),
    scorers: standardScorers(prefs),
    prefs,
    composition: { weights: { relevance: 1, quality: 1, novelty: 0.7, challenge: 0.7 } },
    store,
    surface: 'companion',
    maxItems: 5,
    fetchBudget: backend.fetchBudget,
    shouldStop: () => cancelRequested,
    scorerModel: backend.model
  });

  const at = new Date().toISOString();
  writeFileSync(join(dataDir, 'lastrun.json'), JSON.stringify({ at, tier }), 'utf8');
  lastOutcome = { report: toSessionReport(outcome), at };

  const c = outcome.reports.reduce(
    (acc, r) => ({ s: acc.s + r.counts.searched, f: acc.f + r.counts.fetched, sc: acc.sc + r.counts.scored }),
    { s: 0, f: 0, sc: 0 }
  );
  console.log(
    `[companion] digest produced: ${outcome.editorial.digest.length} entries, ${outcome.editorial.heldBack.length} held back · searched ${c.s} → fetched ${c.f} → scored ${c.sc}` +
      (outcome.failedFunnels.length
        ? ` · ⚠ ${outcome.failedFunnels.length} funnel(s) failed: ${[...new Set(outcome.failedFunnels.map(f => f.engine))].join(', ')}`
        : '')
  );

  await buildReadingCache(dataDir, outcome);
}

/**
 * The reading cache (Céline, 2026-08-19): the extracted text of the digest's
 * entries, so the phone can read in the train. **Three days, her ruling** —
 * purged on every run and filtered at serve time, so a stopped companion does
 * not serve stale text as fresh. Bounded to digest entries: this is content
 * the reader asked to read, not a log of anything.
 */
const READING_CACHE_DAYS = 3;

interface CachedArticle {
  documentId: string;
  title: string;
  text: string;
  cachedAt: string;
}

async function buildReadingCache(dataDir: string, outcome: DigestOutcome): Promise<void> {
  const path = join(dataDir, 'articles.json');
  const existing: Record<string, CachedArticle> = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, CachedArticle>)
    : {};

  const floor = new Date(Date.now() - READING_CACHE_DAYS * 86400000).toISOString();
  const kept = Object.fromEntries(Object.entries(existing).filter(([, a]) => a.cachedAt >= floor));

  const fetcher = createFetcher(transport);
  for (const e of outcome.editorial.digest) {
    const id = e.candidate.documentId;
    if (kept[id]) continue;
    const doc = await fetcher.fetch(e.candidate.url);
    if (doc) {
      kept[id] = { documentId: id, title: doc.title || e.candidate.title, text: doc.text, cachedAt: new Date().toISOString() };
    }
    // An unfetchable entry (scored on abstract) stays unfetchable offline —
    // the phone shows the abstract and the badge, not a pretense of the page.
  }
  writeFileSync(path, JSON.stringify(kept), 'utf8');
}

export function readArticle(dataDir: string, documentId: string): CachedArticle | null {
  const path = join(dataDir, 'articles.json');
  if (!existsSync(path)) return null;
  const all = JSON.parse(readFileSync(path, 'utf8')) as Record<string, CachedArticle>;
  const a = all[documentId];
  if (!a) return null;
  const floor = new Date(Date.now() - READING_CACHE_DAYS * 86400000).toISOString();
  return a.cachedAt >= floor ? a : null;
}

// --- the read model, mirroring digest-host's shapes exactly ------------------

let cachedStore: SpotterStore | null = null;
function storeFor(dataDir: string): SpotterStore {
  if (!cachedStore) cachedStore = createFileStore(join(dataDir, 'store.json'));
  return cachedStore;
}

export function loadDeclarations(dataDir: string): Declarations {
  const path = join(dataDir, 'declarations.json');
  if (!existsSync(path)) return structuredClone(DEFAULT_DECLARATIONS);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Declarations>;
  return {
    prefs: { ...DEFAULT_DECLARATIONS.prefs, ...(raw.prefs ?? {}) },
    backend: { ...DEFAULT_DECLARATIONS.backend, ...(raw.backend ?? {}) }
  };
}

export function saveDeclarations(dataDir: string, declarations: Declarations): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'declarations.json'), JSON.stringify(declarations, null, 2), 'utf8');
}

export async function readCompanionDigest(dataDir: string, day?: string): Promise<DigestView> {
  const store = storeFor(dataDir);
  const lastRunPath = join(dataDir, 'lastrun.json');
  const lastRun = existsSync(lastRunPath)
    ? (JSON.parse(readFileSync(lastRunPath, 'utf8')) as { at: string; tier: 'overnight' | 'manual' })
    : undefined;

  const targetDay = day ?? lastRun?.at.slice(0, 10) ?? null;
  const isLatestDay = targetDay !== null && targetDay === lastRun?.at.slice(0, 10);
  const report = isLatestDay && lastOutcome?.at.slice(0, 10) === targetDay ? lastOutcome.report : undefined;

  const entries: DigestEntryView[] = [];
  if (targetDay) {
    for (const offer of latestRunOffers(await store.offers(`${targetDay}T00:00:00.000Z`), targetDay)) {
      const doc = await store.getDocument(offer.documentId);
      const judgment = await store.getJudgment(offer.documentId);
      if (!doc || !judgment) continue;
      entries.push({
        documentId: doc.id,
        url: doc.url,
        title: doc.title,
        score: judgment.score,
        reason: report?.reasons[doc.id] ?? '',
        degraded: judgment.degraded,
        scoredOn: report?.scoredOn[doc.id] ?? 'article',
        axes: judgment.axes,
        engine: doc.engine,
        openedAt: doc.signals.openedAt,
        readAt: doc.signals.readAt
      });
    }
  }

  return {
    ranAt: isLatestDay ? (lastRun?.at ?? null) : null,
    ranBy: isLatestDay && lastRun ? (lastRun.tier === 'overnight' ? 'overnight' : 'manual') : null,
    entries,
    heldBack: report?.heldBack ?? [],
    heldBackLost: isLatestDay && !!lastRun && !report,
    counts: report?.counts ?? null,
    funnel: report?.funnel ?? null,
    runInProgress: (runInfo as DigestView['runInProgress']) ?? null,
    lastRunError: lastError
  };
}

export async function companionDigestDays(dataDir: string): Promise<string[]> {
  const offers = await storeFor(dataDir).offers('0000-01-01T00:00:00.000Z');
  const days = new Set<string>();
  for (const o of offers) days.add(o.at.slice(0, 10));
  return [...days].sort().reverse();
}

export async function recordGesture(
  dataDir: string,
  documentId: string,
  kind: 'open' | 'read'
): Promise<void> {
  const store = storeFor(dataDir);
  const at = new Date().toISOString();
  if (kind === 'open') await store.recordOpen(documentId, at);
  else await store.recordRead(documentId, at);
}
