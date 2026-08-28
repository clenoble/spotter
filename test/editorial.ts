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

// --- one slot per subject (added 2026-08-20) ---------------------------------
//
// The measured failure: the judge selected FOUR pieces of the same Hegel work
// and numbered them "first piece … fourth piece", while refusing others for
// "redundancy with the selection". The instruction existed; nothing triggered
// it. The rule now runs in code — these assert the rule, not the judgment.

import { enforceOneSlotPerSubject } from '../src/core/index';

test('four selections on one subject collapse to the strongest, the rest refused mechanically', () => {
  const cands = [
    candidate({ documentId: 'h1', title: 'Hegel: Elements of the Philosophy of Right | Cambridge', score: 93 }),
    candidate({ documentId: 'h2', title: 'Anara | AI you can trust', score: 91 }),
    candidate({ documentId: 'h3', title: 'Introduction | Hegel: Elements of the Philosophy of Right', score: 91 }),
    candidate({ documentId: 'h4', title: 'Elements of the PHILOSOPHY OF RIGHT | Hegel', score: 91 }),
    candidate({ documentId: 'm1', title: 'Modernization, Cultural Change, and Democracy', score: 90 })
  ];
  const subject = "Hegel's Elements of the Philosophy of Right";
  const out = enforceOneSlotPerSubject(cands, [
    { documentId: 'h1', select: true, reason: 'first piece', subject },
    { documentId: 'h2', select: true, reason: 'second piece', subject },
    { documentId: 'h3', select: true, reason: 'third piece', subject },
    { documentId: 'h4', select: true, reason: 'fourth piece', subject },
    { documentId: 'm1', select: true, reason: 'new subject', subject: 'modernization and democracy' }
  ]);

  const selected = out.filter(d => d.select).map(d => d.documentId).sort();
  assert.deepEqual(selected, ['h1', 'm1'], 'one slot per subject, the strongest holds it');
  const flipped = out.filter(d => !d.select);
  assert.equal(flipped.length, 3);
  for (const f of flipped) {
    assert.match(f.reason ?? '', /one slot per subject/, 'the mechanical reason names the rule');
    assert.match(f.reason ?? '', /Hegel/, 'and names the winner');
  }
});

test('a missing subject falls back to the title — a page-per-chapter flood collapses anyway', () => {
  const cands = [
    candidate({ documentId: 'a', title: 'Hegel: Elements of the Philosophy of Right | Cambridge Aspire website', score: 93 }),
    candidate({ documentId: 'b', title: 'Introduction | Hegel: Elements of the Philosophy of Right | Cambridge Aspire website', score: 91 })
  ];
  const out = enforceOneSlotPerSubject(cands, [pick('a'), pick('b')]);
  assert.deepEqual(out.filter(d => d.select).map(d => d.documentId), ['a']);
});

test('short subjects never swallow longer ones by containment', () => {
  const cands = [
    candidate({ documentId: 'a', title: 'A', score: 90 }),
    candidate({ documentId: 'b', title: 'B', score: 80 })
  ];
  const out = enforceOneSlotPerSubject(cands, [
    { documentId: 'a', select: true, reason: 'r', subject: 'democracy' },
    { documentId: 'b', select: true, reason: 'r', subject: 'modernization, cultural change and democracy' }
  ]);
  assert.equal(out.filter(d => d.select).length, 2, '"democracy" is not the same subject as a work containing the word');
});

test('refusals and distinct subjects pass through the enforcement untouched', () => {
  const cands = [
    candidate({ documentId: 'a', title: 'A', score: 90 }),
    candidate({ documentId: 'b', title: 'B', score: 80 })
  ];
  const decisions: EditorialDecision[] = [
    { documentId: 'a', select: true, reason: 'earns it', subject: 'quantum error correction' },
    drop('b', 'repeats Tuesday')
  ];
  assert.deepEqual(enforceOneSlotPerSubject(cands, decisions), decisions);
});
