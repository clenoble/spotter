/**
 * Consuming Crabe's vector, and composing the reliability gate **we** own.
 *
 * *Written 2026-08-10, against `docs/ARCHITECTURE-v3.md` and `src/core/types.ts`
 * at their tag `submitted-3.0.0` — not against their description of it.*
 *
 * ## Why this file exists at all
 *
 * §4 and §5.4 of our spec spoke of *"the Crabe gate"*, and there is no such
 * thing. Their only gate is `citations` — links that resolve and say what the
 * page claims. Reliability lives in `content` and `provenance`, which are
 * **contributions**, and they have deliberately deferred any composite (their
 * Phase 4, to be co-designed rather than settled unilaterally). So the gate is
 * ours to compose, and its policy is ours to state.
 *
 * ## What their contract forces on the composition
 *
 * - **`status` is three-valued.** `ok` | `not_run` | `error`. *We could not
 *   look* and *we looked and it broke* are different facts and stay different.
 * - **`score` is optional even on `ok`** — "omitted when the axis has no
 *   meaningful single value". A missing score is not a zero; treating it as one
 *   would be `not_run ≠ zero` a level down, on the same data.
 * - **`absent` is never negative.** Their rule 1: most of the web has no
 *   byline. Absence is excluded from the arithmetic, never scored low.
 * - **A tier sits on each `Finding`, not on the axis**, so an axis mixes tiers.
 *   Aggregating them is not ours to invent: their `TierInfo.restsOn` states
 *   that a summary **inherits the weakest support beneath it**, and we use
 *   theirs rather than a rule of our own.
 * - **Two notices travel in the vector** — `scope` (text only) and `judgement`
 *   (the tiers say how strong the evidence is, never whether the model reasoned
 *   well from it). Both are carried forward, because a consumer that drops them
 *   is the reason they are data rather than UI copy.
 */

// --- Their contract, mirrored structurally (we share no package) ------------

export type CrabeTier = 'verified' | 'retrieved' | 'assessed' | 'recalled' | 'absent';
export type CrabeAxisId = 'content' | 'provenance' | 'lateral' | 'citations';
export type CrabeStatus = 'ok' | 'not_run' | 'error';

/**
 * Why an axis produced nothing — and these are **not** interchangeable.
 *
 * `consent_withheld` is the user exercising a choice. Reporting it as a
 * degradation would present her own decision back to her as a system failure,
 * which is the opposite of what §1 asks of every surface here.
 */
export type CrabeNotRunReason = 'consent_withheld' | 'capability_unavailable' | 'no_input';

export interface CrabeFinding {
  readonly id: string;
  readonly label: string;
  readonly tier: CrabeTier;
  readonly score?: number;
}

export interface CrabeAxisResult {
  readonly axis: CrabeAxisId;
  readonly status: CrabeStatus;
  readonly reason?: CrabeNotRunReason;
  readonly findings: readonly CrabeFinding[];
  /** 0–5. Omitted when the axis has no meaningful single value. */
  readonly score?: number;
}

export interface CrabeVector {
  readonly url: string;
  /** `provider/model`. A verdict without its judge is not comparable. */
  readonly judge?: string;
  readonly axes: readonly CrabeAxisResult[];
  readonly scope: string;
  readonly judgement: string;
}

// --- Our composition -------------------------------------------------------

export const TIER_RANK: Readonly<Record<CrabeTier, number>> = {
  verified: 4,
  retrieved: 3,
  assessed: 2,
  recalled: 1,
  absent: 0
};

/**
 * How much a verdict is allowed to weigh, by what it rests on.
 *
 * **Ours, not theirs** — they rank tiers for a *"never rises"* invariant and
 * take no position on what a consumer should do with them. These numbers are a
 * policy, and they are here rather than inline so they can be argued with.
 *
 * `absent` has no weight because it is not in the arithmetic at all; the entry
 * exists so a reader does not have to infer its exclusion from a missing key.
 */
export const TIER_WEIGHT: Readonly<Record<CrabeTier, number>> = {
  verified: 1,
  retrieved: 0.9,
  assessed: 0.7,
  recalled: 0.4,
  absent: 0
};

/** Why an axis did not enter the arithmetic. Reported, never silent (§1.1). */
export interface ExcludedAxis {
  readonly axis: CrabeAxisId;
  readonly why: 'not_run' | 'error' | 'no_score' | 'absent_only';
  readonly reason?: CrabeNotRunReason;
}

export interface Reliability {
  /** 0..1, multiplicative — it demotes, it never lifts (§2). */
  readonly gate: number;
  /**
   * The weakest tier the surviving verdict rests on, by **their** aggregation
   * rule. `null` when nothing counted — which is not the same as weak.
   */
  readonly restsOn: CrabeTier | null;
  readonly counted: readonly CrabeAxisId[];
  readonly excluded: readonly ExcludedAxis[];
  /** True when nothing could be counted. The caller decides; this reports. */
  readonly degraded: boolean;
  /** Carried forward so a downstream inherits the caveats with the data. */
  readonly scope: string;
  readonly judgement: string;
}

/**
 * Compose a reliability gate from Crabe's vector.
 *
 * Excluded axes are **excluded**, not down-weighted — the same rule this engine
 * already applies to its own axes that could not judge. Dropping a contribution
 * removes a reason to surface; scoring it zero invents a reason not to.
 */
export function composeReliability(vector: CrabeVector): Reliability {
  const counted: CrabeAxisId[] = [];
  const excluded: ExcludedAxis[] = [];
  let weighted = 0;
  let weight = 0;
  let weakest: CrabeTier | null = null;

  for (const axis of vector.axes) {
    if (axis.status === 'not_run') {
      excluded.push({ axis: axis.axis, why: 'not_run', reason: axis.reason });
      continue;
    }
    if (axis.status === 'error') {
      excluded.push({ axis: axis.axis, why: 'error' });
      continue;
    }
    if (axis.score === undefined) {
      // `ok` with no meaningful single value. Not a zero.
      excluded.push({ axis: axis.axis, why: 'no_score' });
      continue;
    }

    const tier = restingTier(axis.findings);
    if (tier === null) {
      // Every finding was `absent`, or there were none. Absence is never a
      // negative signal, so this axis says nothing rather than saying "bad".
      excluded.push({ axis: axis.axis, why: 'absent_only' });
      continue;
    }

    const w = TIER_WEIGHT[tier];
    weighted += (axis.score / 5) * w;
    weight += w;
    counted.push(axis.axis);
    if (weakest === null || TIER_RANK[tier] < TIER_RANK[weakest]) weakest = tier;
  }

  return {
    gate: weight === 0 ? 1 : clamp01(weighted / weight),
    restsOn: weakest,
    counted,
    excluded,
    degraded: counted.length === 0,
    scope: vector.scope,
    judgement: vector.judgement
  };
}

/**
 * The tier an axis rests on: **the weakest of its findings**, their rule.
 *
 * `absent` findings are skipped rather than counted as the weakest — otherwise
 * a page with no byline would drag every axis it touches down to the floor,
 * which is exactly the "absence scored as a negative" their rule 1 forbids.
 */
function restingTier(findings: readonly CrabeFinding[]): CrabeTier | null {
  let weakest: CrabeTier | null = null;
  for (const f of findings) {
    if (f.tier === 'absent') continue;
    if (weakest === null || TIER_RANK[f.tier] < TIER_RANK[weakest]) weakest = f.tier;
  }
  return weakest;
}

/**
 * May a **down-level** be offered on this evidence? (§5.4 guard 3.)
 *
 * Down-levelling moves toward interpretation and can swap a rigorous finding
 * for distorted spin, so it must clear a reliability bar. The bar is not only a
 * number: **deciding it on `recalled` evidence is a different decision from
 * deciding it on `retrieved`**, and until 2026-08-10 this guard did not
 * distinguish them.
 *
 * That matters most on the protective default: `lateral` — Crabe's only
 * `retrieved` axis — **cannot run under Ollama**, since the provider has no
 * search tool. A local user's verdict therefore rests on `assessed` and
 * `recalled`, and a guard that only read the number would have waved through a
 * down-level backed by model recall alone.
 */
export function mayOfferDownLevel(
  r: Reliability,
  minGate: number,
  minTier: CrabeTier = 'assessed'
): { readonly ok: boolean; readonly why: string } {
  if (r.restsOn === null) {
    return { ok: false, why: 'nothing could be counted — no evidence to clear a bar with' };
  }
  if (TIER_RANK[r.restsOn] < TIER_RANK[minTier]) {
    return { ok: false, why: `rests on ${r.restsOn}, below the ${minTier} floor for down-levelling` };
  }
  if (r.gate < minGate) {
    return { ok: false, why: `reliability ${r.gate.toFixed(2)} below ${minGate}` };
  }
  return { ok: true, why: `rests on ${r.restsOn}` };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
