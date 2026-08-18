import type { ScoreVector, ContributionAxisId, GateAxisId } from './axes/types';

/**
 * The composition policy the user owns (spec §4). Weights apply to contribution
 * axes only; gate axes are not weighted — they multiply. Dispositions (stretch
 * / calm / discovery), the calibration band, and the challenge cursor are layered
 * on top of this as those axes land.
 */
export interface CompositionPolicy {
  weights: Partial<Record<ContributionAxisId, number>>;
}

export interface ComposedScore {
  /** Final 0..100 after gates. */
  score: number;
  /** Weighted contribution before gates. */
  contribution: number;
  /** Product of gate multipliers, 0..1. */
  gate: number;
  vector: ScoreVector;
}

const CONTRIBUTION_AXES: ContributionAxisId[] = ['relevance', 'novelty', 'challenge', 'quality'];
const GATE_AXES: GateAxisId[] = ['pollution', 'calibration'];

/** Relevance-only, matching current POC behaviour until further axes exist. */
export const DEFAULT_POLICY: CompositionPolicy = { weights: { relevance: 1 } };

/**
 * score = (Σ weighted contribution scores, normalised by present weight) × Π gates.
 * Absent contribution axes don't penalise (normalised by what's present); absent
 * gates default to 1 (no demotion). So a relevance-only vector returns the
 * relevance score unchanged — the POC's behaviour falls out as a special case.
 */
export function compose(vector: ScoreVector, policy: CompositionPolicy): ComposedScore {
  let weighted = 0;
  let weight = 0;
  for (const id of CONTRIBUTION_AXES) {
    const axis = vector[id];
    const w = policy.weights[id] ?? 0;
    // `ok: false` is excluded, not down-weighted. An axis that could not judge
    // carries a neutral placeholder, and letting that placeholder into the
    // average converts *we could not look* into a mediocre verdict — which is
    // indistinguishable, afterwards, from having looked and found little.
    // Absence of a value beats a value that lies; the item is simply judged on
    // the axes that did work.
    if (axis && axis.ok && w > 0) {
      weighted += axis.score * w;
      weight += w;
    }
  }
  const contribution = weight > 0 ? weighted / weight : 0;

  let gate = 1;
  for (const id of GATE_AXES) {
    const g = vector[id];
    // Same rule on the gate side, and it matters more here: a gate that could
    // not run must never demote. Scoring an unavailable gate low would bury
    // content for a reason nobody ever established.
    if (g && g.ok) gate *= clamp01(g.score);
  }

  return { score: contribution * gate, contribution, gate, vector };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
