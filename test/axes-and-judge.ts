import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAxisJson,
  qualityScorer,
  noveltyScorer,
  challengeScorer,
  calibrationScorer,
  calibrationHasABand,
  judgeSlate,
  parseFeed,
  type LlmProvider,
  type ScoringContext,
  type PreferenceDoc,
  type EditorialCandidate
} from '../src/core/index';

/**
 * Invariants for the four new axes, the editor's voice, and the feed parser.
 *
 * None of these asserts that a judgment is *good* — that is an outcome, and
 * eval territory. They assert the properties that must hold whatever the model
 * says: fallbacks land on the safe side per kind, silence is never converted
 * into a verdict, invented ids are discarded, and the parser reads real feed
 * dialects.
 */

const prefs = (over: Partial<PreferenceDoc> = {}): PreferenceDoc => ({
  version: 1,
  topicsMore: ['attention'],
  topicsLess: [],
  tonePreferences: [],
  authorsBoost: [],
  authorsMute: [],
  explorationRate: 0.2,
  explorationMode: 'mixed',
  customRules: [],
  updatedAt: '2026-08-10T00:00:00.000Z',
  ...over
});

const ctx = (over: Partial<ScoringContext> = {}): ScoringContext => ({
  content: {
    id: 'doc',
    platform: 'web',
    authorHandle: '',
    authorName: 'example.org',
    text: 'Some text.',
    mediaTypes: [],
    postedAt: null
  },
  prefs: prefs(),
  ...over
});

const providerSaying = (reply: string): LlmProvider =>
  ({ generate: async () => reply, chat: async () => reply }) as unknown as LlmProvider;

// --- fallback direction per kind --------------------------------------------

test('a contribution that cannot judge falls to mid-range, flagged', () => {
  const r = parseAxisJson('quality', 'contribution', 'quality', 'not json at all');
  assert.deepEqual([r.score, r.ok], [50, false], 'neither boost nor penalty on an unjudged item');
});

test('a gate that cannot judge falls open, flagged — never closed', () => {
  // A gate failing closed would bury content on a model glitch; the flag is
  // what keeps the fail-open from being silent (§1.1).
  const r = parseAxisJson('calibration', 'gate', 'fit', '{broken');
  assert.deepEqual([r.score, r.ok], [1, false]);
});

test('gate scores are stored as multipliers, contributions as 0-100', async () => {
  const gate = await calibrationScorer.score(
    ctx({ prefs: prefs({ examples: [{ url: 'https://a', verdict: 'good', title: 'T', excerpt: 'x' }] }) }),
    providerSaying('{"fit": 80, "reason": "similar altitude"}')
  );
  assert.equal(gate.score, 0.8);

  const contribution = await qualityScorer.score(ctx(), providerSaying('{"quality": 80, "reason": "cites a study"}'));
  assert.equal(contribution.score, 80);
});

test('every new axis clamps an out-of-range score instead of passing it', async () => {
  const q = await qualityScorer.score(ctx(), providerSaying('{"quality": 250, "reason": "r"}'));
  assert.equal(q.score, 100);
  const n = await noveltyScorer.score(ctx(), providerSaying('{"novelty": -10, "reason": "r"}'));
  assert.equal(n.score, 0);
  const c = await challengeScorer.score(ctx(), providerSaying('{"challenge": 101, "reason": "r"}'));
  assert.equal(c.score, 100);
});

test('calibration has a band only when a good example carries substance', () => {
  // The orchestrator's predicate: with no band, the scorer is not run at all —
  // a band nobody declared is not a band, and inventing one from topics would
  // be inference from the container.
  assert.equal(calibrationHasABand(undefined), false);
  assert.equal(calibrationHasABand([]), false);
  assert.equal(calibrationHasABand([{ verdict: 'bad', title: 'T' }]), false, 'bad examples set no band');
  assert.equal(calibrationHasABand([{ verdict: 'good' }]), false, 'a bare URL teaches nothing');
  assert.equal(calibrationHasABand([{ verdict: 'good', title: 'T' }]), true);
});

// --- the editor's voice ------------------------------------------------------

const cand = (id: string, over: Partial<EditorialCandidate> = {}): EditorialCandidate => ({
  documentId: id,
  url: `https://example.org/${id}`,
  title: id,
  topicId: null,
  score: 50,
  degraded: false,
  ungatedAxes: [],
  ...over
});

test('the judge returns only rulings on candidates that exist', async () => {
  // An id the model made up is not a ruling; a real id ruled twice keeps the
  // first ruling. Nothing here invents, nothing here trusts.
  const decisions = await judgeSlate(
    providerSaying(
      '{"decisions": [{"id": "a", "select": true, "reason": "r"}, {"id": "ghost", "select": true, "reason": "r"}, {"id": "a", "select": false, "reason": "second"}]}'
    ),
    [cand('a'), cand('b')],
    [],
    { maxItems: 5 }
  );
  assert.deepEqual(decisions, [{ documentId: 'a', select: true, reason: 'r' }]);
});

test('a garbled judge yields no decisions — the assembly makes that unruled, visibly', async () => {
  const decisions = await judgeSlate(providerSaying('the model rambles'), [cand('a')], [], { maxItems: 5 });
  assert.deepEqual(decisions, []);
});

test('an empty slate never wakes the model', async () => {
  const provider = {
    generate: async () => {
      throw new Error('the judge was called on nothing');
    }
  } as unknown as LlmProvider;
  assert.deepEqual(await judgeSlate(provider, [], [], { maxItems: 5 }), []);
});

// --- the feed parser ---------------------------------------------------------

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title>First &#8211; part one</title><link>https://a.example/p1?utm_source=rss</link>
    <description><![CDATA[A <b>substantive</b> summary of the piece.]]></description>
    <pubDate>2026-08-09T10:00:00Z</pubDate></item>
  <item><title>No link here</title><description>dropped</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Atom entry</title><link rel="alternate" href="https://b.example/e1"/>
    <summary>An atom summary.</summary><updated>2026-08-10T08:00:00Z</updated></entry>
</feed>`;

test('RSS items are parsed: entities decoded, CDATA unwrapped, tracking stripped', () => {
  const items = parseFeed(RSS, 'test');
  assert.equal(items.length, 1, 'an item without a link is not a candidate');
  assert.equal(items[0].title, 'First – part one');
  assert.equal(items[0].snippet, 'A substantive summary of the piece.');
  assert.ok(!items[0].url.includes('utm_source'));
  assert.equal(items[0].engine, 'feed:test');
});

test('Atom entries are parsed, preferring the alternate link', () => {
  const items = parseFeed(ATOM, 'atomsrc');
  assert.equal(items[0].url, 'https://b.example/e1');
  assert.equal(items[0].snippet, 'An atom summary.');
  assert.equal(items[0].publishedAt, '2026-08-10T08:00:00Z');
});

test('a missing date is null, never invented', () => {
  const items = parseFeed(
    '<rss><channel><item><title>T</title><link>https://a.example/x</link></item></channel></rss>',
    's'
  );
  assert.equal(items[0].publishedAt, null);
});
