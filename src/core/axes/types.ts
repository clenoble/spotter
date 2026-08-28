import type { Content } from '../content';
import type { LlmProvider } from '../llm/provider';
import type { PreferenceDoc } from '../prefs';

/**
 * The value model (spec §2). Two structurally different kinds of axis:
 *  - contribution axes are reasons *to* spend attention — additive, any one
 *    can lift an item;
 *  - gate axes are reasons *not to*, or *at what cost* — multiplicative, they
 *    only demote, never lift on their own.
 * The kind governs how `compose()` combines them.
 */
export type ContributionAxisId = 'relevance' | 'novelty' | 'challenge' | 'quality';
export type GateAxisId = 'pollution' | 'calibration';
export type AxisId = ContributionAxisId | GateAxisId;

export interface AxisScore {
  axis: AxisId;
  /** Contribution axes: 0..100. Gate axes: 0..1 multiplier (1 = no demotion). */
  score: number;
  reason: string;
  /**
   * False when the axis could not actually judge and a neutral fallback was
   * substituted — unparseable model output, most often. The score stays safe
   * to compose (a gate falls back to 1, a contribution to mid-range), but the
   * verdict is *not* a verdict, and the host must say so rather than absorb it.
   *
   * Fail-safe, loudly: the fallback protects the feed, the flag protects the
   * user's ability to know the system is degraded (spec §1.1 — nothing hidden
   * silently). A gate that fails open in silence is a gate that has stopped
   * working without telling anyone.
   */
  ok: boolean;
}

export type ScoreVector = Partial<Record<AxisId, AxisScore>>;

/**
 * Everything a scorer may read to judge one item. Grows as artifacts land:
 * the stance model (Challenge), frontier (Novelty), expertise map (Calibration)
 * — see spec §3. Contribution-only axes need just content + prefs.
 */
export interface ScoringContext {
  content: Content;
  prefs: PreferenceDoc;
  /**
   * Titles recently **offered** to this reader — the v0.1 frontier, feeding
   * Novelty and Challenge. Offers only, never reads: what was read must not
   * reach a scorer, or the engine becomes the comfort filter §5.6 names — it
   * would learn the reader rarely opens what contradicts them and stop
   * offering it, with every axis reporting green. Offers are Spotter's own
   * output and carry nothing about the reader's behaviour.
   */
  recentlySeen?: readonly string[];
  /**
   * Optional per-axis model override. Lets the eval harness compare backends
   * (e.g. qwen2.5:3b vs mistral vs a 7b) on the same corpus, and pre-figures
   * the per-axis model selection of F6. Falls back to each axis's default.
   */
  models?: Partial<Record<AxisId, string>>;
}

export interface AxisScorer {
  readonly axis: AxisId;
  readonly kind: 'contribution' | 'gate';
  score(ctx: ScoringContext, provider: LlmProvider): Promise<AxisScore>;
}
