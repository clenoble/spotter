import type { AxisId, AxisScore, AxisScorer, ScoreVector, ScoringContext } from './axes/types';
import type { LlmProvider } from './llm/provider';
import { compose, type CompositionPolicy, type ComposedScore } from './compose';

/**
 * Running the axes and composing them — the host-agnostic entry point. Hosts
 * pick *which* scorers and *which* policy; the engine owns how they combine
 * and how failure is reported.
 */

export interface AxisFailure {
  axis: AxisId;
  /** `fallback` — the axis answered but could not judge; `error` — it threw. */
  kind: 'fallback' | 'error';
  /**
   * Whether the axis that failed was a gate or a contribution. Not decoration:
   * a contribution that could not run removed a *reason to surface* and let
   * nothing through, while a gate that could not run removed a *protection*,
   * and the item is competing for a slot without having been checked. The
   * editorial pass (§5.6) needs to tell those apart to do its job.
   */
  axisKind: 'contribution' | 'gate';
  message: string;
}

export interface EngineResult extends ComposedScore {
  /** Axes that did not produce a real verdict. Empty in the normal case. */
  failures: AxisFailure[];
  /** `failures.length > 0`, carried explicitly so hosts can't forget to check. */
  degraded: boolean;
}

/**
 * Scores one item on every supplied axis and composes the result.
 *
 * **Failure is contained, never swallowed.** A scorer that throws is dropped
 * from the vector rather than aborting the item — an absent gate defaults to 1
 * (no demotion) and an absent contribution does not penalise, so a broken axis
 * degrades toward *showing* the item rather than burying it. Every such event
 * is recorded in `failures`, and `degraded` is what the badge and the dashboard
 * read to tell the user the system is not currently at full strength.
 *
 * Axes are independent, so they run concurrently. With a single local Ollama
 * this is usually serialised downstream anyway — but the shape is honest, and
 * it is free the moment the backend can do better.
 */
export async function scoreAll(
  ctx: ScoringContext,
  provider: LlmProvider,
  scorers: readonly AxisScorer[],
  policy: CompositionPolicy
): Promise<EngineResult> {
  const settled = await Promise.allSettled(
    scorers.map(scorer => scorer.score(ctx, provider))
  );

  const vector: ScoreVector = {};
  const failures: AxisFailure[] = [];

  settled.forEach((outcome, i) => {
    const axis = scorers[i].axis;
    const axisKind = scorers[i].kind;
    if (outcome.status === 'rejected') {
      failures.push({ axis, axisKind, kind: 'error', message: errorMessage(outcome.reason) });
      return;
    }
    const score: AxisScore = outcome.value;
    if (!score.ok) {
      failures.push({ axis, axisKind, kind: 'fallback', message: score.reason });
    }
    vector[axis] = score;
  });

  return { ...compose(vector, policy), failures, degraded: failures.length > 0 };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
