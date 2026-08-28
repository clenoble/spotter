import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  retrieve,
  cleanUrl,
  documentIdFor,
  type AxisScore,
  type AxisScorer,
  type DocumentFetcher,
  type LlmProvider,
  type SearchAdapter,
  type SearchResult
} from '../src/core/index';

/**
 * Correctness invariants for the candidate funnel (spec §5.2).
 *
 * Everything is injected — search, fetch, provider — so these assert the
 * funnel's own behaviour and touch no network and no model. As with the other
 * harness: nothing here says a good document *should* win. It says the funnel
 * accounts for what it dropped, respects its budget, and degrades sanely.
 */

const PREFS = {
  version: 1,
  topicsMore: [],
  topicsLess: [],
  tonePreferences: [],
  authorsBoost: [],
  authorsMute: [],
  explorationRate: 0,
  explorationMode: 'mixed' as const,
  customRules: [],
  updatedAt: '1970-01-01T00:00:00.000Z'
};

const UNUSED: LlmProvider = {
  id: 'unused',
  generate: () => Promise.reject(new Error('not called')),
  chat: () => Promise.reject(new Error('not called'))
};

const result = (url: string, title = 'T'): SearchResult => ({
  url,
  title,
  snippet: 'snippet',
  publishedAt: null,
  engine: 'fake'
});

const searchOf = (results: SearchResult[]): SearchAdapter => ({
  id: 'fake',
  selfHosted: true,
  search: () => Promise.resolve(results)
});

/** Reads every URL, and records which ones were asked for. */
function fetcherOf(asked: string[] = []): DocumentFetcher & { asked: string[] } {
  return {
    asked,
    fetch: (url: string) => {
      asked.push(url);
      return Promise.resolve({ url, title: `Doc ${url}`, text: 'body text' });
    }
  };
}

/** Scores by position in a fixed table, so ranking is deterministic. */
function scorerOf(byUrl: Record<string, number>): AxisScorer {
  return {
    axis: 'relevance',
    kind: 'contribution',
    score: (ctx: { content: { id: string } }) =>
      Promise.resolve({
        axis: 'relevance',
        score: byUrl[ctx.content.id] ?? 0,
        reason: 'fixture',
        ok: true
      } as AxisScore)
  } as unknown as AxisScorer;
}

const run = (over: Record<string, unknown>) =>
  retrieve({
    query: { q: 'test' },
    search: searchOf([result('https://a.example/1')]),
    fetcher: fetcherOf(),
    provider: UNUSED,
    scorers: [scorerOf({})],
    prefs: PREFS,
    composition: { weights: { relevance: 1 } },
    ...over
  } as Parameters<typeof retrieve>[0]);

// --- accounting --------------------------------------------------------------

test('every dropped candidate is accounted for, with the rule that dropped it', async () => {
  const r = await run({
    search: searchOf([
      result('https://a.example/1'),
      result('https://vertexaisearch.cloud.google.com/x'), // unresolvable
      result('https://a.example/1?utm_source=n'), // duplicate once cleaned
      result('https://c.example/3', '   ') // no title
    ])
  });

  assert.equal(r.counts.searched, 4);
  assert.equal(r.counts.afterTriage, 1);
  assert.equal(r.triaged.length, 3, 'nothing may vanish between the stages');
  assert.deepEqual(
    r.triaged.map(t => t.reason).sort(),
    ['duplicate', 'no-title', 'unresolvable']
  );
});

test('tracking variants of one link collapse to one document', async () => {
  const r = await run({
    search: searchOf([
      result('https://a.example/p?utm_source=x'),
      result('https://a.example/p?mc_cid=y'),
      result('https://a.example/p')
    ])
  });
  assert.equal(r.counts.afterTriage, 1);
  assert.equal(r.triaged.filter(t => t.reason === 'duplicate').length, 2);
});

test('the fetch budget is a reported rule, not a silent cap', async () => {
  const many = Array.from({ length: 10 }, (_, i) => result(`https://a.example/${i}`));
  const asked: string[] = [];
  const r = await run({
    search: searchOf(many),
    fetcher: fetcherOf(asked),
    policy: { count: 5, maxCandidates: 40, maxFetches: 3 }
  });

  assert.equal(asked.length, 3, 'the budget must actually bound the expensive work');
  assert.equal(r.counts.afterTriage, 3);
  assert.equal(
    r.triaged.filter(t => t.reason === 'over-budget').length,
    7,
    'a cap that does not say what it cut reads as "we looked at everything"'
  );
});

// --- ranking and the cut -----------------------------------------------------

test('the digest is the top N and the rest is kept, not discarded', async () => {
  const urls = ['https://a/1', 'https://a/2', 'https://a/3', 'https://a/4'];
  const r = await run({
    search: searchOf(urls.map(u => result(u))),
    scorers: [scorerOf({ 'https://a/1': 10, 'https://a/2': 90, 'https://a/3': 50, 'https://a/4': 70 })],
    policy: { count: 2, maxCandidates: 40, maxFetches: 20 }
  });

  assert.deepEqual(r.digest.map(d => d.score), [90, 70]);
  assert.equal(r.belowCut.length, 2, '"held back" needs the rest to still exist');
  assert.deepEqual(r.belowCut.map(d => d.score), [50, 10]);
});

test('ties break deterministically, so a run is reproducible', async () => {
  const scores = { 'https://b/1': 50, 'https://a/2': 50 };
  const first = await run({
    search: searchOf([result('https://b/1'), result('https://a/2')]),
    scorers: [scorerOf(scores)]
  });
  const second = await run({
    search: searchOf([result('https://a/2'), result('https://b/1')]),
    scorers: [scorerOf(scores)]
  });
  assert.deepEqual(
    first.digest.map(d => d.url),
    second.digest.map(d => d.url),
    'provider ordering must not decide the digest'
  );
});

test('a digest shorter than the requested count is not padded', async () => {
  const r = await run({
    search: searchOf([result('https://a/1')]),
    policy: { count: 5, maxCandidates: 40, maxFetches: 20 }
  });
  assert.equal(r.digest.length, 1);
  assert.equal(r.belowCut.length, 0);
});

// --- degradation -------------------------------------------------------------

test('an unreadable document is named, not silently missing', async () => {
  const r = await run({
    search: searchOf([result('https://a/1'), result('https://a/2')]),
    fetcher: { fetch: (url: string) => Promise.resolve(url.endsWith('2') ? null : { url, title: 'D', text: 't' }) }
  });
  assert.equal(r.counts.scored, 1);
  assert.deepEqual(r.unreadable, ['https://a/2']);
});

test('an empty search is an empty digest, not a crash', async () => {
  const r = await run({ search: searchOf([]) });
  assert.deepEqual(r.digest, []);
  assert.equal(r.counts.searched, 0);
});

test('a failing axis degrades the entry without losing it', async () => {
  const failing: AxisScorer = {
    axis: 'relevance',
    kind: 'contribution',
    score: () => Promise.reject(new Error('backend down'))
  } as AxisScorer;
  const r = await run({ scorers: [failing] });

  assert.equal(r.digest.length, 1, 'a scoring failure must not delete the candidate');
  assert.equal(r.digest[0].degraded, true);
  assert.equal(r.digest[0].failures.length, 1);
});

test('the provider snippet is not carried into the digest', async () => {
  // §5.2: triage input only. What is stored is our judgment and the URL.
  const r = await run({});
  const entry = r.digest[0] as unknown as Record<string, unknown>;
  assert.equal(entry.snippet, undefined);
  assert.ok(!JSON.stringify(entry).includes('snippet'), 'no provider prose may survive into storage');
});

// --- an unevaluated gate travels to the editor, it is not silently absorbed ---
// Céline's ruling on F13: rank on what is available, mark the reliability as
// degraded, list the gates that did not run — and let the chief editor judge
// whether the item earns a slot anyway.

test('a gate that could not run is named, not merely counted', async () => {
  const failingGate: AxisScorer = {
    axis: 'pollution',
    kind: 'gate',
    score: () => Promise.reject(new Error('backend down'))
  } as AxisScorer;
  const r = await run({ scorers: [scorerOf({ 'https://a.example/1': 70 }), failingGate] });

  const entry = r.digest[0];
  assert.deepEqual(entry.ungatedAxes, ['pollution'], 'the editor needs to know WHICH gate was missing');
  assert.equal(entry.degraded, true);
  assert.equal(entry.score, 70, 'the rank is computed from what was available');
});

test('a failed contribution does not appear as an unevaluated gate', async () => {
  // The two are opposite gestures: a missing contribution removed a reason to
  // surface, a missing gate removed a protection. Conflating them would hand the
  // editor a false alarm and, worse, hide the real one.
  const failingContribution: AxisScorer = {
    axis: 'quality',
    kind: 'contribution',
    score: () => Promise.reject(new Error('backend down'))
  } as AxisScorer;
  const r = await run({
    scorers: [scorerOf({ 'https://a.example/1': 70 }), failingContribution],
    composition: { weights: { relevance: 1, quality: 1 } }
  });

  assert.deepEqual(r.digest[0].ungatedAxes, []);
  assert.equal(r.digest[0].degraded, true, 'still degraded — just not ungated');
});

test('a fully judged candidate carries no ungated axes', async () => {
  const gate: AxisScorer = {
    axis: 'pollution',
    kind: 'gate',
    score: () => Promise.resolve({ axis: 'pollution', score: 1, reason: 'clean', ok: true } as AxisScore)
  } as AxisScorer;
  const r = await run({ scorers: [scorerOf({ 'https://a.example/1': 70 }), gate] });
  assert.deepEqual(r.digest[0].ungatedAxes, []);
  assert.equal(r.digest[0].degraded, false);
});

// --- proxy shells (added 2026-08-28) -----------------------------------------
//
// Measured by Céline in her own digest: a search engine returned the Google
// Translate proxy of earthday.org — a third party's URL dressed around the
// page, pointing at another language entirely. The unwrap is mechanical
// (host: `-` → `.`, `--` → `-`; `_x_tr_*` params are the proxy's), and these
// assert the three things that were wrong: address, parameters, identity.

test('a translate.goog proxy URL unwraps to the page it dresses', () => {
  assert.equal(
    cleanUrl(
      'https://www-earthday-org.translate.goog/campaign/sustainable-fashion/?_x_tr_sl=en&_x_tr_tl=id&_x_tr_hl=id&_x_tr_pto=tc'
    ),
    'https://www.earthday.org/campaign/sustainable-fashion/'
  );
});

test('a hyphen in the real host survives the unwrap, and real params outlive proxy params', () => {
  assert.equal(
    cleanUrl('https://some--site-com.translate.goog/read?page=2&_x_tr_sl=en'),
    'https://some-site.com/read?page=2'
  );
});

test('wrapped and unwrapped forms of one page share one identity', () => {
  assert.equal(
    documentIdFor(cleanUrl('https://www-earthday-org.translate.goog/campaign/?_x_tr_sl=en')),
    documentIdFor(cleanUrl('https://www.earthday.org/campaign/'))
  );
});

test('an ordinary URL passes the proxy unwrap untouched', () => {
  assert.equal(cleanUrl('https://www.earthday.org/campaign/?page=2'), 'https://www.earthday.org/campaign/?page=2');
});
