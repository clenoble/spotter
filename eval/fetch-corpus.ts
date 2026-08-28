import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Build an eval corpus from curated URLs instead of the feed.
 *
 * Input (eval/corpus/urls.json): three arrays of URLs, one per bucket —
 *   { "clean": [...], "borderline": [...], "pollution": [...] }
 *
 *   npm run fetch-corpus                      # writes eval/corpus/from-urls.json
 *   npm run fetch-corpus -- --force           # re-fetch URLs already in the output
 *   npm run fetch-corpus -- --in=... --out=...
 *
 * Then: npm run eval -- --corpus=eval/corpus/from-urls.json
 *
 * Extraction is a deliberate heuristic (no deps): review the extracted text in
 * the output JSON and trim by hand where the page chrome leaked in. URLs that
 * fail (auth walls, JS-only pages) are reported — paste those texts manually.
 * This fetch→extract step is the first piece of Mode B/C ingestion (spec §5):
 * the eval tool and the future scan-for-value share it.
 */

interface UrlList {
  clean?: string[];
  borderline?: string[];
  pollution?: string[];
}

interface CorpusItem {
  id: string;
  authorName: string;
  text: string;
  label: { pollution: number };
  note?: string;
}

const BUCKET_VALUE: Record<string, number> = { clean: 10, borderline: 50, pollution: 90 };

const args = parseArgs(process.argv.slice(2));
const inPath = args.in ?? 'eval/corpus/urls.json';
const outPath = args.out ?? 'eval/corpus/from-urls.json';
const force = 'force' in args;

async function main(): Promise<void> {
  if (!existsSync(inPath)) {
    console.error(
      `\n✗ No input at ${inPath}.\n  Copy eval/corpus/urls.example.json to eval/corpus/urls.json and fill in your URLs.\n`
    );
    process.exit(1);
  }
  const lists = JSON.parse(readFileSync(inPath, 'utf8')) as UrlList;
  const existing: CorpusItem[] = existsSync(outPath)
    ? (JSON.parse(readFileSync(outPath, 'utf8')) as CorpusItem[])
    : [];
  const byId = new Map(existing.map(i => [i.id, i]));

  const failures: Array<{ url: string; bucket: string; reason: string }> = [];
  const items: CorpusItem[] = [];

  for (const bucket of ['clean', 'borderline', 'pollution'] as const) {
    for (const url of lists[bucket] ?? []) {
      const id = `url-${djb2(url)}`;
      const cached = byId.get(id);
      if (cached && !force) {
        // Keep the cached item but let a re-bucketed URL update its label.
        cached.label = { pollution: BUCKET_VALUE[bucket] };
        items.push(cached);
        console.log(`  cached   [${bucket}] ${url}`);
        continue;
      }
      try {
        const { text, title, host } = await fetchAndExtract(url);
        if (text.length < 200) throw new Error(`extracted only ${text.length} chars`);
        items.push({
          id,
          authorName: host,
          text: text.slice(0, 6000),
          label: { pollution: BUCKET_VALUE[bucket] },
          note: `${title ? title + ' — ' : ''}${url}`
        });
        console.log(`  fetched  [${bucket}] ${url} (${text.length} chars)`);
      } catch (err) {
        failures.push({
          url,
          bucket,
          reason: err instanceof Error ? err.message : String(err)
        });
        console.warn(`  ✗ failed [${bucket}] ${url}`);
      }
    }
  }

  writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf8');
  console.log(`\n${items.length} items → ${outPath}`);
  if (failures.length) {
    console.log(`\n${failures.length} URL(s) failed — paste their text into ${outPath} by hand:`);
    for (const f of failures) console.log(`  [${f.bucket}] ${f.url}\n      ${f.reason}`);
  }
  console.log(`\nReview the extracted text (page chrome can leak in), then:\n  npm run eval -- --corpus=${outPath}\n`);
}

async function fetchAndExtract(
  url: string
): Promise<{ text: string; title: string; host: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Some sites serve bots an empty shell; present as a normal browser.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return { text: htmlToText(html), title, host: new URL(res.url).hostname };
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html: string): string {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');

  // Prefer the page's main content region when one is declared.
  const region =
    h.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    h.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    h.match(/<body[\s\S]*?<\/body>/i)?.[0] ??
    h;

  return region
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? '';
  }
  return out;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
