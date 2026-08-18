import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, titleOf, decodeEntities, createFetcher } from '../src/core/index';

/**
 * Invariants for fetch-and-extract.
 *
 * The extraction itself is a heuristic and these do not pretend otherwise — no
 * test here asserts that a given page yields good prose, because that is an
 * outcome and not a property. What they assert is that the two paths through
 * the markup behave the same way, and that a failed fetch is a `null` the
 * funnel can record rather than an exception that aborts a night's run.
 */

test('a title decodes its entities — the half the reader actually sees', () => {
  // Found on the funnel's first real run: a digest entry read
  // "The Attention Economy &#8211; Berkeley Economic Review". The decoding
  // existed inside htmlToText and titleOf did none at all.
  assert.equal(
    titleOf('<title>Paying Attention &#8211; Berkeley Economic Review</title>'),
    'Paying Attention – Berkeley Economic Review'
  );
  assert.equal(titleOf('<title>Caf&#233; &amp; Co</title>'), 'Café & Co');
  assert.equal(titleOf('<title>  spaced\n  out  </title>'), 'spaced out');
});

test('title and body decode the same way, because they used not to', () => {
  // The defect was two paths through one problem with only one of them fixed.
  const entities = 'a &#8211; b &amp; c &#x2014; d &quot;e&quot;';
  assert.equal(titleOf(`<title>${entities}</title>`), decodeEntities(entities));
  assert.match(htmlToText(`<body><p>${entities}</p></body>`), /a – b & c — d "e"/);
});

test('&amp; is decoded last, so an escaped entity stays escaped', () => {
  // `&amp;#8211;` is a page saying the literal text "&#8211;". Decoding the
  // ampersand first would turn it into a dash the page never wrote.
  assert.equal(decodeEntities('&amp;#8211;'), '&#8211;');
});

test('a malformed numeric entity yields nothing rather than a crash', () => {
  assert.equal(decodeEntities('&#999999999;'), '');
  assert.equal(decodeEntities('&#x110000;'), '');
});

test('script, style and page furniture are dropped', () => {
  const html = `<body><nav>menu menu</nav><script>alert('x')</script>
    <article><p>The real text.</p></article><footer>footer junk</footer></body>`;
  const text = htmlToText(html);
  assert.match(text, /The real text\./);
  assert.doesNotMatch(text, /alert|menu|footer junk/);
});

test('a declared content region wins over the whole body', () => {
  const html = '<body><div>chrome</div><main><p>the piece</p></main></body>';
  assert.equal(htmlToText(html), 'the piece');
});

test('a fetch that fails is a null the funnel can record, never a throw', () => {
  // The funnel counts these as `unreadable` — a plumbing fact belonging in its
  // report (§5.2, degree 2), not an exception that ends the run.
  const cases = [
    { name: 'http error', transport: async () => ({ ok: false, status: 403, text: async () => '', json: async () => ({}) }) },
    { name: 'transport threw', transport: async () => { throw new Error('ECONNRESET'); } },
    { name: 'too thin', transport: async () => ({ ok: true, status: 200, text: async () => '<body><p>hi</p></body>', json: async () => ({}) }) }
  ];
  return Promise.all(
    cases.map(async c => {
      const fetcher = createFetcher(c.transport as never);
      assert.equal(await fetcher.fetch('https://example.org/a'), null, c.name);
    })
  ).then(() => undefined);
});

test('a page above the floor comes back with its title and text', async () => {
  const body = `<body><article><p>${'substance '.repeat(80)}</p></article></body>`;
  const fetcher = createFetcher((async () => ({
    ok: true,
    status: 200,
    text: async () => `<title>A &amp; B</title>${body}`,
    json: async () => ({})
  })) as never);

  const doc = await fetcher.fetch('https://example.org/a');
  assert.equal(doc?.title, 'A & B');
  assert.match(doc?.text ?? '', /substance/);
});

test('the fetcher takes its transport and never reaches for one', () => {
  // §6.3, surface five. Asserted behaviourally here as well as by the static
  // guard: the trap proves the module under test took nothing ambient.
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('the fetcher reached for global fetch');
  }) as typeof globalThis.fetch;
  try {
    const fetcher = createFetcher((async () => ({
      ok: true,
      status: 200,
      text: async () => `<title>t</title><body><article><p>${'x '.repeat(300)}</p></article></body>`,
      json: async () => ({})
    })) as never);
    return fetcher.fetch('https://example.org/a').then(d => assert.ok(d));
  } finally {
    globalThis.fetch = original;
  }
});
