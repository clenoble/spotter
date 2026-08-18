import type { SearchAdapter, SearchQuery, SearchResult, Transport } from './adapter';
import { cleanUrl } from './adapter';

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export interface BraveConfig {
  apiKey: string;
  /** How the query leaves the machine. Supplied by the host — see `Transport`. */
  transport: Transport;
}

/**
 * Brave Search — the cloud substrate (spec §5.1).
 *
 * Independent index, documented API, and `url` is the source's own address.
 * Rich triage metadata: `description`, `page_age`, `language`, plus a
 * `freshness` filter — which is most of what §5.2's metadata triage wants.
 *
 * **Two things the user should be told before they choose it.** Their key means
 * queries reach one company tied to an account, and under §5.3 those queries
 * are derived from their own declared topics — so the query log is a portrait
 * of what they want to know, a heavier disclosure than handing over a document
 * to be scored. And Brave's documentation says storing results in whole or part
 * needs a plan granting storage rights; we never test that clause, because the
 * funnel keeps only our own judgment and the URL (§5.2).
 *
 * *Unverified*: the API agreement lives behind the developer dashboard and is
 * not publicly readable. The design avoids depending on how it reads.
 */
export function createBraveAdapter(config: BraveConfig): SearchAdapter {
  return {
    id: 'brave',
    selfHosted: false,

    async search(query: SearchQuery): Promise<SearchResult[]> {
      const params = new URLSearchParams({ q: query.q });
      // Brave caps a page at 20; asking for more silently returns 20, so clamp
      // here where it is visible rather than wonder later why 50 became 20.
      if (query.count) params.set('count', String(Math.min(query.count, 20)));
      if (query.language) params.set('search_lang', query.language);
      if (query.freshness) params.set('freshness', FRESHNESS[query.freshness]);

      const res = await config.transport(`${ENDPOINT}?${params}`, {
        headers: {
          accept: 'application/json',
          'x-subscription-token': config.apiKey
        }
      });
      if (!res.ok) {
        throw new Error(
          res.status === 429
            ? 'brave 429: rate limit or monthly credit exhausted'
            : `brave ${res.status}: ${await res.text()}`
        );
      }

      const data = (await res.json()) as BraveResponse;
      return (data.web?.results ?? []).map(toResult);
    }
  };
}

const FRESHNESS: Record<NonNullable<SearchQuery['freshness']>, string> = {
  day: 'pd',
  week: 'pw',
  month: 'pm',
  year: 'py'
};

function toResult(r: BraveResult): SearchResult {
  return {
    url: cleanUrl(r.url ?? ''),
    title: (r.title ?? '').trim(),
    snippet: (r.description ?? '').trim(),
    // `page_age` is an ISO timestamp when present; `age` is a human string
    // ("2 days ago") that we deliberately do not try to parse into a date.
    publishedAt: r.page_age ?? null,
    engine: 'brave'
  };
}

interface BraveResponse {
  web?: { results?: BraveResult[] };
}

interface BraveResult {
  url?: string;
  title?: string;
  description?: string;
  page_age?: string;
  age?: string;
  language?: string;
}
