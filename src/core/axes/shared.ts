import type { AxisId, AxisScore } from './types';

/**
 * The parse-and-fallback half every LLM axis shares.
 *
 * Relevance and pollution each carry a private copy of this logic, written
 * before there were four more axes to write. The four new ones share this one
 * instead of adding four more copies — the recurring defect in the sibling
 * project was *a guarantee declared on one side and absent on the other*, and
 * five hand-rolled parsers is how that defect gets five homes.
 *
 * Fallbacks are per-kind and deliberate (spec §2, F13): a **contribution**
 * falls back to mid-range — neither a boost nor a penalty on an unjudged item —
 * and a **gate** falls back to open (no demotion), because a gate that fails
 * *closed* buries content on a model glitch, which is the worse error for
 * trust. Both fallbacks set `ok: false`, and that flag travels to the badge,
 * the dashboard and the editor (§1.1): fail-safe, loudly.
 */
export function parseAxisJson(
  axis: AxisId,
  kind: 'contribution' | 'gate',
  field: string,
  raw: string
): AxisScore {
  const fallback = (reason: string): AxisScore => ({
    axis,
    score: kind === 'gate' ? 1 : 50,
    reason,
    ok: false
  });

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback('no JSON in model output');
  try {
    const x = JSON.parse(match[0]) as Record<string, unknown>;
    const n = Number(x[field]);
    if (!Number.isFinite(n)) return fallback(`model returned no usable ${field}`);
    const clamped = Math.max(0, Math.min(100, n));
    return {
      axis,
      // Gates are stored as 0..1 multipliers; the model always rates 0..100.
      score: kind === 'gate' ? clamped / 100 : clamped,
      reason: String(x.reason ?? ''),
      ok: true
    };
  } catch {
    return fallback('malformed JSON in model output');
  }
}

/** The one schema shape all six axes use, parameterised by its field name. */
export function axisSchema(field: string): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      [field]: { type: 'integer', minimum: 0, maximum: 100 },
      reason: { type: 'string' }
    },
    required: [field, 'reason'],
    additionalProperties: false
  };
}
