import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeReliability,
  mayOfferDownLevel,
  type CrabeVector,
  type CrabeAxisResult
} from '../src/core/index';

/**
 * Correctness invariants for consuming Crabe's vector (spec §2, §5.4).
 *
 * Written against their shipped types at `submitted-3.0.0`, not against our
 * summary of them — which is the whole reason this file exists: the summary was
 * accurate on four points and silent on the one that mattered.
 */

const axis = (over: Partial<CrabeAxisResult> = {}): CrabeAxisResult => ({
  axis: 'content',
  status: 'ok',
  findings: [{ id: 'f1', label: 'x', tier: 'assessed' }],
  score: 4,
  ...over
});

const vector = (axes: CrabeAxisResult[]): CrabeVector => ({
  url: 'https://example.org/a',
  judge: 'anthropic/claude',
  axes,
  scope: 'Crabe assesses text only…',
  judgement: 'Crabe supports critical judgement; it does not replace it…'
});

test('an axis that did not run is excluded, never scored zero', () => {
  // Their contract and ours meet here: not_run is not a zero, and dropping a
  // contribution removes a reason to surface while scoring it zero invents a
  // reason not to.
  const r = composeReliability(
    vector([
      axis({ axis: 'content', score: 5, findings: [{ id: 'f', label: 'x', tier: 'assessed' }] }),
      axis({ axis: 'lateral', status: 'not_run', reason: 'capability_unavailable', score: undefined, findings: [] })
    ])
  );
  assert.deepEqual(r.counted, ['content']);
  assert.equal(r.gate, 1, 'a perfect single axis is not dragged down by an absent one');
  assert.deepEqual(r.excluded, [{ axis: 'lateral', why: 'not_run', reason: 'capability_unavailable' }]);
});

test('why an axis did not run is kept — consent is not a failure', () => {
  // `consent_withheld` is the user exercising a choice. Reporting it as a
  // degradation would hand her own decision back as a system fault.
  const r = composeReliability(
    vector([axis({ axis: 'lateral', status: 'not_run', reason: 'consent_withheld', score: undefined, findings: [] })])
  );
  assert.equal(r.excluded[0].reason, 'consent_withheld');
  assert.notEqual(r.excluded[0].reason, 'capability_unavailable', 'the two are different facts');
});

test('error and not_run stay distinct', () => {
  const r = composeReliability(
    vector([
      axis({ axis: 'lateral', status: 'not_run', reason: 'no_input', score: undefined, findings: [] }),
      axis({ axis: 'citations', status: 'error', score: undefined, findings: [] })
    ])
  );
  assert.deepEqual(r.excluded.map(e => e.why), ['not_run', 'error']);
});

test('an ok axis with no score is excluded, because a missing score is not a zero', () => {
  // Their comment: "omitted when the axis has no meaningful single value".
  // Coercing that to 0 would be not_run ≠ zero one level down, on the same data.
  const r = composeReliability(vector([axis({ score: undefined })]));
  assert.deepEqual(r.excluded, [{ axis: 'content', why: 'no_score' }]);
  assert.equal(r.degraded, true);
});

test('absence is never a negative signal', () => {
  // Their rule 1: a page with no byline is most of the web, not concealment.
  // An axis whose findings are all `absent` says nothing — it does not say bad.
  const r = composeReliability(
    vector([axis({ axis: 'provenance', score: 0, findings: [{ id: 'f', label: 'no byline', tier: 'absent' }] })])
  );
  assert.deepEqual(r.excluded, [{ axis: 'provenance', why: 'absent_only' }]);
  assert.equal(r.gate, 1, 'a floor of zero here would be a claim about the page');
});

test('a verdict rests on the weakest tier beneath it — their rule, not ours', () => {
  // TierInfo.restsOn: "a summary generalises across findings, so it inherits
  // the weakest support beneath it".
  const r = composeReliability(
    vector([
      axis({
        axis: 'content',
        score: 5,
        findings: [
          { id: 'a', label: 'strong', tier: 'verified' },
          { id: 'b', label: 'weak', tier: 'recalled' }
        ]
      })
    ])
  );
  assert.equal(r.restsOn, 'recalled', 'the strongest finding does not raise the summary');
});

test('an absent finding does not drag an axis to the floor', () => {
  // Skipped rather than counted as weakest — otherwise one missing byline would
  // pull every axis it touches down, which is rule 1 violated by arithmetic.
  const r = composeReliability(
    vector([
      axis({
        score: 4,
        findings: [
          { id: 'a', label: 'seen', tier: 'retrieved' },
          { id: 'b', label: 'no date', tier: 'absent' }
        ]
      })
    ])
  );
  assert.equal(r.restsOn, 'retrieved');
});

test('nothing counted is reported as such, and does not become a low gate', () => {
  // "We could not assess this" and "this is unreliable" are different claims,
  // and only one of them is ours to make.
  const r = composeReliability(vector([axis({ status: 'not_run', reason: 'no_input', score: undefined, findings: [] })]));
  assert.equal(r.degraded, true);
  assert.equal(r.gate, 1, 'the caller decides what to do with degraded; this does not decide for it');
  assert.equal(r.restsOn, null, 'null is not the same as weak');
});

test('the two notices are carried forward with the data', () => {
  // They are data rather than UI copy precisely so a consumer inherits them.
  // A consumer that drops them is the failure they were made data to prevent.
  const r = composeReliability(vector([axis()]));
  assert.match(r.scope, /text only/);
  assert.match(r.judgement, /does not replace it/);
});

test('a stronger tier weighs more than a weaker one at the same score', () => {
  const strong = composeReliability(
    vector([axis({ score: 4, findings: [{ id: 'f', label: 'x', tier: 'verified' }] })])
  );
  const weak = composeReliability(
    vector([axis({ score: 4, findings: [{ id: 'f', label: 'x', tier: 'recalled' }] })])
  );
  // Same score, so the same ratio — the tier shows up in what it rests on, and
  // in the weight it carries when combined with others.
  assert.equal(strong.restsOn, 'verified');
  assert.equal(weak.restsOn, 'recalled');

  const mixed = composeReliability(
    vector([
      axis({ axis: 'content', score: 5, findings: [{ id: 'a', label: 'x', tier: 'verified' }] }),
      axis({ axis: 'provenance', score: 0, findings: [{ id: 'b', label: 'y', tier: 'recalled' }] })
    ])
  );
  assert.ok(mixed.gate > 0.5, 'a recalled zero must not outweigh a verified five');
});

// --- the down-level guard (§5.4 guard 3) ------------------------------------

test('a down-level is refused when the verdict rests on model recall alone', () => {
  // The case that matters, and the one the guard did not distinguish until
  // 2026-08-10: on the local path Crabe's only `retrieved` axis cannot run, so
  // a high number can sit entirely on recall. A guard reading only the number
  // would have waved it through.
  const r = composeReliability(
    vector([axis({ axis: 'provenance', score: 5, findings: [{ id: 'f', label: 'x', tier: 'recalled' }] })])
  );
  assert.equal(r.gate, 1, 'the number is perfect');
  const verdict = mayOfferDownLevel(r, 0.6);
  assert.equal(verdict.ok, false, 'and it is still refused');
  assert.match(verdict.why, /recalled/);
});

test('a down-level is allowed on assessed evidence that clears the bar', () => {
  const r = composeReliability(
    vector([axis({ score: 5, findings: [{ id: 'f', label: 'x', tier: 'assessed' }] })])
  );
  assert.equal(mayOfferDownLevel(r, 0.6).ok, true);
});

test('a down-level is refused when nothing could be counted', () => {
  const r = composeReliability(vector([axis({ status: 'error', score: undefined, findings: [] })]));
  const verdict = mayOfferDownLevel(r, 0.6);
  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /nothing could be counted/);
});

test('a down-level is refused on a low gate even when the tier is strong', () => {
  const r = composeReliability(
    vector([axis({ score: 1, findings: [{ id: 'f', label: 'x', tier: 'verified' }] })])
  );
  const verdict = mayOfferDownLevel(r, 0.6);
  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /below 0.6/);
});
