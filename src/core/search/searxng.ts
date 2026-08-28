import type { SearchAdapter, SearchQuery, SearchResult, Transport } from './adapter';
import { cleanUrl } from './adapter';

export interface SearxngConfig {
  /** Base URL of the user's own instance, e.g. `http://localhost:8080`. */
  baseUrl: string;
  /** How the query leaves the machine. Supplied by the host — see `Transport`. */
  transport: Transport;
}

/**
 * SearXNG — the self-hosted substrate (spec §5.1).
 *
 * A meta-search the user runs themselves: no key, no cost, no storage clause,
 * and `url` is the source's own address rather than an internal redirect
 * (confirmed against the MainResult schema, where `url` and `parsed_url` are
 * kept in sync).
 *
 * **Self-hosted means self-hosted.** Public instances are not a fallback: most
 * disable JSON output, and probing three of them found one that answers
 * `format=json` with a *200 and an HTML body* — so a naive client parses a web
 * page as JSON and fails somewhere confusing — while the other two rate-limited
 * on the first request. Hence `looksLikeHtml` below, which turns that trap into
 * a sentence the user can act on.
 *
 * **The operator's configuration decides whether requirement 1 holds.** SearXNG
 * inherits the behaviour of whatever engines it federates; pointed at a
 * personalising engine it hands back a personalised bubble through a neutral
 * front door. That is a setup concern this adapter cannot enforce, and it
 * belongs in the setup instructions rather than in a silent assumption.
 */
export function createSearxngAdapter(config: SearxngConfig): SearchAdapter {
  const base = config.baseUrl.replace(/\/+$/, '');

  return {
    id: 'searxng',
    selfHosted: true,

    async search(query: SearchQuery): Promise<SearchResult[]> {
      const params = new URLSearchParams({ q: query.q, format: 'json' });
      if (query.language) params.set('language', query.language);
      if (query.freshness) params.set('time_range', TIME_RANGE[query.freshness]);

      const res = await config.transport(`${base}/search?${params}`, {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? `searxng ${res.status}: this instance has JSON output disabled — ` +
              `add "json" to search.formats in its settings.yml`
            : `searxng ${res.status}: ${await res.text()}`
        );
      }

      const body = await res.text();
      if (looksLikeHtml(body)) {
        throw new Error(
          'searxng returned HTML where JSON was requested — the instance has ' +
            'JSON output disabled and fell back to its web page rather than erroring'
        );
      }

      let data: SearxngResponse;
      try {
        data = JSON.parse(body) as SearxngResponse;
      } catch {
        throw new Error('searxng returned a body that is neither JSON nor HTML');
      }

      const results = (data.results ?? []).map(toResult);
      return query.count ? results.slice(0, query.count) : results;
    }
  };
}

const TIME_RANGE: Record<NonNullable<SearchQuery['freshness']>, string> = {
  day: 'day',
  // SearXNG offers day / month / year only; a week rounds to the nearest
  // bound it actually supports rather than being silently dropped.
  week: 'month',
  month: 'month',
  year: 'year'
};

function toResult(r: SearxngResult): SearchResult {
  return {
    url: cleanUrl(r.url ?? ''),
    title: (r.title ?? '').trim(),
    snippet: (r.content ?? '').trim(),
    publishedAt: r.publishedDate ?? null,
    engine: r.engine ?? r.engines?.[0] ?? 'searxng'
  };
}

/** Cheap and deliberate: we only need to tell a web page from a JSON document. */
function looksLikeHtml(body: string): boolean {
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

interface SearxngResponse {
  results?: SearxngResult[];
}

interface SearxngResult {
  url?: string;
  title?: string;
  content?: string;
  publishedDate?: string | null;
  engine?: string;
  engines?: string[];
}
