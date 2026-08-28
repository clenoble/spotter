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

test('a candidate the slate ignored is force-motivated, never left unruled', async () => {
  // The measured failure this encodes (2026-08-18 run): the local judge ruled
  // only on what it selected, and all ten held-back items came back unruled.
  // "An instruction whose execution depends on a decision does not execute" is
  // the diagnosis — the fix is the anti-jeu's: make the gesture unavoidable.
  // A call about ONE candidate cannot stay silent about it.
  const silentSlateProvider = {
    generate: async (prompt: string) => {
      if (prompt.includes('NOT selected')) {
        return '{"reason": "outclassed by the selection on the same subject"}';
      }
      // The slate call: rule ONLY on what is picked — the real model's habit.
      const ids = [...prompt.matchAll(/id: (\S+)\n {2}PICK/g)].map(([, id]) => id);
      return JSON.stringify({ decisions: ids.map(id => ({ id, select: true, reason: 'earns it' })) });
    },
    chat: async () => ''
  } as unknown as LlmProvider;

  const store = createMemoryStore();
  const results = [
    result('https://a.example/p', 'PICK strong one'),
    result('https://a.example/x', 'IGNORED strong two'),
    result('https://a.example/y', 'IGNORED strong three')
  ];
  const pages = Object.fromEntries(results.map(r => [r.url, page('strong')]));
  const run = { ...makeRun(store, results, pages), provider: silentSlateProvider };
  const out = await runDigest(run);

  assert.equal(out.editorial.digest.length, 1);
  assert.equal(out.editorial.heldBack.length, 2);
  for (const h of out.editorial.heldBack) {
    assert.equal(h.outcome.kind, 'refused', 'silence triggered the forced call');
    assert.equal(
      h.outcome.kind === 'refused' && h.outcome.reason,
      'outclassed by the selection on the same subject'
    );
  }
});

test('a failed motivation call stays unruled — recorded, never invented', async () => {
  const failingMotivation = {
    generate: async (prompt: string) => {
      if (prompt.includes('NOT selected')) throw new Error('model down');
      const ids = [...prompt.matchAll(/id: (\S+)\n {2}PICK/g)].map(([, id]) => id);
      return JSON.stringify({ decisions: ids.map(id => ({ id, select: true, reason: 'earns it' })) });
    },
    chat: async () => ''
  } as unknown as LlmProvider;

  const store = createMemoryStore();
  const results = [result('https://a.example/p', 'PICK one'), result('https://a.example/x', 'IGNORED two')];
  const pages = Object.fromEntries(results.map(r => [r.url, page('strong')]));
  const out = await runDigest({ ...makeRun(store, results, pages), provider: failingMotivation });

  const ignored = out.editorial.heldBack[0];
  assert.equal(ignored.outcome.kind, 'unruled', 'an errored call is the one honest unruled left');
});

test('a substrate that fails costs its own candidates, never the night', async () => {
  // Measured 2026-08-19: one OpenAlex 503 killed the whole run — the working
  // substrate's results included. The failure is recorded, not absorbed: a
  // dead substrate's absence is invisible to every downstream counter, so it
  // must travel to the surface itself.
  const throwing: SearchAdapter = {
    id: 'openalex',
    selfHosted: false,
    search: async () => {
      throw new Error('openalex 503: Search temporarily unavailable');
    }
  };
  const store = createMemoryStore();
  const results = [result('https://a.example/pick', 'PICK strong piece')];
  const pages = { 'https://a.example/pick': page('strong') };
  const run = makeRun(store, results, pages);
  const out = await runDigest({ ...run, search: [...run.search, throwing] });

  assert.equal(out.editorial.digest.length, 1, 'the working substrate still produced');
  assert.equal(out.failedFunnels.length, 1);
  assert.equal(out.failedFunnels[0].engine, 'openalex');
  assert.match(out.failedFunnels[0].error, /503/);
});

test('when every substrate fails, the run fails and says why — not a thin day', async () => {
  // An empty digest hiding a dead network would read as "nothing worth your
  // attention today", which would be false.
  const throwing: SearchAdapter = {
    id: 'searxng',
    selfHosted: true,
    search: async () => {
      throw new Error('ECONNREFUSED');
    }
  };
  const store = createMemoryStore();
  const run = makeRun(store, [], {});
  await assert.rejects(
    () => runDigest({ ...run, search: [throwing] }),
    /every substrate failed.*searxng/
  );
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

test('two same-subject selections leave one in the digest — no motivation call spent on the flip', async () => {
  // The measured 2026-08-20 failure, end to end: the judge picks several
  // "pieces" of one work; the enforcement flips all but the strongest BEFORE
  // the motivation pass, so the flipped one carries the mechanical reason —
  // a motivation call here would throw, proving none is made.
  const sameSubjectProvider = {
    generate: async (prompt: string) => {
      if (prompt.includes('NOT selected')) throw new Error('motivation must not run for a mechanical flip');
      const ids = [...prompt.matchAll(/id: (\S+)\n {2}PICK/g)].map(([, id]) => id);
      return JSON.stringify({
        decisions: ids.map((id, i) => ({
          id,
          select: true,
          reason: `${i === 0 ? 'first' : 'second'} piece on the same work`,
          subject: "Hegel's Elements of the Philosophy of Right"
        }))
      });
    },
    chat: async () => ''
  } as unknown as LlmProvider;

  const store = createMemoryStore();
  const results = [
    result('https://a.example/p1', 'PICK strong one'),
    result('https://a.example/p2', 'PICK strong two')
  ];
  const pages = Object.fromEntries(results.map(r => [r.url, page('strong')]));
  const out = await runDigest({ ...makeRun(store, results, pages), provider: sameSubjectProvider });

  assert.equal(out.editorial.digest.length, 1, 'one slot per subject');
  assert.equal(out.editorial.heldBack.length, 1);
  const flipped = out.editorial.heldBack[0];
  assert.equal(flipped.outcome.kind, 'refused');
  assert.match(
    flipped.outcome.kind === 'refused' ? flipped.outcome.reason : '',
    /one slot per subject/
  );
  assert.equal((await store.offers('2026-01-01T00:00:00.000Z')).length, 1, 'only the survivor is offered');
});

test("the fetch budget is the user's dial — and what it cuts stays reported", async () => {
  const store = createMemoryStore();
  const results = [
    result('https://a.example/1', 'PICK strong piece'),
    result('https://a.example/2', 'SKIP strong two'),
    result('https://a.example/3', 'SKIP strong three')
  ];
  const pages = Object.fromEntries(results.map(r => [r.url, page('strong')]));
  const out = await runDigest({ ...makeRun(store, results, pages), fetchBudget: 1 });

  assert.equal(out.reports[0].counts.fetched, 1, 'one candidate examined, as dialed');
  assert.equal(
    out.reports[0].triaged.filter(t => t.reason === 'over-budget').length,
    2,
    'the tail is reported, never silently dropped'
  );
});

test('a nonsense budget falls to the default or the floor, never to zero', async () => {
  const store = createMemoryStore();
  const results = [
    result('https://a.example/1', 'PICK strong piece'),
    result('https://a.example/2', 'SKIP strong two'),
    result('https://a.example/3', 'SKIP strong three')
  ];
  const pages = Object.fromEntries(results.map(r => [r.url, page('strong')]));

  const nan = await runDigest({ ...makeRun(createMemoryStore(), results, pages), fetchBudget: Number.NaN });
  assert.equal(nan.reports[0].counts.fetched, 3, 'NaN falls to the default, which covers all three');

  const zero = await runDigest({ ...makeRun(store, results, pages), fetchBudget: 0 });
  assert.equal(zero.reports[0].counts.fetched, 1, 'zero clamps to the floor — a typo must not empty the night');
});

test('a cancelled run keeps nothing and rejects as a cancellation, not a failure', async () => {
  const store = createMemoryStore();
  const results = [result('https://a.example/p', 'PICK strong piece')];
  const pages = { 'https://a.example/p': page('strong') };
  await assert.rejects(
    () => runDigest({ ...makeRun(store, results, pages), shouldStop: () => true }),
    (err: Error) => err.name === 'CancelledError'
  );
  assert.equal((await store.offers('2026-01-01T00:00:00.000Z')).length, 0, 'nothing persisted');
});

test('a cancel inside a funnel escapes whole — never recorded as a dead substrate', async () => {
  // First check (before the funnel) passes; the candidate-boundary check
  // inside the funnel fires. If safeFunnel swallowed it, the run would
  // continue and report a failed substrate — a decision dressed as an outage.
  let calls = 0;
  const store = createMemoryStore();
  const results = [result('https://a.example/p', 'PICK strong piece')];
  const pages = { 'https://a.example/p': page('strong') };
  await assert.rejects(
    () => runDigest({ ...makeRun(store, results, pages), shouldStop: () => calls++ >= 1 }),
    (err: Error) => err.name === 'CancelledError' && !err.message.includes('substrate')
  );
});
