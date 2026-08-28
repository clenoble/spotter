import {
  runDigest,
  createMemoryStore,
  createSearxngAdapter,
  createOpenAlexAdapter,
  createFeedsAdapter,
  createFetcher,
  createOllamaProvider,
  relevanceScorer,
  pollutionScorer,
  qualityScorer,
  noveltyScorer,
  challengeScorer,
  type PreferenceDoc
} from '../src/core/index';

/**
 * The whole night, headless: topics → funnels → the editor's round → the
 * judged slate → a finite digest. Same organs the extension runs, on a memory
 * store — the validation step for v0.1, and every number a measurement.
 *
 *   npx tsx eval/run-digest.ts "topic one" "topic two"
 */
const topics = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (topics.length === 0) topics.push('attention economy');
const searxngUrl = process.env.SEARXNG_URL ?? 'http://localhost:8888';

const transport = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }) =>
  fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000)
  });

const prefs: PreferenceDoc = {
  version: 1,
  topicsMore: topics,
  topicsLess: ['celebrity', 'sport'],
  tonePreferences: ['substantive'],
  authorsBoost: [],
  authorsMute: [],
  explorationRate: 0.2,
  explorationMode: 'mixed',
  customRules: [],
  feeds: [
    { url: 'https://legrandcontinent.eu/fr/feed/', name: 'Le Grand Continent' },
    { url: 'http://export.arxiv.org/rss/cs.CY', name: 'arXiv cs.CY' }
  ],
  examples: [],
  updatedAt: new Date().toISOString()
};

async function main(): Promise<void> {
  console.log(`\ntopics: ${topics.join(' · ')}`);
  const started = Date.now();

  const out = await runDigest({
    topics,
    search: [
      createSearxngAdapter({ baseUrl: searxngUrl, transport }),
      createOpenAlexAdapter({ transport })
    ],
    feeds: createFeedsAdapter({ feeds: prefs.feeds ?? [], transport }),
    fetcher: createFetcher(transport),
    provider: createOllamaProvider({ transport }),
    scorers: [relevanceScorer, qualityScorer, noveltyScorer, challengeScorer, pollutionScorer],
    prefs,
    composition: { weights: { relevance: 1, quality: 1, novelty: 0.7, challenge: 0.7 } },
    store: createMemoryStore(),
    surface: 'chrome',
    maxItems: 5
  });

  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  const totals = out.reports.reduce(
    (a, r) => ({
      searched: a.searched + r.counts.searched,
      triaged: a.triaged + r.counts.afterTriage,
      fetched: a.fetched + r.counts.fetched,
      scored: a.scored + r.counts.scored
    }),
    { searched: 0, triaged: 0, fetched: 0, scored: 0 }
  );
  console.log(
    `\n${out.reports.length} funnels · searched ${totals.searched} → triaged ${totals.triaged} → fetched ${totals.fetched} → scored ${totals.scored} · editor queries issued ${out.editorRound.issued} (cut ${out.editorRound.notIssued}) · ${minutes} min\n`
  );

  console.log(`DIGEST (${out.editorial.digest.length}):`);
  for (const e of out.editorial.digest) {
    const c = e.candidate;
    console.log(`\n  ${c.score.toFixed(0).padStart(3)}  ${c.title.slice(0, 76)}${c.degraded ? ' [degraded]' : ''}`);
    console.log(`       ${c.url.slice(0, 90)}`);
    if (e.outcome.kind === 'selected') console.log(`       editor: ${e.outcome.reason.slice(0, 86)}`);
  }

  console.log(`\nHELD BACK (${out.editorial.heldBack.length}):`);
  for (const e of out.editorial.heldBack.slice(0, 10)) {
    const o = e.outcome;
    const label =
      o.kind === 'refused'
        ? `refused: ${o.reason.slice(0, 60)}`
        : o.kind === 'beaten'
          ? `beaten${o.margin != null ? ` by ${o.margin.toFixed(1)}` : ''}`
          : 'unruled';
    console.log(`  ${e.candidate.score.toFixed(0).padStart(3)}  ${e.candidate.title.slice(0, 56)} — ${label}`);
  }
}

main().catch(err => {
  console.error('\n✗', err instanceof Error ? err.message : String(err), '\n');
  process.exit(1);
});
