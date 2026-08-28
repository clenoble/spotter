import type { LlmProvider } from './llm/provider';
import type { SearchAdapter } from './search/adapter';
import type { DocumentFetcher, RetrievalReport, ScoredCandidate } from './retrieval';
import type { AxisScorer } from './axes/types';
import type { CompositionPolicy } from './compose';
import type { PreferenceDoc } from './prefs';
import type { SpotterStore } from './store/store';
import type { Surface } from './store/model';
import type { EditorialResult, EditorialCandidate } from './editorial';
import { retrieve, DEFAULT_RETRIEVAL_POLICY, CancelledError } from './retrieval';
import { assembleEditorial, gatherContext, enforceOneSlotPerSubject } from './editorial';
import { editorViewOf, documentIdFor } from './store/store';
import { judgeSlate, motivateRefusals } from './editorial-judge';
import { buildEditorialQueries, type CandidateSubject, type EditorialQueryPolicy, DEFAULT_QUERY_POLICY } from './editorial-queries';
import { cleanUrl } from './search/adapter';

/**
 * One overnight run: topics → funnels → the editor's second round → the slate
 * judgment → a finite digest, persisted per Céline's architecture — **only
 * what the editor surfaced enters the base** (§6.2); everything else lives in
 * the run report, which is working memory and dies with the run (§6.3).
 *
 * Host-agnostic: every capability is handed in. The host decides when this
 * runs (the three tiers of §5.5), where the report is shown, and what survives
 * the day.
 */
export interface DigestRun {
  /** Query seeds — the declared topics (§5.3). */
  topics: readonly string[];
  /** Mode R substrate(s): generalist and/or academic, run per topic. */
  search: readonly SearchAdapter[];
  /**
   * Candidates examined per round-one funnel — the user's dial on the cost
   * envelope (each candidate = one fetch + every axis). Clamped to [1, 200];
   * absent falls to the retrieval default. The editor's second round keeps its
   * own tighter cap: its queries are targeted, not exploratory.
   */
  fetchBudget?: number;
  /**
   * Host-supplied stop capability (the dashboard's Stop button, a companion
   * cancel route). Polled at funnel and candidate boundaries; when it says
   * stop, the run throws `CancelledError` — nothing persisted, nothing
   * half-written, and never recorded as a failed substrate.
   */
  shouldStop?: () => boolean;
  /** Mode B, run once per digest — a feed is read, not queried. Optional. */
  feeds?: SearchAdapter;
  fetcher: DocumentFetcher;
  provider: LlmProvider;
  scorers: readonly AxisScorer[];
  prefs: PreferenceDoc;
  composition: CompositionPolicy;
  store: SpotterStore;
  surface: Surface;
  /** The ceiling — at most, never a quota (§5.5). */
  maxItems: number;
  /** The editor's second round (§5.6). Defaults to DEFAULT_QUERY_POLICY. */
  queryPolicy?: EditorialQueryPolicy;
  /** Slate size offered to the judge. */
  slateSize?: number;
  judgeModel?: string;
  scorerModel?: string;
  now?: () => string;
}

export interface DigestOutcome {
  editorial: EditorialResult;
  /** Every funnel's report, first round and second — ephemeral by class. */
  reports: RetrievalReport[];
  /** Second-round accounting: what the editor asked, what the budget cut. */
  editorRound: { issued: number; notIssued: number };
  /**
   * Funnels that failed whole — a substrate down, a 503, a network cut. Their
   * candidates are simply *missing* from the pool, which no downstream counter
   * can see (§5.2, degree 1): the absence must be carried, or a night with a
   * dead substrate reads as a thin day. Measured 2026-08-19: one OpenAlex 503
   * killed the entire run before this existed.
   */
  failedFunnels: Array<{ engine: string; query: string; error: string }>;
}

export async function runDigest(run: DigestRun): Promise<DigestOutcome> {
  const now = run.now ?? (() => new Date().toISOString());
  const reports: RetrievalReport[] = [];
  const pool = new Map<string, { scored: ScoredCandidate; topic: string | null }>();

  // The frontier: titles recently *offered* — never reads (§5.6, and the
  // ScoringContext comment). 60 days covers "have I had this lately" without
  // an unbounded read of the journal.
  const recentlySeen = await recentOfferTitles(run.store, 60, now());

  const failedFunnels: DigestOutcome['failedFunnels'] = [];

  const collect = (report: RetrievalReport | null, topic: string | null) => {
    if (!report) return;
    reports.push(report);
    for (const s of [...report.digest, ...report.belowCut]) {
      const id = documentIdFor(cleanUrl(s.url));
      if (!pool.has(id)) pool.set(id, { scored: s, topic });
    }
  };

  // A substrate that fails costs its own candidates, never the night. One
  // OpenAlex 503 used to kill the whole run — the other substrates' work
  // included. The failure is *recorded*, not absorbed: a dead substrate's
  // candidates are missing in a way no downstream counter can see, so the
  // absence itself must travel to the surface.
  const safeFunnel = async (
    adapter: SearchAdapter,
    q: string,
    maxFetches?: number
  ): Promise<RetrievalReport | null> => {
    try {
      return await funnel(run, adapter, q, recentlySeen, maxFetches);
    } catch (err) {
      // A decision to stop is not a dead substrate — it must escape the
      // per-funnel net whole, or a cancel would half-run the night.
      if (err instanceof CancelledError) throw err;
      failedFunnels.push({
        engine: adapter.id,
        query: q,
        error: err instanceof Error ? err.message : String(err)
      });
      return null;
    }
  };

  // Round one — Mode R per topic on each substrate, Mode B once.
  const budget = clampBudget(run.fetchBudget);
  const checkStop = () => {
    if (run.shouldStop?.()) throw new CancelledError();
  };
  for (const topic of run.topics) {
    for (const adapter of run.search) {
      checkStop();
      collect(await safeFunnel(adapter, topic, budget), topic);
    }
  }
  checkStop();
  if (run.feeds) collect(await safeFunnel(run.feeds, '', budget), null);

  // Everything failing is a different fact from a thin day, and it errors as
  // one: an empty digest that hides a dead network reads as "nothing worth
  // your attention today", which would be false.
  if (reports.length === 0 && failedFunnels.length > 0) {
    throw new Error(
      `every substrate failed: ${failedFunnels.map(f => `${f.engine} (${f.error.slice(0, 80)})`).join(' · ')}`
    );
  }

  // Round two — the editor's own queries (§5.6): contradiction and movement,
  // built from what the day's documents are and claim, never from the reader.
  // v0.1 uses the candidate's title as its subject and claim — a title is the
  // document's own public assertion, so the egress discloses the document.
  const top = [...pool.values()].sort((a, b) => b.scored.score - a.scored.score).slice(0, 5);
  const subjects: CandidateSubject[] = top.map(({ scored }) => ({
    documentId: documentIdFor(cleanUrl(scored.url)),
    subject: scored.title,
    claim: scored.title
  }));
  const policy = run.queryPolicy ?? DEFAULT_QUERY_POLICY;
  const { issued, notIssued } = buildEditorialQueries(subjects, policy);
  // The round runs on the FIRST substrate only — the generalist. Its queries
  // (contradiction, movement) are web-shaped, not academic; and every funnel
  // here costs fetches × axes in LLM calls, so fanning the round across all
  // substrates doubled the night's most expensive stage for material the
  // second substrate is worst at. Cost decision, documented in
  // docs/decisions-v0.1.md — not a quality judgment about any substrate.
  const roundSubstrate = run.search[0];
  for (const q of issued) {
    if (!roundSubstrate) break;
    checkStop();
    collect(await safeFunnel(roundSubstrate, q.query.q, 8), null);
  }
  checkStop();

  // The slate: the pool's best, judged as a whole.
  const slate = [...pool.values()]
    .sort((a, b) => b.scored.score - a.scored.score)
    .slice(0, run.slateSize ?? 15);
  const candidates: EditorialCandidate[] = slate.map(({ scored, topic }) => ({
    documentId: documentIdFor(cleanUrl(scored.url)),
    url: scored.url,
    title: scored.title,
    topicId: topic,
    score: scored.score,
    degraded: scored.degraded,
    ungatedAxes: scored.ungatedAxes
  }));

  const context = await gatherContext(editorViewOf(run.store), candidates);
  // One selection per subject, enforced in code before anything downstream
  // reads the decisions (measured 2026-08-20: four "pieces" of the same Hegel
  // work selected and numbered). A flipped selection carries its mechanical
  // reason, so it never consumes a motivation call.
  const slateDecisions = enforceOneSlotPerSubject(
    candidates,
    await judgeSlate(run.provider, candidates, context, {
      maxItems: run.maxItems,
      model: run.judgeModel
    })
  );

  // Every refusal is motivated, by a call that cannot stay silent (Céline,
  // 2026-08-19). The slate call selects; each unselected candidate then gets
  // its own forced call. Measured before this existed: the local judge ruled
  // only on what it selected, and all ten held-back items came back unruled.
  const decided = new Map(slateDecisions.map(d => [d.documentId, d]));
  const selectedSummaries = candidates
    .filter(c => decided.get(c.documentId)?.select)
    .map(c => ({ title: c.title, reason: decided.get(c.documentId)?.reason ?? '' }));
  const needMotivation = candidates.filter(c => {
    const d = decided.get(c.documentId);
    return !d?.select && !(d && !d.select && d.reason);
  });
  const motivated = await motivateRefusals(run.provider, needMotivation, selectedSummaries, {
    model: run.judgeModel
  });
  const decisions = [...slateDecisions.filter(d => d.select || d.reason), ...motivated];
  const editorial = assembleEditorial(candidates, decisions, run.maxItems);

  // Persist the surfaced — and only the surfaced (§6.2). The offer is recorded
  // in the same gesture, which is what keeps proposedAt honest.
  const at = now();
  for (const entry of editorial.digest) {
    const s = pool.get(entry.candidate.documentId);
    if (!s) continue;
    await run.store.putDocument({
      id: entry.candidate.documentId,
      url: s.scored.url,
      title: s.scored.title,
      topicId: entry.candidate.topicId,
      isOwned: false,
      firstFoundAt: at,
      publishedAt: s.scored.publishedAt,
      venue: null,
      engine: s.scored.engine,
      deletedAt: null
    });
    await run.store.putJudgment({
      documentId: entry.candidate.documentId,
      judge: 'spotter',
      score: s.scored.score,
      contribution: s.scored.contribution,
      gate: s.scored.gate,
      axes: s.scored.axes.map(a => ({
        axis: a.axis,
        kind: a.kind as 'contribution' | 'gate',
        score: a.score,
        reason: a.reason,
        ok: a.ok
      })),
      degraded: s.scored.degraded,
      model: run.scorerModel ?? 'default',
      policy: policyFingerprint(run.composition),
      cursor: null,
      assessedAt: at
    });
    await run.store.recordOffer({
      documentId: entry.candidate.documentId,
      topicId: entry.candidate.topicId,
      at,
      runAt: at,
      surface: run.surface
    });
  }

  return { editorial, reports, editorRound: { issued: issued.length, notIssued }, failedFunnels };
}

/**
 * A malformed budget falls to the default rather than to zero or to a
 * day-long run: the dial is the user's, the guard against a typo is ours.
 */
function clampBudget(n: number | undefined): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.min(200, Math.max(1, Math.round(n)));
}

async function funnel(
  run: DigestRun,
  adapter: SearchAdapter,
  q: string,
  recentlySeen: readonly string[],
  maxFetches = DEFAULT_RETRIEVAL_POLICY.maxFetches
): Promise<RetrievalReport> {
  return retrieve({
    query: { q, count: DEFAULT_RETRIEVAL_POLICY.maxCandidates },
    search: adapter,
    fetcher: run.fetcher,
    provider: run.provider,
    scorers: run.scorers,
    prefs: run.prefs,
    composition: run.composition,
    policy: { ...DEFAULT_RETRIEVAL_POLICY, maxFetches },
    recentlySeen,
    model: run.scorerModel,
    shouldStop: run.shouldStop
  });
}

async function recentOfferTitles(store: SpotterStore, days: number, nowIso: string): Promise<string[]> {
  const since = new Date(new Date(nowIso).getTime() - days * 86400000).toISOString();
  const offers = await store.offers(since);
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const o of offers) {
    if (seen.has(o.documentId)) continue;
    seen.add(o.documentId);
    const doc = await store.getDocument(o.documentId);
    if (doc) titles.push(doc.title);
    if (titles.length >= 40) break;
  }
  return titles;
}

/**
 * The composition policy, fingerprinted for the judgment record (§6.2): two
 * judgments with the same model and different weights must be tellable apart,
 * or the cache is not recomputable.
 */
function policyFingerprint(c: CompositionPolicy): string {
  const weights = Object.entries(c.weights)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `weights:${weights || 'none'}`;
}
