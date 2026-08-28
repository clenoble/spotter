import type { AxisScorer } from './axes/types';
import type { CompositionPolicy } from './compose';
import type { Content } from './content';
import type { LlmProvider } from './llm/provider';
import type { PreferenceDoc } from './prefs';
import type { SearchAdapter, SearchQuery, SearchResult } from './search/adapter';
import { cleanUrl, looksResolvable } from './search/adapter';
import { classifyAddress } from './net/address';
import { scoreAll, type AxisFailure } from './engine';

/**
 * The candidate funnel (spec §5.2).
 *
 *   query → search (cheap, many)
 *         → triage on metadata alone (no fetch, no LLM)
 *         → fetch + extract the survivors
 *         → score on the axes (expensive, few)
 *         → compose, take the top N
 *
 * Two properties this owes the rest of the design.
 *
 * **Every stage reports what it dropped.** Retrieval discards most of what it
 * sees — that is the product — but a funnel that quietly narrows is a silent
 * filter, which §1.1 refuses. `RetrievalReport` carries a count for each stage
 * and keeps the items that were scored and lost, so "show me what you held
 * back, and why" can be answered from it.
 *
 * **Triage is rules, not a second ranker.** It removes what cannot be surfaced
 * or is plainly redundant, and it never judges worth — judging is what the axes
 * are for, after a fetch, where the reasoning is inspectable. A cheap scorer
 * hidden in the triage step would be exactly the opaque filter this project
 * exists to refuse, and it would do its damage before anything could explain it.
 */

/** A document fetched and reduced to text — the host performs this. */
export interface FetchedDocument {
  url: string;
  title: string;
  text: string;
}

/**
 * Fetching is a *host* capability, not a core one: the network policy, the CORS
 * surface and the extraction live where the credentials do (§6).
 * Returning `null` means "could not read this one" — not an error worth
 * aborting the night's run for.
 */
export interface DocumentFetcher {
  fetch(url: string): Promise<FetchedDocument | null>;
}

export interface RetrievalPolicy {
  /** Size of the digest. Default 5, the user's to change (§5.5). */
  count: number;
  /** How many search results to consider at all. */
  maxCandidates: number;
  /** Hard ceiling on fetch-and-score work — the cost envelope, made explicit. */
  maxFetches: number;
}

export const DEFAULT_RETRIEVAL_POLICY: RetrievalPolicy = {
  count: 5,
  maxCandidates: 40,
  maxFetches: 20
};

/**
 * The reader stopped the run. Not a failure: nothing broke, someone decided.
 * Thrown from the stop checkpoints (between funnels, between candidates) when
 * the host's `shouldStop` capability says so — and rethrown past every
 * per-funnel catch, because a decision must never be recorded as a dead
 * substrate.
 */
export class CancelledError extends Error {
  constructor() {
    super("run interrupted at the reader's request — nothing was kept, and nothing will relaunch itself");
    this.name = 'CancelledError';
  }
}

export interface ScoredCandidate {
  url: string;
  title: string;
  publishedAt: string | null;
  engine: string;
  score: number;
  contribution: number;
  gate: number;
  axes: Array<{ axis: string; kind: string; score: number; reason: string; ok: boolean }>;
  /**
   * The score was computed from what was available; at least one axis could not
   * judge. The rank is honest about what it *is* — a ranking on the axes that
   * worked — and this flag says so rather than letting it pass for a full one.
   */
  degraded: boolean;
  /**
   * Gate axes that could not be evaluated, by name.
   *
   * This is the one the editorial pass (§5.6) reads. A candidate here is
   * competing for a slot **without having been checked** by these gates —
   * pollution, say. Whether that is acceptable is not a per-item rule, because
   * the answer depends on what else is competing: an unchecked item beside four
   * strong verified ones is a different question from an unchecked item on a
   * thin day. Only the editor sees the whole slate, so the editor decides.
   */
  ungatedAxes: string[];
  failures: AxisFailure[];
  /**
   * What the axes actually read (Céline's ruling, 2026-08-10). `article` is the
   * fetched page; `abstract` is the provider's own summary — OpenAlex's
   * reconstructed abstract, a feed's description — used when the fetch failed
   * but a real summary existed. **Declared all the way to the digest, never
   * silent**: a verdict about an abstract presented as a verdict about the
   * article is the claim this whole design exists to prevent, and an abstract
   * arriving *as an abstract* is knowably thin where a landing page is
   * unpredictably thin. The 80% acquisition wall (§5.1.1) is why this exists.
   */
  scoredOn: 'article' | 'abstract';
}

export type TriageReason =
  | 'unresolvable'
  | 'unsafe-address'
  | 'duplicate'
  | 'no-title'
  | 'retracted'
  | 'over-budget';

export interface RetrievalReport {
  query: string;
  /** What the user is shown. */
  digest: ScoredCandidate[];
  /** Scored but below the cut — the rest of the night's work, recoverable. */
  belowCut: ScoredCandidate[];
  /** Dropped before any fetch, with the rule that dropped each one. */
  triaged: Array<{ url: string; title: string; reason: TriageReason }>;
  /** Survived triage but could not be read. */
  unreadable: string[];
  counts: {
    searched: number;
    afterTriage: number;
    fetched: number;
    scored: number;
  };
}

export interface RetrievalRun {
  query: SearchQuery;
  search: SearchAdapter;
  fetcher: DocumentFetcher;
  provider: LlmProvider;
  scorers: readonly AxisScorer[];
  prefs: PreferenceDoc;
  composition: CompositionPolicy;
  policy?: RetrievalPolicy;
  /** Titles recently offered — offers, never reads (see `ScoringContext`). */
  recentlySeen?: readonly string[];
  /** Host-supplied stop capability — polled between candidates. */
  shouldStop?: () => boolean;
  /** Model id for every axis, when the host has chosen one. */
  model?: string;
}

/**
 * Below this, a snippet is a teaser, not a summary — scoring it would judge a
 * sentence and call it the document.
 */
const MIN_ABSTRACT_CHARS = 200;

export async function retrieve(run: RetrievalRun): Promise<RetrievalReport> {
  const policy = run.policy ?? DEFAULT_RETRIEVAL_POLICY;

  const found = await run.search.search({
    ...run.query,
    count: run.query.count ?? policy.maxCandidates
  });

  const { kept, triaged } = triage(found, policy.maxFetches);

  const scored: ScoredCandidate[] = [];
  const unreadable: string[] = [];

  let fetched = 0;
  for (const candidate of kept) {
    // The candidate boundary is the stop grain: fine enough that a cancel
    // lands within minutes, coarse enough that no judgment is half-written.
    if (run.shouldStop?.()) throw new CancelledError();
    const doc = await run.fetcher.fetch(candidate.url);
    if (doc) fetched++;

    // Fetch failed. If the provider supplied a real summary — OpenAlex's
    // reconstructed abstract, a feed's description — score that, declared as
    // such, rather than dropping the candidate. The floor keeps a one-line
    // teaser from posing as a summary.
    const basis: FetchedDocument | null =
      doc ?? (candidate.snippet.trim().length >= MIN_ABSTRACT_CHARS
        ? { url: candidate.url, title: candidate.title, text: candidate.snippet }
        : null);

    if (!basis) {
      unreadable.push(candidate.url);
      continue;
    }
    const result = await scoreAll(
      {
        content: toContent(candidate, basis),
        prefs: run.prefs,
        recentlySeen: run.recentlySeen,
        models: run.model
          ? Object.fromEntries(run.scorers.map(s => [s.axis, run.model]))
          : undefined
      },
      run.provider,
      run.scorers,
      run.composition
    );
    scored.push({ ...toScored(candidate, basis, result), scoredOn: doc ? 'article' : 'abstract' });
  }

  // Ties broken by URL so a run is reproducible rather than dependent on the
  // order the provider happened to return.
  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  return {
    query: run.query.q,
    digest: scored.slice(0, policy.count),
    belowCut: scored.slice(policy.count),
    triaged,
    unreadable,
    counts: {
      searched: found.length,
      afterTriage: kept.length,
      fetched,
      scored: scored.length
    }
  };
}

/**
 * Metadata-only rules. Each drop names the rule that made it, because a funnel
 * that reports "40 in, 12 out" without saying why is not inspectable.
 */
function triage(
  results: readonly SearchResult[],
  maxFetches: number
): { kept: SearchResult[]; triaged: RetrievalReport['triaged'] } {
  const kept: SearchResult[] = [];
  const triaged: RetrievalReport['triaged'] = [];
  const seen = new Set<string>();

  for (const r of results) {
    const url = cleanUrl(r.url);
    const note = (reason: TriageReason) => triaged.push({ url: r.url, title: r.title, reason });

    if (!looksResolvable(url)) {
      note('unresolvable');
    } else if (!classifyAddress(url).safe) {
      // A *different* question from resolvability, so a different reason.
      // `unresolvable` asks whether the link can honestly be shown; this asks
      // whether fetching it reaches somewhere it should not. A result URL is
      // untrusted input — anyone who can get a page indexed influences what
      // comes back — and this funnel fetches what comes back.
      //
      // Mechanical, not a judgment about a source (§5.2), so it stays in the
      // run report and never enters the persisted window.
      note('unsafe-address');
    } else if (r.signals?.retracted) {
      // A fact the provider states, not a judgment we formed — so it belongs
      // in triage. And it is a drop rather than a demotion: a retracted paper
      // is not weak evidence, it is withdrawn evidence.
      note('retracted');
    } else if (seen.has(url)) {
      // Same document reached by two engines, or by two tracking variants of
      // one link — `cleanUrl` is what makes those collapse.
      note('duplicate');
    } else if (!r.title.trim()) {
      note('no-title');
    } else if (kept.length >= maxFetches) {
      // The budget is a rule like any other, and it is *reported*: a silent cap
      // reads as "we looked at everything", which would be a lie.
      note('over-budget');
    } else {
      seen.add(url);
      kept.push({ ...r, url });
    }
  }
  return { kept, triaged };
}

function toContent(candidate: SearchResult, doc: FetchedDocument): Content {
  return {
    id: doc.url,
    platform: 'web',
    authorHandle: '',
    authorName: hostOf(doc.url),
    text: doc.text,
    mediaTypes: [],
    postedAt: candidate.publishedAt
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// `scoredOn` is the caller's to set — only the fetch loop knows whether the
// basis was the page or the provider's abstract.
function toScored(
  candidate: SearchResult,
  doc: FetchedDocument,
  result: Awaited<ReturnType<typeof scoreAll>>
): Omit<ScoredCandidate, 'scoredOn'> {
  return {
    url: doc.url,
    // The provider's snippet is triage input and is deliberately not carried
    // any further — what the digest stores is our judgment (§5.2).
    title: doc.title || candidate.title,
    publishedAt: candidate.publishedAt,
    engine: candidate.engine,
    score: result.score,
    contribution: result.contribution,
    gate: result.gate,
    axes: Object.values(result.vector)
      .filter((a): a is NonNullable<typeof a> => a !== undefined)
      .map(a => ({ axis: a.axis, kind: kindOf(a.axis), score: a.score, reason: a.reason, ok: a.ok })),
    degraded: result.degraded,
    ungatedAxes: result.failures.filter(f => f.axisKind === 'gate').map(f => f.axis),
    failures: result.failures
  };
}

const GATES = new Set(['pollution', 'calibration']);
const kindOf = (axis: string): string => (GATES.has(axis) ? 'gate' : 'contribution');
