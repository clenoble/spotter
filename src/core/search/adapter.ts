/**
 * The search substrate, behind one interface (spec §5.1).
 *
 * Two backends ship — one self-hosted, one cloud — because self-hosted-only
 * would exclude most users and a sovereignty guarantee nobody can meet is a
 * guarantee for nobody. Both are bound by the same three requirements: no
 * personalisation, no forced advertising, and **resolvable destination URLs**.
 *
 * That third one is not a preference. A result whose target we cannot resolve
 * and show is a result we cannot honestly surface (§1.2), and it fails triage
 * before it costs an LLM call. It is also not hypothetical: an LLM's own
 * grounding citations are frequently opaque, expiring redirects whose terms
 * forbid resolving them — measured next door on Gemini.
 */

/** One result, reduced to what triage and the digest actually need. */
export interface SearchResult {
  /** The destination URL. Never a provider redirect — see `looksResolvable`. */
  url: string;
  title: string;
  /**
   * Provider snippet. **Triage input only — never persisted** (§5.2). Keeping a
   * provider's expression is both a licensing tail and the same act as storing
   * raw post text, which this project already refuses.
   */
  snippet: string;
  /** Publication or crawl date when the provider gives one; many do not. */
  publishedAt: string | null;
  /** Which engine produced it — for the user's benefit, and for debugging. */
  engine: string;
  /**
   * Structured facts the provider states about the document, where it states
   * any. Web engines give almost none; academic sources give a great deal, and
   * that is the point of having them (§5.1) — these feed the metadata triage in
   * §5.2 as *rules*, before any fetch and before any LLM call.
   *
   * Facts only. Nothing here is a judgment, and triage must not turn them into
   * one: `retracted` is grounds for a rule, `citedBy` is not grounds for a score.
   */
  signals?: {
    /**
     * Citation count — a fact about reception, and **structurally unavailable
     * for exactly the material Spotter wants**. Citations accrue over years, so
     * anything published recently reads as zero regardless of quality. Using it
     * as a proxy for worth would systematically bury the new, which is the
     * opposite of the job.
     *
     * OpenAlex's age-normalised alternatives do not rescue it: measured on
     * papers from the last three months, `fwci` and the citation percentiles
     * are null, zero, or flatly contradictory (a chapter with 25 citations
     * scoring in the 0.0005 percentile). Carried as a fact for established
     * work; never a gate, never a score, and never a tiebreak on recent items.
     */
    citedBy?: number;
    /** Formally retracted. Grounds to drop, never to demote-and-keep. */
    retracted?: boolean;
    /** Journal, conference or publisher. */
    venue?: string;
    authors?: string[];
    openAccess?: boolean;
    /** `article`, `preprint`, `book-chapter`, … as the provider names it. */
    type?: string;
  };
}

export interface SearchQuery {
  q: string;
  /** Upper bound on results wanted. Providers cap this their own way. */
  count?: number;
  /** ISO 639-1, when the provider supports it. */
  language?: string;
  /** Restrict to recent material: the provider's nearest equivalent. */
  freshness?: 'day' | 'week' | 'month' | 'year';
}

export interface SearchAdapter {
  readonly id: string;
  /** True when results reach the user's machine without a third party's account. */
  readonly selfHosted: boolean;
  search(query: SearchQuery): Promise<SearchResult[]>;
}

/**
 * `Transport` lives in `net/` — it has two consumer families now (search
 * adapters and LLM providers), and a shared capability parked inside one of its
 * consumers is the sort of thing nobody moves until it has misled someone.
 */
export type { Transport, TransportInit, TransportResponse } from '../net/transport';

/**
 * Would this URL survive being handed to the user?
 *
 * Rejects what cannot be honestly surfaced: non-http(s) schemes, and known
 * redirector hosts whose targets expire or may not be resolved. This is a
 * denylist, so it is *not* a guarantee — it catches the cases we know about.
 * The durable protection is choosing substrates that return direct URLs at all
 * (§5.1), not filtering after the fact.
 */
const OPAQUE_REDIRECTORS = [
  'vertexaisearch.cloud.google.com', // Gemini grounding: ~30-day expiry, resolving forbidden
  'www.google.com/url',
  'duckduckgo.com/l/',
  'r.search.yahoo.com',
  'out.reddit.com'
];

export function looksResolvable(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const hostAndPath = `${parsed.hostname}${parsed.pathname}`;
  return !OPAQUE_REDIRECTORS.some(r => hostAndPath.startsWith(r));
}

/**
 * Drop what we cannot surface, and say how much was dropped rather than
 * quietly returning a shorter list — a silent filter is the thing §1.1 refuses.
 */
export function keepResolvable(results: readonly SearchResult[]): {
  kept: SearchResult[];
  dropped: SearchResult[];
} {
  const kept: SearchResult[] = [];
  const dropped: SearchResult[] = [];
  for (const r of results) (looksResolvable(r.url) ? kept : dropped).push(r);
  return { kept, dropped };
}

/**
 * Strip tracking parameters before a URL is stored or shown. Two reasons: a
 * campaign id ties the link to whoever received the mail it came from, and two
 * URLs differing only by tracking are the same document for de-duplication.
 */
const TRACKING_PARAMS = /^(utm_|mc_|fbclid$|gclid$|igshid$|ref_?$|s_cid$|ncid$|cmpid$)/i;

export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}
