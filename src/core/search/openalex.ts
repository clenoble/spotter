import type { SearchAdapter, SearchQuery, SearchResult, Transport } from './adapter';

const ENDPOINT = 'https://api.openalex.org/works';

export interface OpenAlexConfig {
  /**
   * Optional. Supplying an address joins OpenAlex's "polite pool", which is
   * faster and more reliably available — at the cost of telling them who is
   * asking. **Left empty by default on purpose**: the anonymous pool works, and
   * the user should choose to be identified rather than discover they were.
   * This is §6.1's shape again, at a much smaller scale.
   */
  mailto?: string;
  /** How the query leaves the machine. Supplied by the host — see `Transport`. */
  transport: Transport;
}

/**
 * OpenAlex — the academic substrate (spec §5.1).
 *
 * Different in kind from a web engine, not merely in subject. It returns
 * *structured records* rather than a title and a snippet, which changes the
 * economics of §5.2's funnel: publication date, venue, authors, citation count
 * and retraction status all arrive **before any fetch and before any LLM call**,
 * so triage can act on facts instead of guesses.
 *
 * It also satisfies the three hard requirements about as cleanly as anything
 * can: no personalisation and no advertising by construction, and the DOI is
 * the most durable resolvable URL there is — the exact opposite of the expiring
 * redirects that made §5.4's fourth guard necessary.
 *
 * ⚠️ **Its recent slice is noisier than its reputation suggests.** Probing the
 * last three months returns a great deal of self-published and preprint
 * material — Zenodo and Kaggle appear as "venues" — so the academic family is
 * high signal for *established* work and much less so for the recency window
 * this product actually cares about. `venue` and `type` are the facts that
 * discriminate there; `citedBy` cannot, because it has not had time to exist.
 *
 * Free, open, and needs no key, which is why it is the first adapter verified
 * against its real provider rather than written from documentation alone.
 */
export function createOpenAlexAdapter(config: OpenAlexConfig): SearchAdapter {
  return {
    id: 'openalex',
    // Not the user's own machine, but no account, no key, and nothing to tie a
    // query to a person unless they opt into `mailto`.
    selfHosted: false,

    async search(query: SearchQuery): Promise<SearchResult[]> {
      const params = new URLSearchParams({
        search: query.q,
        'per-page': String(Math.min(query.count ?? 25, 200))
      });
      if (config.mailto) params.set('mailto', config.mailto);

      const filters: string[] = [];
      if (query.language) filters.push(`language:${query.language}`);
      if (query.freshness) filters.push(`from_publication_date:${sinceDate(query.freshness)}`);
      if (filters.length) params.set('filter', filters.join(','));

      const res = await config.transport(`${ENDPOINT}?${params}`, {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`openalex ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as OpenAlexResponse;
      return (data.results ?? []).map(toResult);
    }
  };
}

/**
 * OpenAlex filters on a date, not a window. Computed from the caller's clock:
 * the alternative is asking the API what day it is, which it does not offer.
 */
function sinceDate(freshness: NonNullable<SearchQuery['freshness']>): string {
  const days = { day: 1, week: 7, month: 31, year: 365 }[freshness];
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function toResult(w: OpenAlexWork): SearchResult {
  return {
    // Order matters: the DOI outlives the landing page, which outlives an OA
    // mirror. We hand the user the most durable address we have, not the most
    // convenient one — a link that still resolves in a year is the point.
    url: w.doi ?? w.primary_location?.landing_page_url ?? w.open_access?.oa_url ?? w.id ?? '',
    title: (w.display_name ?? w.title ?? '').trim(),
    snippet: abstractOf(w),
    publishedAt: w.publication_date ?? null,
    engine: 'openalex',
    signals: {
      citedBy: w.cited_by_count,
      retracted: w.is_retracted,
      venue: w.primary_location?.source?.display_name,
      authors: (w.authorships ?? []).map(a => a.author?.display_name ?? '').filter(Boolean),
      openAccess: w.open_access?.is_oa,
      type: w.type
    }
  };
}

/**
 * OpenAlex ships abstracts as an inverted index — `{word: [positions]}` — for
 * licensing reasons, so the prose has to be rebuilt before it is of any use as
 * a triage snippet.
 */
function abstractOf(w: OpenAlexWork): string {
  const index = w.abstract_inverted_index;
  if (!index) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

interface OpenAlexResponse {
  results?: OpenAlexWork[];
}

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  title?: string;
  display_name?: string;
  publication_date?: string;
  language?: string;
  type?: string;
  cited_by_count?: number;
  is_retracted?: boolean;
  open_access?: { is_oa?: boolean; oa_url?: string | null };
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string } | null;
  } | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
  abstract_inverted_index?: Record<string, number[]>;
}
