import {
  runDigest,
  createSearxngAdapter,
  createOpenAlexAdapter,
  createFeedsAdapter,
  createFetcher,
  createProvider,
  standardScorers,
  type PreferenceDoc,
  type SearchAdapter,
  type SpotterStore
} from '$core/index';
import { browserTransport } from '$lib/transport';
import { createIdbStore } from '$lib/store/spotter-db';
import { getSettings, toProviderConfig, settingsProblem } from '$lib/settings';
// Static on purpose: dynamic import() is disallowed in an MV3 service worker,
// and the first shipped version loaded preferences with one — every run died
// on its first line, in the worker's console, invisibly.
import { getPreferences } from '$lib/store/db';
import type { DigestView, DigestEntryView } from '$shared/messages';
import { toSessionReport, latestRunOffers, type SessionReport } from '$shared/report';

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
const RUN_ERROR_KEY = 'spotter:digest-run-error';
export const ATTEMPT_KEY = 'spotter:digest-last-attempt';

/**
 * A run that dies with the worker leaves no trace at all: the attempt is
 * recorded at start (storage.local), the outcome only at the end, and the
 * in-memory witness dies with the process. Measured 2026-08-26: a manual run
 * launched while the companion was down ran in the MV3 worker, the worker did
 * not survive it, and the reader's whole evidence was "il semble qu'il n'a
 * pas tourné". On wake, an attempt newer than the last outcome, with no error
 * recorded and no run live, is exactly that corpse — name it where the
 * dashboard reads, instead of letting silence claim nothing was tried.
 * (Browser-bound by nature — chrome.storage on both sides — hence no
 * invariant covers it; stated rather than slipped.)
 */
export async function surfaceInterruptedRun(): Promise<void> {
  const attempt = (await chrome.storage.local.get(ATTEMPT_KEY))[ATTEMPT_KEY] as
    | { at: string; tier: string }
    | undefined;
  if (!attempt) return;
  const lastRun = (await chrome.storage.local.get(LAST_RUN_KEY))[LAST_RUN_KEY] as { at: string } | undefined;
  if (lastRun && lastRun.at >= attempt.at) return;
  if ((await chrome.storage.session.get(RUN_ERROR_KEY))[RUN_ERROR_KEY]) return;
  await chrome.storage.session.set({
    [RUN_ERROR_KEY]: {
      at: attempt.at,
      tier: attempt.tier,
      message:
        'this run left no outcome — the browser worker did not survive it (browser closed, or Chrome reclaimed the worker mid-run). Hours-long runs are what the companion process is for: npm run companion.'
    }
  });
}

/** Written by the background when a run fails; cleared when one starts. */
export async function recordRunError(tier: string, message: string): Promise<void> {
  await chrome.storage.session.set({ [RUN_ERROR_KEY]: { at: new Date().toISOString(), tier, message } });
}
export async function clearRunError(): Promise<void> {
  await chrome.storage.session.remove(RUN_ERROR_KEY);
}

/** Default composition — a policy the user will own; a documented start (F3). */
const WEIGHTS = { relevance: 1, quality: 1, novelty: 0.7, challenge: 0.7 };

export type RunTier = 'overnight' | 'staleness' | 'manual';

let store: SpotterStore | null = null;
export function digestStore(): SpotterStore {
  if (!store) store = createIdbStore();
  return store;
}

export async function runDigestNow(tier: RunTier, shouldStop?: () => boolean): Promise<DigestView> {
  const settings = await getSettings();
  const problem = settingsProblem(settings);
  if (problem) throw new Error(problem);

  const prefs = (await getPreferences()) as PreferenceDoc;
  const topics = prefs.topicsMore.filter(t => t.trim());
  if (topics.length === 0 && !(prefs.feeds ?? []).length) {
    throw new Error('No topics and no feeds declared — the digest has nowhere to look. Add topics in Preferences.');
  }

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
    scorers: standardScorers(prefs),
    prefs,
    composition: { weights: WEIGHTS },
    store: digestStore(),
    surface: 'chrome',
    maxItems: 5,
    fetchBudget: settings.fetchBudget,
    shouldStop,
    scorerModel: settings.model
  });

  const at = new Date().toISOString();
  await chrome.storage.local.set({ [LAST_RUN_KEY]: { at, tier } });
  await chrome.storage.session.set({ [SESSION_KEY]: toSessionReport(outcome) });

  return readDigest();
}

/**
 * Rebuild the view: durable half from the store, session half if it survives.
 *
 * With a `day`, the view is that day's digest — **historicised** (Céline,
 * 2026-08-19: yesterday's digest, or a few days back, must stay consultable).
 * The offers journal + judgments are durable, so past digests rebuild fully;
 * the run *report* (held back, funnel, editor reasons) is session-class and
 * only exists for the latest run of this browser session — the view says
 * which case it is in rather than blurring them.
 */
export async function readDigest(day?: string): Promise<DigestView> {
  const s = digestStore();
  const lastRun = (await chrome.storage.local.get(LAST_RUN_KEY))[LAST_RUN_KEY] as
    | { at: string; tier: RunTier }
    | undefined;
  const report = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as SessionReport | undefined;

  const targetDay = day ?? lastRun?.at.slice(0, 10) ?? null;
  const isLatestDay = targetDay !== null && targetDay === lastRun?.at.slice(0, 10);
  const reportApplies = isLatestDay ? report : undefined;

  const entries: DigestEntryView[] = [];
  if (targetDay) {
    // One day's digest = its latest run's offers, one entry per document
    // (the journal keeps every offer; the view keeps the last editorial act).
    for (const offer of latestRunOffers(await s.offers(`${targetDay}T00:00:00.000Z`), targetDay)) {
      const doc = await s.getDocument(offer.documentId);
      const judgment = await s.getJudgment(offer.documentId);
      if (!doc || !judgment) continue;
      entries.push({
        documentId: doc.id,
        url: doc.url,
        title: doc.title,
        score: judgment.score,
        reason: reportApplies?.reasons[doc.id] ?? '',
        degraded: judgment.degraded,
        scoredOn: reportApplies?.scoredOn[doc.id] ?? 'article',
        axes: judgment.axes,
        engine: doc.engine,
        openedAt: doc.signals.openedAt,
        readAt: doc.signals.readAt
      });
    }
  }

  return {
    ranAt: isLatestDay ? (lastRun?.at ?? null) : null,
    ranBy: isLatestDay ? (lastRun?.tier ?? null) : null,
    entries,
    heldBack: reportApplies?.heldBack ?? [],
    heldBackLost: isLatestDay && !!lastRun && !report,
    counts: reportApplies?.counts ?? null,
    funnel: reportApplies?.funnel ?? null,
    // The background decorates this from its own run state — only the worker
    // knows whether a run is live, and the read model must not guess.
    runInProgress: null,
    lastRunError:
      ((await chrome.storage.session.get(RUN_ERROR_KEY))[RUN_ERROR_KEY] as
        | { at: string; tier: string; message: string }
        | undefined) ?? null
  };
}

/** Days that have a digest, newest first — the history the Digest tab offers. */
export async function digestDays(): Promise<string[]> {
  const offers = await digestStore().offers('0000-01-01T00:00:00.000Z');
  const days = new Set<string>();
  for (const o of offers) days.add(o.at.slice(0, 10));
  return [...days].sort().reverse();
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
