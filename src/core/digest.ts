import type { LlmProvider } from './llm/provider';
import type { SearchAdapter } from './search/adapter';
import type { DocumentFetcher, RetrievalReport, ScoredCandidate } from './retrieval';
import type { AxisScorer } from './axes/types';
import type { CompositionPolicy } from './compose';
import type { PreferenceDoc } from './prefs';
import type { SpotterStore } from './store/store';
import type { Surface } from './store/model';
import type { EditorialResult, EditorialCandidate } from './editorial';
import { retrieve, DEFAULT_RETRIEVAL_POLICY } from './retrieval';
import { assembleEditorial, gatherContext } from './editorial';
import { editorViewOf, documentIdFor } from './store/store';
import { judgeSlate } from './editorial-judge';
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
}

export async function runDigest(run: DigestRun): Promise<DigestOutcome> {
  const now = run.now ?? (() => new Date().toISOString());
  const reports: RetrievalReport[] = [];
  const pool = new Map<string, { scored: ScoredCandidate; topic: string | null }>();

  // The frontier: titles recently *offered* — never reads (§5.6, and the
  // ScoringContext comment). 60 days covers "have I had this lately" without
  // an unbounded read of the journal.
  const recentlySeen = await recentOfferTitles(run.store, 60, now());

  const collect = (report: RetrievalReport, topic: string | null) => {
    reports.push(report);
    for (const s of [...report.digest, ...report.belowCut]) {
      const id = documentIdFor(cleanUrl(s.url));
      if (!pool.has(id)) pool.set(id, { scored: s, topic });
    }
  };

  // Round one — Mode R per topic on each substrate, Mode B once.
  for (const topic of run.topics) {
    for (const adapter of run.search) {
      collect(await funnel(run, adapter, topic, recentlySeen), topic);
    }
  }
  if (run.feeds) collect(await funnel(run, run.feeds, '', recentlySeen), null);

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
    collect(await funnel(run, roundSubstrate, q.query.q, recentlySeen, 8), null);
  }

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
  const decisions = await judgeSlate(run.provider, candidates, context, {
    maxItems: run.maxItems,
    model: run.judgeModel
  });
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
      surface: run.surface
    });
  }

  return { editorial, reports, editorRound: { issued: issued.length, notIssued } };
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
    model: run.scorerModel
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
