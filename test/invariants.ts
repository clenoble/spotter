import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compose,
  scoreAll,
  DEFAULT_POLICY,
  type AxisScore,
  type AxisScorer,
  type CompositionPolicy,
  type Content,
  type LlmProvider,
  type ScoreVector
} from '../src/core/index';

/**
 * Correctness invariants for the engine.
 *
 * These assert only what must hold for the code to be faithful to the spec —
 * conservation-style properties, bounds, and the documented degradation
 * behaviour — **never a desired outcome**. Nothing here says a gate *should*
 * fire, that pollution *should* be detected, or that any score *should* be
 * high or low. Those are questions for the eval harness, which reports and
 * does not judge.
 *
 * The split is deliberate and borrowed from the Viability Model, where writing
 * the tests alongside the model shaped the model into confirming its author's
 * priors. A test that asserts an outcome becomes a target; a test that asserts
 * an invariant stays a test.
 *
 *   npx tsx --test test/invariants.ts
 */

const AXIS = (axis: string, score: number, ok = true): AxisScore =>
  ({ axis, score, reason: 'fixture', ok }) as AxisScore;

const CONTENT: Content = {
  id: 'fixture',
  platform: 'linkedin',
  authorHandle: 'a',
  authorName: 'A',
  text: 'text',
  mediaTypes: [],
  postedAt: null
};

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

/** A provider that is never reached — these tests exercise no network. */
const UNUSED: LlmProvider = {
  id: 'unused',
  generate: () => Promise.reject(new Error('provider should not be called')),
  chat: () => Promise.reject(new Error('provider should not be called'))
};

function scorer(
  axis: string,
  kind: 'contribution' | 'gate',
  behaviour: AxisScore | Error
): AxisScorer {
  return {
    axis,
    kind,
    score: () => (behaviour instanceof Error ? Promise.reject(behaviour) : Promise.resolve(behaviour))
  } as AxisScorer;
}

// --- compose() ---------------------------------------------------------------

test('a gate can never lift a score', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1 } };
  for (const gate of [0, 0.01, 0.5, 0.99, 1]) {
    for (const relevance of [0, 1, 50, 99, 100]) {
      const v: ScoreVector = {
        relevance: AXIS('relevance', relevance),
        pollution: AXIS('pollution', gate)
      };
      const r = compose(v, policy);
      assert.ok(
        r.score <= r.contribution + 1e-9,
        `gate ${gate} lifted ${relevance} to ${r.score}`
      );
    }
  }
});

test('an absent gate does not demote', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1 } };
  const withoutGate = compose({ relevance: AXIS('relevance', 80) }, policy);
  const withOpenGate = compose(
    { relevance: AXIS('relevance', 80), pollution: AXIS('pollution', 1) },
    policy
  );
  assert.equal(withoutGate.gate, 1);
  assert.equal(withoutGate.score, withOpenGate.score);
});

test('gates multiply', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1 } };
  const r = compose(
    {
      relevance: AXIS('relevance', 100),
      pollution: AXIS('pollution', 0.5),
      calibration: AXIS('calibration', 0.5)
    },
    policy
  );
  assert.equal(r.gate, 0.25);
  assert.equal(r.score, 25);
});

test('an absent contribution axis does not penalise the ones present', () => {
  // Two axes weighted equally, only one scored: the result is that one's score,
  // not half of it. Absence is "no opinion", not "zero".
  const policy: CompositionPolicy = { weights: { relevance: 1, quality: 1 } };
  const r = compose({ relevance: AXIS('relevance', 80) }, policy);
  assert.equal(r.contribution, 80);
});

test('a relevance-only vector returns relevance unchanged (the POC case)', () => {
  for (const score of [0, 33, 50, 100]) {
    const r = compose({ relevance: AXIS('relevance', score) }, DEFAULT_POLICY);
    assert.equal(r.score, score);
    assert.equal(r.contribution, score);
    assert.equal(r.gate, 1);
  }
});

test('weights are honoured proportionally', () => {
  const policy: CompositionPolicy = { weights: { relevance: 3, quality: 1 } };
  const r = compose(
    { relevance: AXIS('relevance', 100), quality: AXIS('quality', 0) },
    policy
  );
  assert.equal(r.contribution, 75);
});

test('an axis with zero weight is ignored', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1, quality: 0 } };
  const r = compose(
    { relevance: AXIS('relevance', 60), quality: AXIS('quality', 100) },
    policy
  );
  assert.equal(r.contribution, 60);
});

test('no weights at all yields zero contribution, not NaN', () => {
  const r = compose({ relevance: AXIS('relevance', 90) }, { weights: {} });
  assert.equal(r.contribution, 0);
  assert.equal(r.score, 0);
  assert.ok(Number.isFinite(r.score));
});

test('gate values are clamped into [0,1]', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1 } };
  const high = compose(
    { relevance: AXIS('relevance', 50), pollution: AXIS('pollution', 5) },
    policy
  );
  const low = compose(
    { relevance: AXIS('relevance', 50), pollution: AXIS('pollution', -3) },
    policy
  );
  assert.equal(high.gate, 1, 'a gate above 1 must not become a multiplier');
  assert.equal(low.gate, 0);
});

test('a non-finite gate degrades to no demotion, never to NaN', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1 } };
  for (const bad of [NaN, Infinity, -Infinity]) {
    const r = compose(
      { relevance: AXIS('relevance', 70), pollution: AXIS('pollution', bad) },
      policy
    );
    assert.ok(Number.isFinite(r.score), `gate ${bad} produced ${r.score}`);
    assert.equal(r.gate, 1);
  }
});

test('the composed score stays within the contribution range', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1, quality: 2 } };
  for (const a of [0, 25, 50, 100]) {
    for (const b of [0, 25, 50, 100]) {
      for (const g of [0, 0.3, 1]) {
        const r = compose(
          {
            relevance: AXIS('relevance', a),
            quality: AXIS('quality', b),
            pollution: AXIS('pollution', g)
          },
          policy
        );
        assert.ok(r.score >= 0 && r.score <= 100, `out of range: ${r.score}`);
        assert.ok(r.contribution >= 0 && r.contribution <= 100);
      }
    }
  }
});

// --- scoreAll(): failure is contained, never swallowed ------------------------

test('a scorer that throws is dropped from the vector, not fatal', async () => {
  const r = await scoreAll(
    { content: CONTENT, prefs: PREFS },
    UNUSED,
    [
      scorer('relevance', 'contribution', AXIS('relevance', 80)),
      scorer('pollution', 'gate', new Error('backend down'))
    ],
    { weights: { relevance: 1 } }
  );
  assert.equal(r.vector.pollution, undefined);
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].kind, 'error');
  assert.equal(r.degraded, true);
});

test('a gate that throws fails open — toward showing, never toward burying', async () => {
  const r = await scoreAll(
    { content: CONTENT, prefs: PREFS },
    UNUSED,
    [
      scorer('relevance', 'contribution', AXIS('relevance', 80)),
      scorer('pollution', 'gate', new Error('backend down'))
    ],
    { weights: { relevance: 1 } }
  );
  assert.equal(r.gate, 1);
  assert.equal(r.score, 80);
});

test('a contribution that throws does not drag the others down', async () => {
  const r = await scoreAll(
    { content: CONTENT, prefs: PREFS },
    UNUSED,
    [
      scorer('relevance', 'contribution', AXIS('relevance', 60)),
      scorer('quality', 'contribution', new Error('backend down'))
    ],
    { weights: { relevance: 1, quality: 1 } }
  );
  assert.equal(r.contribution, 60);
});

test('a fallback verdict still scores, but is recorded as a failure', async () => {
  // `ok: false` means the axis answered without judging. The value is safe to
  // compose; the fact that it is not a verdict must survive to the caller.
  const r = await scoreAll(
    { content: CONTENT, prefs: PREFS },
    UNUSED,
    [scorer('relevance', 'contribution', AXIS('relevance', 50, false))],
    { weights: { relevance: 1 } }
  );
  assert.equal(r.vector.relevance?.score, 50);
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].kind, 'fallback');
  assert.equal(r.degraded, true);
});

test('degraded is exactly "there were failures"', async () => {
  const clean = await scoreAll(
    { content: CONTENT, prefs: PREFS },
    UNUSED,
    [scorer('relevance', 'contribution', AXIS('relevance', 50))],
    { weights: { relevance: 1 } }
  );
  assert.equal(clean.failures.length, 0);
  assert.equal(clean.degraded, false);
});

test('every scorer is attempted, even after one throws', async () => {
  const seen: string[] = [];
  const spy = (axis: string, kind: 'contribution' | 'gate'): AxisScorer =>
    ({
      axis,
      kind,
      score: () => {
        seen.push(axis);
        return Promise.resolve(AXIS(axis, kind === 'gate' ? 1 : 10));
      }
    }) as AxisScorer;

  await scoreAll(
    { content: CONTENT, prefs: PREFS },
    UNUSED,
    [
      scorer('relevance', 'contribution', new Error('first one fails')),
      spy('quality', 'contribution'),
      spy('pollution', 'gate')
    ],
    { weights: { relevance: 1, quality: 1 } }
  );
  assert.deepEqual(seen.sort(), ['pollution', 'quality']);
});

test('with every axis failing, the item survives at zero rather than crashing', async () => {
  const r = await scoreAll(
    { content: CONTENT, prefs: PREFS },
    UNUSED,
    [
      scorer('relevance', 'contribution', new Error('down')),
      scorer('pollution', 'gate', new Error('down'))
    ],
    { weights: { relevance: 1 } }
  );
  assert.equal(r.degraded, true);
  assert.equal(r.failures.length, 2);
  assert.ok(Number.isFinite(r.score));
  assert.equal(r.gate, 1);
});

// --- an axis that could not judge is excluded, never down-weighted ------------
// From Crabe via COORD (2026-08-04): `not_run` must come OUT of the gate rather
// than enter it with a low value, or "we couldn't look" becomes indistinguishable
// from "we looked and found little". Their `citations` axis has the same rule one
// layer down — a 403 is non-conclusive and is excluded, only 404/410 count.

test('a contribution that could not judge is excluded from the average', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1, quality: 1 } };
  const r = compose(
    {
      relevance: AXIS('relevance', 80),
      quality: AXIS('quality', 50, false) // neutral placeholder, not a verdict
    },
    policy
  );
  assert.equal(r.contribution, 80, 'the placeholder must not drag the real verdict toward it');
});

test('a gate that could not judge never demotes', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1 } };
  const r = compose(
    { relevance: AXIS('relevance', 80), pollution: AXIS('pollution', 0.2, false) },
    policy
  );
  assert.equal(r.gate, 1, 'burying content on a reason nobody established is the worse failure');
  assert.equal(r.score, 80);
});

test('an unjudged axis stays in the vector even though it left the arithmetic', () => {
  // Excluded from the sum, kept for the explanation: the user is still owed the
  // fact that an axis was tried and could not answer.
  const policy: CompositionPolicy = { weights: { relevance: 1, quality: 1 } };
  const r = compose(
    { relevance: AXIS('relevance', 80), quality: AXIS('quality', 50, false) },
    policy
  );
  assert.equal(r.vector.quality?.ok, false);
  assert.equal(r.vector.quality?.score, 50);
});

test('every axis unjudged yields no contribution rather than an invented one', () => {
  const policy: CompositionPolicy = { weights: { relevance: 1 } };
  const r = compose({ relevance: AXIS('relevance', 50, false) }, policy);
  assert.equal(r.contribution, 0);
  assert.ok(Number.isFinite(r.score));
});
