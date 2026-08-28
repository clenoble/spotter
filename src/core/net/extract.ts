import type { Transport } from './transport';
import type { DocumentFetcher, FetchedDocument } from '../retrieval';

/**
 * Fetch a page and reduce it to text — promoted from the eval harness to a
 * product organ, as §5.2 said it should be: *"the harness and the engine share
 * it."*
 *
 * Two halves, deliberately separable. `htmlToText` is **pure** and lives in the
 * core because turning markup into prose is not a capability, it is arithmetic
 * on a string. `createFetcher` **receives** a `Transport` and never reaches for
 * one, which is the rule the capability guard enforces (§6.3).
 *
 * ⚠️ **The extraction is a heuristic and says so.** No dependency, no DOM, no
 * readability algorithm: it drops the obvious chrome, prefers a declared
 * content region, and flattens the rest. Page furniture leaks through on sites
 * that declare no `<article>` or `<main>`, and the funnel's own scores are
 * computed on whatever it produced. That is a known weakness of the *input*,
 * not of the axes, and mistaking one for the other would send anyone tuning
 * prompts to fix a problem living one layer up.
 */

export interface FetcherOptions {
  /** Below this, the extraction is treated as failed rather than thin. */
  readonly minChars?: number;
  readonly timeoutMs?: number;
  /**
   * Some sites serve bots an empty shell. Presenting as a browser is a choice
   * with a cost — it is the request a person would make, for a page nobody
   * asked to see — so it is a parameter rather than a silent default.
   */
  readonly userAgent?: string;
}

const DEFAULTS = {
  minChars: 400,
  timeoutMs: 15000,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
} as const;

/**
 * Build a fetcher from a host's transport.
 *
 * Returns `null` rather than throwing on every failure the funnel expects —
 * a dead link, a bot wall, a page that is all furniture. The funnel records
 * those as `unreadable`, which is a **plumbing** fact and belongs in its report
 * (§5.2, degree 2), not an exception that aborts a night's run.
 */
export function createFetcher(transport: Transport, options: FetcherOptions = {}): DocumentFetcher {
  const { minChars, timeoutMs, userAgent } = { ...DEFAULTS, ...options };

  return {
    async fetch(url: string): Promise<FetchedDocument | null> {
      try {
        // The timeout is passed, not assumed: "honoured by the host's
        // transport" used to be a comment over a `void`, and the first full
        // validation run hung on exactly that gap.
        const res = await transport(url, {
          headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
          timeoutMs
        });
        if (!res.ok) return null;

        const html = await res.text();
        const text = htmlToText(html);
        if (text.length < minChars) return null;

        return { url, title: titleOf(html), text };
      } catch {
        // A transport that threw is a page we could not read. Same outcome as a
        // 404 for the funnel's purposes, and distinguishing them here would put
        // a network taxonomy in a module about prose.
        return null;
      }
    }
  };
}

export function titleOf(html: string): string {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  return decodeEntities(raw).replace(/\s+/g, ' ').trim();
}

/**
 * Decode the entities a page can put in prose.
 *
 * ⚠️ *Found on the funnel's first real run, 2026-08-10: a digest title read
 * `Paying Attention: The Attention Economy &#8211; Berkeley Economic Review`.*
 * The decoding existed — inside `htmlToText`, inline — and `titleOf` did none
 * at all. **Two paths through the same problem, one of them fixed, and the
 * title is the half the reader actually sees.** Shared here so they cannot
 * drift again, and extended to numeric entities generally rather than the two
 * that had happened to come up.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => cp(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => cp(parseInt(dec, 10)))
    // Last, so a literal `&amp;#8211;` does not become a dash.
    .replace(/&amp;/g, '&');
}

function cp(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
}

/** Pure. Given the same markup it returns the same text, on any host. */
export function htmlToText(html: string): string {
  const h = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');

  // Prefer the page's own declared content region when it has one. When it does
  // not, this falls through to the body and the furniture comes with it.
  const region =
    h.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    h.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    h.match(/<body[\s\S]*?<\/body>/i)?.[0] ??
    h;

  const text = region
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(text)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
