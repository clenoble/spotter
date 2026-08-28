import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEditorialQueries,
  challengeIsUsable,
  DEFAULT_QUERY_POLICY,
  type CandidateSubject,
  type EditorialQueryPolicy
} from '../src/core/index';

/**
 * Correctness invariants for the editor's own retrieval round (§5.6, §5.6.1).
 *
 * The load-bearing one is not about wording: it is that **the reader cannot
 * reach a query**, because no input carries them. That is asserted on the
 * shape of what the builder is given, not on the strings it produces — no rule
 * reads a sentence and decides whether it encodes a person.
 */

const subject = (over: Partial<CandidateSubject> = {}): CandidateSubject => ({
  documentId: 'doc_1',
  subject: 'carbon pricing',
  claim: 'carbon pricing reduces emissions efficiently',
  ...over
});

test('a query discloses a subject, and the reader is not among the inputs', () => {
  // The egress rule of §5.6.1, enforced by absence rather than inspection.
  // `claim` is what the *document* asserts; nothing here says what the user
  // believes, how open they are, or what they have read. A future field would
  // be a decision to widen what can leave the machine.
  const s = subject();
  assert.deepEqual(
    Object.keys(s).sort(),
    ['claim', 'documentId', 'subject'],
    'the whole input surface — a stance model has no way in'
  );

  const { issued } = buildEditorialQueries([s]);
  for (const q of issued) {
    assert.ok(q.discloses.length > 0, 'every query says what it disclosed');
    assert.ok(q.promptedBy === 'doc_1', 'and which candidate prompted it');
  }
});

test('contradiction asks against the document’s claim, not against a person', () => {
  const { issued } = buildEditorialQueries([subject()], {
    maxQueries: 5,
    intents: ['contradiction']
  });
  assert.equal(issued.length, 1);
  assert.equal(issued[0].query.q, 'strong arguments against carbon pricing reduces emissions efficiently');
});

test('without a claim there is nothing to contradict, so no query is made', () => {
  // A contradiction query against a bare subject would just be more of the
  // subject — the axis would look served while nothing was contested.
  const { issued } = buildEditorialQueries([subject({ claim: undefined })], {
    maxQueries: 5,
    intents: ['contradiction']
  });
  assert.deepEqual(issued, []);
});

test('the budget reports what it cut — a shorter list is not an account', () => {
  // §1.1. The efficient shape (return early at the ceiling) and the honest
  // shape (build, then cut, then count) differ by one loop, and only the second
  // can say what did not happen.
  const subjects = [
    subject({ documentId: 'a' }),
    subject({ documentId: 'b' }),
    subject({ documentId: 'c' })
  ];
  const policy: EditorialQueryPolicy = {
    maxQueries: 4,
    intents: ['contradiction', 're-level-up', 'movement']
  };
  const { issued, notIssued } = buildEditorialQueries(subjects, policy);

  assert.equal(issued.length, 4, 'the ceiling holds');
  assert.equal(notIssued, 5, '3 subjects × 3 intents = 9 possible, 4 issued');
});

test('nothing is cut when the budget is not reached, and it says so', () => {
  const { issued, notIssued } = buildEditorialQueries([subject()], DEFAULT_QUERY_POLICY);
  assert.equal(notIssued, 0);
  assert.equal(issued.length, 3, 'one subject, three default intents');
});

test('down-levelling is off by default, because its gate does not exist yet', () => {
  // §5.4 guard 3: down-levelling moves toward interpretation and can swap a
  // rigorous finding for distorted spin, so it must clear Crabe first. Shipping
  // it enabled would be shipping the risky direction before its check.
  assert.equal(DEFAULT_QUERY_POLICY.intents.includes('re-level-down'), false);
  assert.equal(DEFAULT_QUERY_POLICY.intents.includes('re-level-up'), true);
});

test('a challenger may be off on one axis, and is refused on two', () => {
  // The rule that separates a challenge from noise wearing the badge. Off-topic
  // AND over their head AND thin AND contrarian is not a stretch, it is a
  // dumping ground — and anything at all can be justified as "challenging".
  const thresholds = { relevance: 40, calibration: 40, quality: 40, challenge: 40 };

  const stretchOnOne = [
    { axis: 'relevance', score: 70 },
    { axis: 'calibration', score: 60 },
    { axis: 'quality', score: 80 },
    { axis: 'challenge', score: 10 }
  ];
  const one = challengeIsUsable(stretchOnOne, thresholds);
  assert.equal(one.usable, true);
  assert.deepEqual(one.below, ['challenge']);

  const stretchOnThree = [
    { axis: 'relevance', score: 10 },
    { axis: 'calibration', score: 15 },
    { axis: 'quality', score: 80 },
    { axis: 'challenge', score: 5 }
  ];
  const three = challengeIsUsable(stretchOnThree, thresholds);
  assert.equal(three.usable, false);
  assert.deepEqual(three.below, ['relevance', 'calibration', 'challenge'], 'which axes is the point');
});

test('two axes below is refused — the boundary the rule is actually about', () => {
  // Added after mutation testing: relaxing `<= 1` to `<= 2` survived the suite,
  // because the cases asserted were one axis and three. Nothing tested two,
  // which is the only value the rule turns on. The classic off-by-one blind
  // spot, and the reason a green suite proves nothing until it has been shown
  // to fail.
  const thresholds = { relevance: 40, calibration: 40, quality: 40, challenge: 40 };
  const stretchOnTwo = [
    { axis: 'relevance', score: 70 },
    { axis: 'calibration', score: 20 },
    { axis: 'quality', score: 80 },
    { axis: 'challenge', score: 10 }
  ];
  const r = challengeIsUsable(stretchOnTwo, thresholds);
  assert.equal(r.usable, false, 'over their head AND contrarian leaves no footing to engage from');
  assert.deepEqual(r.below, ['calibration', 'challenge']);
});

test('off on no axis is usable — a good item that happens to disagree', () => {
  // §5.6.1 says "at most one" in prose and "exactly one" in its mechanical
  // sentence. Implemented as at most, and the disagreement is recorded in the
  // source rather than settled quietly: a piece off on nothing is not unusable.
  const thresholds = { relevance: 40, challenge: 40 };
  const comfortable = [
    { axis: 'relevance', score: 90 },
    { axis: 'challenge', score: 85 }
  ];
  const r = challengeIsUsable(comfortable, thresholds);
  assert.equal(r.usable, true);
  assert.deepEqual(r.below, []);
});

test('an axis with no threshold is not silently treated as failing', () => {
  // A missing threshold is a gap in configuration, not a verdict about the
  // item. Defaulting it to "below" would manufacture a refusal from an absence.
  const r = challengeIsUsable([{ axis: 'novelty', score: 5 }], {});
  assert.deepEqual(r.below, []);
  assert.equal(r.usable, true);
});
