import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanUrl,
  keepResolvable,
  looksResolvable,
  createSearxngAdapter,
  createBraveAdapter,
  createOpenAlexAdapter,
  type SearchResult
} from '../src/core/index';

/**
 * Correctness invariants for the search substrate.
 *
 * Fixture-driven on purpose: these exercise the parsing, the guards and the
 * parameter mapping — the parts we can be sure about — and reach no network.
 * *Since 2026-08-04 that last clause is structural rather than a promise*: the
 * adapters are handed a `Transport`, so there is no global to forget to patch.
 * Measured while mutation-testing — restoring one adapter to the global `fetch`
 * made five fixture tests spend 150–500ms on real network attempts.
 * **What they therefore do not prove**: that either provider actually behaves
 * as documented. That needs a key and a running instance, and until someone has
 * run it against the real thing, both adapters are written-not-verified. Saying
 * so is cheaper than discovering it later.
 */

/**
 * A transport that answers one canned body and records what was asked for.
 *
 * *Rewritten 2026-08-04.* This used to replace `globalThis.fetch` and restore it
 * in a `finally` — which was the symptom rather than the technique: **you only
 * patch a global if the code under test reaches for one.** The adapters are now
 * handed a `Transport` (§6.3), so the stub is an ordinary value: no global to
 * mutate, nothing to restore, and no way for one test to leak into the next.
 */
function stubTransport(body: string, init: { status?: number } = {}) {
  const calls: string[] = [];
  const transport = (url: string) => {
    calls.push(String(url));
    return Promise.resolve({
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      text: () => Promise.resolve(body),
      json: () => Promise.resolve(JSON.parse(body) as unknown)
    });
  };
  return { calls, transport };
}

// --- the capability boundary -------------------------------------------------

test('the core never reaches for a global transport', async () => {
  // §6: *the core is handed a capability, it never reaches for one.* This held
  // for DocumentFetcher from the start and was broken for the search adapters,
  // which called the global `fetch` from inside `src/core/`. It type-checked
  // because `fetch` exists on both sides — which is exactly why nobody saw it,
  // and why the rule needs a test rather than a comment.
  //
  // This is the one place patching the global is right, and for the opposite of
  // the usual reason: not to *supply* a capability, but to prove none is taken.
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('the core reached for global fetch');
  }) as typeof globalThis.fetch;
  try {
    const searx = stubTransport(SEARXNG_BODY);
    await createSearxngAdapter({ baseUrl: 'http://localhost:8080', transport: searx.transport }).search({ q: 'x' });

    const brave = stubTransport(BRAVE_BODY);
    await createBraveAdapter({ apiKey: 'k', transport: brave.transport }).search({ q: 'x' });

    const openalex = stubTransport(OPENALEX_BODY);
    await createOpenAlexAdapter({ transport: openalex.transport }).search({ q: 'x' });
  } finally {
    globalThis.fetch = original;
  }
});

// --- the resolvability guard -------------------------------------------------

test('opaque redirectors are refused', () => {
  assert.equal(
    looksResolvable('https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc'),
    false,
    'Gemini grounding redirects expire and may not be resolved — they are not links'
  );
  assert.equal(looksResolvable('https://www.google.com/url?q=x'), false);
  assert.equal(looksResolvable('https://duckduckgo.com/l/?uddg=x'), false);
});

test('ordinary article URLs pass', () => {
  assert.equal(looksResolvable('https://www.theguardian.com/world/2026/jul/23/x'), true);
  assert.equal(looksResolvable('http://example.org/a'), true);
});

test('non-http schemes and malformed URLs are refused', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'not a url', '']) {
    assert.equal(looksResolvable(bad), false, `${bad} should not pass`);
  }
});

test('dropping is reported, not silent', () => {
  const results = [
    { url: 'https://example.org/a', title: 'a', snippet: '', publishedAt: null, engine: 'e' },
    { url: 'https://vertexaisearch.cloud.google.com/x', title: 'b', snippet: '', publishedAt: null, engine: 'e' }
  ] satisfies SearchResult[];
  const { kept, dropped } = keepResolvable(results);
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 1, 'a shorter list with no account of what left is a silent filter');
});

// --- URL cleaning ------------------------------------------------------------

test('tracking parameters are stripped, real ones kept', () => {
  const cleaned = cleanUrl(
    'https://example.org/a?id=7&utm_source=news&mc_cid=dd4a8&fbclid=xyz&page=2#top'
  );
  const u = new URL(cleaned);
  assert.equal(u.searchParams.get('id'), '7');
  assert.equal(u.searchParams.get('page'), '2');
  assert.equal(u.searchParams.get('utm_source'), null);
  assert.equal(u.searchParams.get('mc_cid'), null, 'a campaign id ties the link to a mailing list');
  assert.equal(u.searchParams.get('fbclid'), null);
  assert.equal(u.hash, '');
});

test('a URL with nothing to strip is returned intact in substance', () => {
  const url = 'https://example.org/a?id=7';
  assert.equal(new URL(cleanUrl(url)).searchParams.get('id'), '7');
});

test('cleaning never throws on a malformed URL', () => {
  assert.equal(cleanUrl('not a url'), 'not a url');
});

// --- SearXNG -----------------------------------------------------------------

const SEARXNG_BODY = JSON.stringify({
  results: [
    {
      url: 'https://www.sciencedaily.com/releases/2026/06/260624025514.htm?utm_source=feed',
      title: '  A research release  ',
      content: 'Substantive summary of the finding.',
      publishedDate: '2026-06-24T02:55:14',
      engine: 'duckduckgo',
      engines: ['duckduckgo', 'mojeek']
    },
    { url: 'https://example.org/b', title: 'B', content: '', engine: 'mojeek' }
  ]
});

test('searxng results are mapped, trimmed and de-tracked', async () => {
  const stub = stubTransport(SEARXNG_BODY);
  const out = await createSearxngAdapter({ baseUrl: 'http://localhost:8080/', transport: stub.transport }).search({
    q: 'test'
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'A research release');
  assert.equal(out[0].publishedAt, '2026-06-24T02:55:14');
  assert.equal(out[0].engine, 'duckduckgo');
  assert.ok(!out[0].url.includes('utm_source'));
  assert.equal(out[1].publishedAt, null, 'a missing date is null, never invented');
});

test('searxng: a 200 carrying HTML is named, not parsed as JSON', async () => {
  // Measured on a public instance: JSON disabled, and it answers with its web
  // page rather than an error. A naive client fails somewhere unrelated.
  const stub = stubTransport('<!DOCTYPE html>\n<html lang="en"><body>…</body></html>');
  await assert.rejects(
    () => createSearxngAdapter({ baseUrl: 'http://localhost:8080', transport: stub.transport }).search({ q: 'x' }),
    /HTML where JSON was requested/
  );
});

test('searxng: a 403 says how to fix the instance', async () => {
  const stub = stubTransport('forbidden', { status: 403 });
  await assert.rejects(
    () => createSearxngAdapter({ baseUrl: 'http://localhost:8080', transport: stub.transport }).search({ q: 'x' }),
    /settings\.yml/
  );
});

test('searxng: a week rounds to a range the engine actually supports', async () => {
  const stub = stubTransport(SEARXNG_BODY);
  await createSearxngAdapter({ baseUrl: 'http://localhost:8080', transport: stub.transport }).search({
    q: 'x',
    freshness: 'week'
  });
  assert.match(stub.calls[0], /time_range=month/);
});

// --- Brave -------------------------------------------------------------------

const BRAVE_BODY = JSON.stringify({
  web: {
    results: [
      {
        url: 'https://legrandcontinent.eu/fr/dimanches/un-cafe/?mc_cid=abc',
        title: 'Un café avec…',
        description: 'An interview.',
        page_age: '2026-06-15T00:00:00',
        age: '2 months ago'
      }
    ]
  }
});

test('brave results are mapped, with page_age as the date', async () => {
  const stub = stubTransport(BRAVE_BODY);
  const out = await createBraveAdapter({ apiKey: 'k', transport: stub.transport }).search({ q: 'test' });
  assert.equal(out.length, 1);
  assert.equal(out[0].publishedAt, '2026-06-15T00:00:00');
  assert.ok(!out[0].url.includes('mc_cid'));
  assert.equal(out[0].engine, 'brave');
});

test('brave: count is clamped to the documented page maximum', async () => {
  const stub = stubTransport(BRAVE_BODY);
  await createBraveAdapter({ apiKey: 'k', transport: stub.transport }).search({ q: 'x', count: 50 });
  assert.match(stub.calls[0], /count=20/, 'asking for 50 silently returns 20; clamp where it shows');
});

test('brave: freshness maps to the provider vocabulary', async () => {
  const stub = stubTransport(BRAVE_BODY);
  await createBraveAdapter({ apiKey: 'k', transport: stub.transport }).search({ q: 'x', freshness: 'week' });
  assert.match(stub.calls[0], /freshness=pw/);
});

test('brave: an exhausted quota says so rather than reporting an empty web', async () => {
  const stub = stubTransport('{}', { status: 429 });
  await assert.rejects(
    () => createBraveAdapter({ apiKey: 'k', transport: stub.transport }).search({ q: 'x' }),
    /rate limit or monthly credit/
  );
});

test('a response with no results is empty, not an error', async () => {
  const stub = stubTransport('{}');
  assert.deepEqual(await createBraveAdapter({ apiKey: 'k', transport: stub.transport }).search({ q: 'x' }), []);
});

// --- OpenAlex ----------------------------------------------------------------

const OPENALEX_BODY = JSON.stringify({
  results: [
    {
      id: 'https://openalex.org/W3091837505',
      doi: 'https://doi.org/10.1017/beq.2020.32',
      display_name: 'Ethics of the Attention Economy',
      publication_date: '2020-10-06',
      type: 'article',
      cited_by_count: 283,
      is_retracted: false,
      language: 'en',
      open_access: { is_oa: true, oa_url: 'https://cambridge.org/x.pdf' },
      primary_location: {
        landing_page_url: 'https://doi.org/10.1017/beq.2020.32',
        source: { display_name: 'Business Ethics Quarterly' }
      },
      authorships: [{ author: { display_name: 'Vikram R. Bhargava' } }],
      abstract_inverted_index: { The: [0], attention: [1], economy: [2] }
    },
    // No DOI: the fallback chain has to hold.
    {
      id: 'https://openalex.org/W2',
      doi: null,
      display_name: 'A preprint',
      primary_location: { landing_page_url: 'https://arxiv.org/abs/2401.00001' },
      is_retracted: true
    }
  ]
});

test('openalex prefers the DOI, because it outlives the landing page', async () => {
  const stub = stubTransport(OPENALEX_BODY);
  const out = await createOpenAlexAdapter({ transport: stub.transport }).search({ q: 'attention economy' });
  assert.equal(out[0].url, 'https://doi.org/10.1017/beq.2020.32');
  assert.equal(out[1].url, 'https://arxiv.org/abs/2401.00001', 'falls back when no DOI');
});

test('openalex rebuilds the abstract from its inverted index', async () => {
  const stub = stubTransport(OPENALEX_BODY);
  const out = await createOpenAlexAdapter({ transport: stub.transport }).search({ q: 'x' });
  assert.equal(out[0].snippet, 'The attention economy');
});

test('openalex carries the structured signals triage needs', async () => {
  const stub = stubTransport(OPENALEX_BODY);
  const out = await createOpenAlexAdapter({ transport: stub.transport }).search({ q: 'x' });
  assert.equal(out[0].signals?.citedBy, 283);
  assert.equal(out[0].signals?.venue, 'Business Ethics Quarterly');
  assert.equal(out[0].signals?.openAccess, true);
  assert.deepEqual(out[0].signals?.authors, ['Vikram R. Bhargava']);
  assert.equal(out[1].signals?.retracted, true);
});

test('openalex stays out of the polite pool unless asked', async () => {
  // Identifying the user buys rate limits; it should be their choice, not a
  // default they discover after the fact.
  let stub = stubTransport(OPENALEX_BODY);
  await createOpenAlexAdapter({ transport: stub.transport }).search({ q: 'x' });
  assert.ok(!stub.calls[0].includes('mailto'), 'anonymous by default');
  stub = stubTransport(OPENALEX_BODY);
  await createOpenAlexAdapter({ mailto: 'a@b.c', transport: stub.transport }).search({ q: 'x' });
  assert.match(stub.calls[0], /mailto=a%40b\.c/);
});
