/**
 * Our verdict on a document — the counterpart of Sovereign's `reliability_*`
 * fields, which carry Crabe's. Held as its own record rather than folded into
 * the document, for two reasons: a judgment is re-run when the model or the
 * preferences change, while the document does not; and keeping it separate is
 * what would let it move into Sovereign as a symmetric `attention_*` field set
 * without disturbing anything else.
 */

export interface AxisTrace {
  axis: string;
  kind: 'contribution' | 'gate';
  /** Contribution: 0..100. Gate: 0..1 multiplier. */
  score: number;
  reason: string;
  /** False when the axis could not judge and a neutral fallback was used. */
  ok: boolean;
}

/**
 * Who produced a judgment. Implicit while Spotter is alone with its own store,
 * and **false the moment a record lands in a base where Crabe's assessments
 * also live** — which is exactly what import does. So it is written down.
 */
export type Judge = 'spotter' | 'crabe';

export interface Judgment {
  documentId: string;
  /** Which judge. See `Judge`. */
  judge: Judge;
  /** Composed 0..100, after gates. */
  score: number;
  contribution: number;
  gate: number;
  axes: AxisTrace[];
  /**
   * At least one axis could not judge. Never hidden (§1.1).
   *
   * ⚠️ **Declared by the judge, never computed by the storage layer** (Céline,
   * 2026-08-04). Only a judge knows which of its own states mean *I could not
   * look*; a store could only infer it from the payload, and inferring right
   * today guarantees nothing about tomorrow's contract. The storage layer
   * records, it does not decide — the same shape as F13.
   */
  degraded: boolean;
  /** Which model produced it — a verdict is only meaningful with its judge. */
  model: string;
  /**
   * Fingerprint of the composition policy in force (§4).
   *
   * Composition is a policy the **user** owns and edits, and the cache on the
   * document has to be *recomputable*. Two judgments with the same model and
   * different weights are otherwise indistinguishable — therefore not
   * recomputable, and silently so.
   */
  policy: string;
  /**
   * The challenge cursor value that produced the challenge axis, where the
   * host persists one (§3.1 — Sovereign does, the extension does not).
   *
   * Sovereign withdrew its neutral-reference scheme on the grounds that
   * *comparability comes from the fingerprint*. Without the cursor in the
   * record it comes from nowhere: the same article scores differently at
   * different cursor settings, and nothing would say which was in force.
   */
  cursor: number | null;
  assessedAt: string;
}
