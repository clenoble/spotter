import type { SearchAdapter, SearchQuery, SearchResult, Transport } from './adapter';
import { cleanUrl } from './adapter';
import { decodeEntities } from '../net/extract';

/**
 * Mode B — declared sources, read through their feeds (spec §5).
 *
 * The measurement that motivates this (§5.1.1): the sources whose business is
 * access wall the fetcher *and* publish no usable feed, while open
 * repositories, preprints and editorial publications publish feeds **with
 * text** — sometimes readable exactly where their item URLs are not (a
 * repository whose landing page is a PDF). For those families the feed is not
 * a convenience, it is the better acquisition path for the same document.
 *
 * Shaped as a `SearchAdapter` so the funnel needs no second entrance: triage,
 * scoring and the editorial pass treat a feed item like any candidate.
 * `search()` ignores the query text — a feed is not queried, it is read — and
 * honours `count`. The description travels as `snippet`, which under the
 * scored-on-abstract ruling (§5.1.1) means a feed item whose page cannot be
 * fetched is still scoreable, **declared as an abstract**.
 *
 * Parsing is deliberately tolerant and dependency-free: RSS 2.0 and Atom, the
 * fields the funnel actually uses, nothing else. A malformed feed yields the
 * items that could be read rather than an exception that kills the run —
 * and a feed that yields nothing is visible in the run report's counts.
 */

export interface FeedSource {
  /** The feed URL itself, not the site. */
  url: string;
  /** Shown as the engine, so a digest entry can say which source found it. */
  name: string;
}

export interface FeedsConfig {
  feeds: readonly FeedSource[];
  transport: Transport;
}

export function createFeedsAdapter(config: FeedsConfig): SearchAdapter {
  return {
    id: 'feeds',
    // Direct fetches of user-declared sources: no third party's account.
    selfHosted: true,

    async search(query: SearchQuery): Promise<SearchResult[]> {
      const all: SearchResult[] = [];
      for (const feed of config.feeds) {
        try {
          const res = await config.transport(feed.url, {
            headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }
          });
          if (!res.ok) continue; // this feed's absence shows in the counts
          all.push(...parseFeed(await res.text(), feed.name));
        } catch {
          continue;
        }
      }
      // Newest first across sources, undated items last — a feed reader's sort.
      all.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
      return query.count ? all.slice(0, query.count) : all;
    }
  };
}

/** Exported for the invariants; not part of the adapter surface. */
export function parseFeed(xml: string, sourceName: string): SearchResult[] {
  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi)];
  const out: SearchResult[] = [];

  for (const [block] of items) {
    const url = itemLink(block);
    if (!url) continue;
    const title = field(block, 'title');
    if (!title) continue;

    out.push({
      url: cleanUrl(url),
      title,
      snippet: firstOf(block, ['content:encoded', 'description', 'summary', 'content']),
      publishedAt: firstOf(block, ['pubDate', 'published', 'updated', 'dc:date']) || null,
      engine: `feed:${sourceName}`
    });
  }
  return out;
}

/** RSS: `<link>text</link>`. Atom: `<link href="…">`, preferring rel=alternate. */
function itemLink(block: string): string | null {
  const alt = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i)?.[1];
  if (alt) return alt;
  const href = block.match(/<link[^>]*href="([^"]+)"/i)?.[1];
  if (href) return href;
  const text = field(block, 'link');
  return text || null;
}

function field(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return decodeEntities(
    m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function firstOf(block: string, tags: readonly string[]): string {
  for (const t of tags) {
    const v = field(block, t);
    if (v) return v;
  }
  return '';
}
