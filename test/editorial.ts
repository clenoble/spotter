import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleEditorial,
  gatherContext,
  surfacedUngated,
  createMemoryStore,
  editorViewOf,
  type EditorialCandidate,
  type EditorialDecision
} from '../src/core/index';

/**
 * Correctness invariants for the editorial pass (§5.6).
 *
 * These assert the properties the assembly must guarantee **instead of asking
 * the model for them**: nothing vanishes, the four outcomes stay distinct, and
 * the ceiling is a ceiling. They assert nothing about whether the editor's
 * judgments are good — that is not a property, it is an outcome, and a test
 * asserting it would be the target this project refuses to build.
 */

const candidate = (over: Partial<EditorialCandidate> = {}): EditorialCandidate => ({
  documentId: 'doc_1',
  url: 'https://example.org/a',
  title: 'A',
  topicId: null,
  score: 50,
  degraded: false,
  ungatedAxes: [],
  ...over
});

const pick = (id: string, reason = 'worth it'): EditorialDecision => ({
  documentId: id,
  select: true,
  reason
});
const drop = (id: string, reason: string): EditorialDecision => ({
  documentId: id,
  select: false,
  reason
});

test('every candidate appears exactly once, whatever the editor returned', () => {
  // The property that makes the rest meaningful. A judge trusted to account for
  // what it saw will eventually drop one, and the loss would be undetectable —
  // so the assembly counts, rather than the model being asked to.
  const cands = [
    candidate({ documentId: 'a', score: 80 }),
    candidate({ documentId: 'b', score: 60 }),
    candidate({ documentId: 'c', score: 40 }),
    candidate({ documentId: 'd', score: 20 })
  ];
  const r = assembleEditorial(cands, [pick('a'), drop('b', 'repeats Tuesday')], 5);

  const seen = [...r.digest, ...r.heldBack].map(e => e.candidate.documentId).sort();
  assert.deepEqual(seen, ['a', 'b', 'c', 'd'], 'nothing may vanish between funnel and surface');
  assert.equal(r.digest.length + r.heldBack.length, cands.length);
});

test('refused and beaten stay distinct — one is an act, the other arithmetic', () => {
  // They were one thing until Sovereign asked whether "declined by the editor"
  // covered losing a place. It does not: recording a beaten item as refused
  // invents a judgment nobody made.
  const cands = [
    candidate({ documentId: 'a', score: 80 }),
    candidate({ documentId: 'b', score: 70 })
  ];
  const r = assembleEditorial(cands, [pick('a'), drop('b', 'ninety-nine percent overlap with Tuesday')], 5);

  const b = r.heldBack.find(e => e.candidate.documentId === 'b')!;
  assert.equal(b.outcome.kind, 'refused');
  assert.equal(
    b.outcome.kind === 'refused' && b.outcome.reason,
    'ninety-nine percent overlap with Tuesday',
    'the reason is the interesting half'
  );
});

test('a candidate the editor never mentioned is unruled, not beaten', () => {
  // `not_run ≠ zero`, on a verdict. We do not know what the editor thought, so
  // we do not write down a thought.
  const cands = [candidate({ documentId: 'a' }), candidate({ documentId: 'ghost' })];
  const r = assembleEditorial(cands, [pick('a')], 5);

  const ghost = r.heldBack.find(e => e.candidate.documentId === 'ghost')!;
  assert.equal(ghost.outcome.kind, 'unruled');
});

test('not selected and no reason is beaten, never a refusal we made up', () => {
  const cands = [candidate({ documentId: 'a', score: 80 }), candidate({ documentId: 'b', score: 60 })];
  const r = assembleEditorial(cands, [pick('a'), { documentId: 'b', select: false }], 5);

  const b = r.heldBack.find(e => e.candidate.documentId === 'b')!;
  assert.equal(b.outcome.kind, 'beaten', 'silence is not a reason');
});

test('the ceiling is a ceiling, and the overflow is beaten rather than truncated', () => {
  // If the editor picks seven and the ceiling is five, two lost their slot.
  // That is an outcome with a margin, not a list that got shorter.
  const cands = [90, 80, 70, 60, 50, 40, 30].map((score, i) =>
    candidate({ documentId: `d${i}`, score })
  );
  const r = assembleEditorial(cands, cands.map(c => pick(c.documentId)), 5);

  assert.equal(r.digest.length, 5);
  assert.equal(r.heldBack.length, 2);
  assert.deepEqual(
    r.heldBack.map(e => e.outcome.kind),
    ['beaten', 'beaten'],
    'displaced by better company is not the same as declined'
  );
});

test('the ceiling is never a quota — three good days stay three', () => {
  // Padding to length with the least-bad remainder teaches the reader that the
  // length means nothing. That is the paradoxe addictif re-entering by the count.
  const cands = [90, 80, 70, 60, 50].map((score, i) => candidate({ documentId: `d${i}`, score }));
  const decisions = [pick('d0'), pick('d1'), pick('d2'), drop('d3', 'thin'), drop('d4', 'thin')];
  const r = assembleEditorial(cands, decisions, 5);

  assert.equal(r.digest.length, 3, 'nothing is promoted to fill the ceiling');
});

test('an empty digest is possible, and reports no margin rather than inventing one', () => {
  const cands = [candidate({ documentId: 'a', score: 80 })];
  const r = assembleEditorial(cands, [drop('a', 'all of this repeats')], 5);

  assert.equal(r.digest.length, 0);
  const a = r.heldBack[0];
  assert.equal(a.outcome.kind, 'refused', 'a reason was given, so it is a refusal');

  const silent = assembleEditorial(cands, [{ documentId: 'a', select: false }], 5);
  const s = silent.heldBack[0];
  assert.equal(s.outcome.kind, 'beaten');
  assert.equal(
    s.outcome.kind === 'beaten' && s.outcome.margin,
    null,
    'there is no cut to have fallen below'
  );
});

test('the margin measures how narrowly it lost, because rank does not', () => {
  // Sixth every night is not an anomaly: a source can be correctly sixth. What
  // carries signal is the gap — two hundredths repeatedly is noise cutting,
  // fifteen points is a judgment that holds.
  const cands = [
    candidate({ documentId: 'in', score: 60 }),
    candidate({ documentId: 'near', score: 59.98 }),
    candidate({ documentId: 'far', score: 20 })
  ];
  const r = assembleEditorial(cands, cands.map(c => pick(c.documentId)), 1);

  const near = r.heldBack.find(e => e.candidate.documentId === 'near')!;
  const far = r.heldBack.find(e => e.candidate.documentId === 'far')!;
  assert.equal(near.outcome.kind === 'beaten' && near.outcome.margin, 0.02);
  assert.equal(far.outcome.kind === 'beaten' && far.outcome.margin, 40);
});

test('a selected item carries its reason, because §1.2 requires one', () => {
  const cands = [candidate({ documentId: 'a' })];
  const r = assembleEditorial(cands, [pick('a', 'absent from your reading since spring')], 5);
  assert.equal(
    r.digest[0].outcome.kind === 'selected' && r.digest[0].outcome.reason,
    'absent from your reading since spring'
  );
});

test('an item surfaced without a gate having run is reportable, not adjudicated', () => {
  // F13: whether an unchecked item deserves a slot depends on what else was
  // competing, which no per-item rule can see. So this reports; it does not rule.
  const cands = [
    candidate({ documentId: 'checked' }),
    candidate({ documentId: 'unchecked', degraded: true, ungatedAxes: ['pollution'] })
  ];
  const r = assembleEditorial(cands, cands.map(c => pick(c.documentId)), 5);

  const flagged = surfacedUngated(r);
  assert.deepEqual(flagged.map(e => e.candidate.documentId), ['unchecked']);
  assert.deepEqual(flagged[0].candidate.ungatedAxes, ['pollution'], 'which gate is the point');
});

test('the editor gathers offer facts through the view, and nothing else', async () => {
  const store = createMemoryStore();
  await store.putDocument({
    id: 'doc_1',
    url: 'https://example.org/a',
    title: 'A',
    topicId: 'topic_a',
    isOwned: false,
    firstFoundAt: '2026-06-01T00:00:00.000Z',
    publishedAt: null,
    venue: null,
    engine: 'fake',
    deletedAt: null
  });
  await store.recordOffer({
    documentId: 'doc_1',
    topicId: 'topic_a',
    at: '2026-06-02T00:00:00.000Z',
    surface: 'chrome'
  });
  await store.recordRead('doc_1', '2026-06-03T00:00:00.000Z');

  const ctx = await gatherContext(editorViewOf(store), [
    candidate({ documentId: 'doc_1', topicId: 'topic_a' })
  ]);

  assert.equal(ctx[0].everProposed, true);
  assert.equal(ctx[0].lastProposedAt, '2026-06-02T00:00:00.000Z');
  assert.equal(ctx[0].subjectLastSeen, '2026-06-02T00:00:00.000Z');
  assert.deepEqual(
    Object.keys(ctx[0]).sort(),
    ['documentId', 'everProposed', 'lastProposedAt', 'subjectLastSeen'],
    'no reading signal reaches the editor — the join is the comfort-filter trap'
  );
});
