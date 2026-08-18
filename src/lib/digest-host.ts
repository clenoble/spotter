import {
  runDigest,
  createSearxngAdapter,
  createOpenAlexAdapter,
  createFeedsAdapter,
  createFetcher,
  createProvider,
  relevanceScorer,
  pollutionScorer,
  qualityScorer,
  noveltyScorer,
  challengeScorer,
  calibrationScorer,
  calibrationHasABand,
  documentIdFor,
  cleanUrl,
  type AxisScorer,
  type DigestOutcome,
  type PreferenceDoc,
  type SearchAdapter,
  type SpotterStore
} from '$core/index';
import { browserTransport } from '$lib/transport';
import { createIdbStore } from '$lib/store/spotter-db';
import { getSettings, toProviderConfig, settingsProblem } from '$lib/settings';
import type { DigestView, DigestEntryView, HeldBackView } from '$shared/messages';

/**
 * The browser host's digest machinery: composition root for the overnight run
 * (§5.5), and the read model the dashboard consumes.
 *
 * Persistence is **by class** (§6.3), and the classes drive everything here:
 *
 * - The surfaced digest — documents, judgments, offers — is durable, in
 *   IndexedDB, written by the core orchestrator. It survives anything.
 * - The run report — held-back entries, funnel counts — is working memory. It
 *   lives in `chrome.storage.session`, which survives service-worker eviction
 *   and dies with the browser. After a restart the digest itself is rebuilt
 *   from the store and the report is honestly *gone*; the view says so
 *   (`heldBackLost`) rather than pretending the night held nothing back.
 * - `lastRun` (a timestamp and a tier label) is `chrome.storage.local`: it is
 *   what the staleness tier compares against, so it must survive restarts,
 *   and it describes the *system's* behaviour, not the reader's.
 */
const SESSION_KEY = 'spotter:digest-report';
const LAST_RUN_KEY = 'spotter:digest-last-run';

/** Default composition — a policy the user will own; a documented start (F3). */
const WEIGHTS = { relevance: 1, quality: 1, novelty: 0.7, challenge: 0.7 };

export type RunTier = 'overnight' | 'staleness' | 'manual';

let store: SpotterStore | null = null;
export function digestStore(): SpotterStore {
  if (!store) store = createIdbStore();
  return store;
}

export async function runDigestNow(tier: RunTier): Promise<DigestView> {
  const settings = await getSettings();
  const problem = settingsProblem(settings);
  if (problem) throw new Error(problem);

  const { getPreferences } = await import('$lib/store/db');
  const prefs = (await getPreferences()) as PreferenceDoc;
  const topics = prefs.topicsMore.filter(t => t.trim());
  if (topics.length === 0 && !(prefs.feeds ?? []).length) {
    throw new Error('No topics and no feeds declared — the digest has nowhere to look. Add topics in Preferences.');
  }

  // All six axes — Calibration only when a band exists: a band nobody
  // declared is not a band (see calibration.ts).
  const scorers: AxisScorer[] = [relevanceScorer, qualityScorer, noveltyScorer, challengeScorer, pollutionScorer];
  if (calibrationHasABand(prefs.examples)) scorers.push(calibrationScorer);

  const search: SearchAdapter[] = [
    createSearxngAdapter({ baseUrl: settings.searxngUrl ?? 'http://localhost:8888', transport: browserTransport }),
    createOpenAlexAdapter({ transport: browserTransport })
  ];
  const feeds = (prefs.feeds ?? []).length
    ? createFeedsAdapter({ feeds: prefs.feeds ?? [], transport: browserTransport })
    : undefined;

  const outcome = await runDigest({
    topics,
    search,
    feeds,
    fetcher: createFetcher(browserTransport),
    provider: createProvider(toProviderConfig(settings)),
    scorers,
    prefs,
    composition: { weights: WEIGHTS },
    store: digestStore(),
    surface: 'chrome',
    maxItems: 5,
    scorerModel: settings.model
  });

  const at = new Date().toISOString();
  await chrome.storage.local.set({ [LAST_RUN_KEY]: { at, tier } });
  await chrome.storage.session.set({ [SESSION_KEY]: toSessionReport(outcome) });

  return readDigest();
}

/** Rebuild the view: durable half from the store, session half if it survives. */
export async function readDigest(): Promise<DigestView> {
  const s = digestStore();
  const lastRun = (await chrome.storage.local.get(LAST_RUN_KEY))[LAST_RUN_KEY] as
    | { at: string; tier: RunTier }
    | undefined;
  const report = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as SessionReport | undefined;

  const entries: DigestEntryView[] = [];
  if (lastRun) {
    // Today's digest = the offers recorded by the last run. The offer journal
    // is the durable record of what was surfaced (§6.2).
    const dayStart = lastRun.at.slice(0, 10);
    for (const offer of await s.offers(`${dayStart}T00:00:00.000Z`)) {
      const doc = await s.getDocument(offer.documentId);
      const judgment = await s.getJudgment(offer.documentId);
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
    ranAt: lastRun?.at ?? null,
    ranBy: lastRun?.tier ?? null,
    entries,
    heldBack: report?.heldBack ?? [],
    heldBackLost: !!lastRun && !report,
    counts: report?.counts ?? null
  };
}

export async function recordOpenGesture(documentId: string): Promise<void> {
  await digestStore().recordOpen(documentId, new Date().toISOString());
}
export async function recordReadGesture(documentId: string): Promise<void> {
  await digestStore().recordRead(documentId, new Date().toISOString());
}

/** Has a digest run today? The staleness tier's question (§5.5, tier 2). */
export async function digestIsStale(): Promise<boolean> {
  const lastRun = (await chrome.storage.local.get(LAST_RUN_KEY))[LAST_RUN_KEY] as { at: string } | undefined;
  if (!lastRun) return true;
  return lastRun.at.slice(0, 10) !== new Date().toISOString().slice(0, 10);
}

interface SessionReport {
  heldBack: HeldBackView[];
  reasons: Record<string, string>;
  scoredOn: Record<string, 'article' | 'abstract'>;
  counts: { searched: number; afterTriage: number; fetched: number; scored: number };
}

function toSessionReport(outcome: DigestOutcome): SessionReport {
  const reasons: Record<string, string> = {};
  const scoredOn: Record<string, 'article' | 'abstract'> = {};
  for (const e of outcome.editorial.digest) {
    if (e.outcome.kind === 'selected') reasons[e.candidate.documentId] = e.outcome.reason;
  }
  for (const r of outcome.reports) {
    for (const s of [...r.digest, ...r.belowCut]) {
      scoredOn[documentIdFor(cleanUrl(s.url))] = s.scoredOn;
    }
  }
  const heldBack: HeldBackView[] = outcome.editorial.heldBack.map(e => ({
    documentId: e.candidate.documentId,
    title: e.candidate.title,
    url: e.candidate.url,
    score: e.candidate.score,
    outcome: e.outcome.kind === 'refused' ? 'refused' : e.outcome.kind === 'beaten' ? 'beaten' : 'unruled',
    reason: e.outcome.kind === 'refused' ? e.outcome.reason : undefined,
    margin: e.outcome.kind === 'beaten' ? e.outcome.margin : undefined
  }));
  const counts = outcome.reports.reduce(
    (acc, r) => ({
      searched: acc.searched + r.counts.searched,
      afterTriage: acc.afterTriage + r.counts.afterTriage,
      fetched: acc.fetched + r.counts.fetched,
      scored: acc.scored + r.counts.scored
    }),
    { searched: 0, afterTriage: 0, fetched: 0, scored: 0 }
  );
  return { heldBack, reasons, scoredOn, counts };
}
