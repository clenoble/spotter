import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDigest,
  createMemoryStore,
  createFetcher,
  documentIdFor,
  cleanUrl,
  type SearchAdapter,
  type SearchResult,
  type LlmProvider,
  type PreferenceDoc,
  type AxisScorer,
  type SpotterStore
} from '../src/core/index';

/**
 * Invariants for the digest orchestrator — the whole night, on fakes.
 *
 * These assert the persistence architecture (§6.2: only the surfaced enters
 * the base; the offer is recorded in the same gesture) and the accounting
 * (every funnel reports; the second round says what it cut). They assert
 * nothing about whether the digest is *good* — the judge here is a fake that
 * selects by a marker, because what is under test is the machine around the
 * judge, not the judgment.
 */

// No <title> in the fixture: the funnel rightly prefers the fetched page's own
// title to the search result's, and these tests steer the fake judge through
// markers in the result title — which a page title would silently replace.
// (Found by running, not by reading: the first version had one.)
const page = (body: string) =>
  `<body><article><p>${body} ${'x '.repeat(260)}</p></article></body>`;

const result = (url: string, title: string): SearchResult => ({
  url,
  title,
  snippet: '',
  publishedAt: null,
  engine: 'fake'
});

const adapterReturning = (results: SearchResult[]): SearchAdapter => ({
  id: 'fake',
  selfHosted: true,
  search: async () => results
});

/** Scores by a marker in the text; the judge selects titles marked PICK. */
const fakeScorer: AxisScorer = {
  axis: 'relevance',
  kind: 'contribution',
  score: async ctx => ({
    axis: 'relevance',
    score: ctx.content.text.includes('strong') ? 90 : 30,
    reason: 'fixture',
    ok: true
  })
};

const fakeJudgeProvider: LlmProvider = {
  generate: async (prompt: string) => {
    const ids = [...prompt.matchAll(/id: (\S+)\n {2}(PICK|SKIP)/g)];
    const decisions = ids.map(([, id, verdict]) => ({
      id,
      select: verdict === 'PICK',
      reason: verdict === 'PICK' ? 'earns the slot' : 'repeats'
    }));
    return JSON.stringify({ decisions });
  },
  chat: async () => ''
} as unknown as LlmProvider;

const prefs: PreferenceDoc = {
  version: 1,
  topicsMore: ['attention'],
  topicsLess: [],
  tonePreferences: [],
  authorsBoost: [],
  authorsMute: [],
  explorationRate: 0,
  explorationMode: 'mixed',
  customRules: [],
  updatedAt: '2026-08-10T00:00:00.000Z'
};

function makeRun(store: SpotterStore, results: SearchResult[], pages: Record<string, string>) {
  const transport = (async (url: string) => ({
    ok: url in pages,
    status: url in pages ? 200 : 404,
    text: async () => pages[url] ?? '',
    json: async () => ({})
  })) as never;
  return {
    topics: ['attention'],
    search: [adapterReturning(results)],
    fetcher: createFetcher(transport),
    provider: fakeJudgeProvider,
    scorers: [fakeScorer],
    prefs,
    composition: { weights: { relevance: 1 } },
    store,
    surface: 'chrome' as const,
    maxItems: 5,
    queryPolicy: { maxQueries: 0, intents: [] as never[] },
    now: () => '2026-08-10T06:00:00.000Z'
  };
}

test('only what the editor surfaced enters the base — the run report is not storage', async () => {
  const store = createMemoryStore();
  const results = [result('https://a.example/pick', 'PICK strong piece'), result('https://a.example/skip', 'SKIP strong other')];
  const pages = {
    'https://a.example/pick': page('strong claim'),
    'https://a.example/skip': page('strong claim')
  };

  const out = await runDigest(makeRun(store, results, pages));

  assert.equal(out.editorial.digest.length, 1);
  const pickedId = documentIdFor(cleanUrl('https://a.example/pick'));
  const skippedId = documentIdFor(cleanUrl('https://a.example/skip'));
  assert.ok(await store.getDocument(pickedId), 'the surfaced document is in the base');
  assert.equal(await store.getDocument(skippedId), null, 'the refused one is NOT — §6.2');
  assert.equal(await store.getJudgment(skippedId), null);
});

test('the offer is recorded in the same gesture, with topic and surface', async () => {
  const store = createMemoryStore();
  const results = [result('https://a.example/pick', 'PICK strong piece')];
  await runDigest(makeRun(store, results, { 'https://a.example/pick': page('strong') }));

  const offers = await store.offers('2026-01-01T00:00:00.000Z');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].surface, 'chrome');
  assert.equal(offers[0].topicId, 'attention');
  const doc = await store.getDocument(offers[0].documentId);
  assert.equal(doc?.signals.proposedAt, '2026-08-10T06:00:00.000Z', 'proposedAt moved with the offer');
});

test('the judgment carries judge, policy fingerprint, and its axes', async () => {
  const store = createMemoryStore();
  const results = [result('https://a.example/pick', 'PICK strong piece')];
  await runDigest(makeRun(store, results, { 'https://a.example/pick': page('strong') }));

  const j = await store.getJudgment(documentIdFor(cleanUrl('https://a.example/pick')));
  assert.equal(j?.judge, 'spotter');
  assert.equal(j?.policy, 'weights:relevance=1');
  assert.equal(j?.axes[0].axis, 'relevance');
});

test('an unreadable pool still yields a run, empty and accounted, never a crash', async () => {
  const store = createMemoryStore();
  const results = [result('https://a.example/gone', 'PICK vanished')];
  const out = await runDigest(makeRun(store, results, {}));

  assert.equal(out.editorial.digest.length, 0);
  assert.equal(out.reports[0].unreadable.length, 1, 'the loss is in the report, not swallowed');
  assert.equal((await store.offers('2026-01-01T00:00:00.000Z')).length, 0, 'nothing surfaced, nothing offered');
});

test('a document offered twice across runs is one document with two offers', async () => {
  const store = createMemoryStore();
  const results = [result('https://a.example/pick', 'PICK strong piece')];
  const pages = { 'https://a.example/pick': page('strong') };

  await runDigest(makeRun(store, results, pages));
  const second = { ...makeRun(store, results, pages), now: () => '2026-08-11T06:00:00.000Z' };
  await runDigest(second);

  const offers = await store.offers('2026-01-01T00:00:00.000Z');
  assert.equal(offers.length, 2, 'repetition is the signal — two rows');
  const doc = await store.getDocument(offers[0].documentId);
  assert.equal(doc?.signals.proposedAt, '2026-08-10T06:00:00.000Z', 'earliest offer wins the cache');
});

test('the digest is a ceiling: a thin day surfaces less and persists less', async () => {
  const store = createMemoryStore();
  const results = [
    result('https://a.example/p1', 'PICK strong one'),
    result('https://a.example/s1', 'SKIP strong two'),
    result('https://a.example/s2', 'SKIP strong three')
  ];
  const pages = Object.fromEntries(results.map(r => [r.url, page('strong')]));
  const out = await runDigest(makeRun(store, results, pages));

  assert.equal(out.editorial.digest.length, 1, 'nothing promoted to fill the ceiling');
  assert.equal(out.editorial.heldBack.length, 2);
  assert.equal((await store.offers('2026-01-01T00:00:00.000Z')).length, 1);
});
