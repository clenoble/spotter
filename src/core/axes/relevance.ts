import type { AxisScore, AxisScorer, ScoringContext } from './types';
import type { LlmProvider } from '../llm/provider';
import type { Content } from '../content';
import type { PreferenceDoc } from '../prefs';

// Model selection per axis is the F6 wiring (spec §6.1); a constant default
// until a settings surface exists. The id is provider-specific (Ollama here).
const FAST_MODEL = 'qwen2.5:3b';

const SYSTEM = `You score social-feed posts against a user's preferences. Output ONLY valid JSON: {"score": 0-100, "reason": "one short sentence"}. Higher = better match for this user. Do not include any prose outside the JSON.`;

/** Constrains decoding on providers that support it — see pollution.ts. */
const SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    reason: { type: 'string' }
  },
  required: ['score', 'reason'],
  additionalProperties: false
} as const;

/**
 * Relevance — does this fit the user's declared interests? The POC's only axis,
 * now the first contribution axis behind the uniform `AxisScorer` interface.
 */
export const relevanceScorer: AxisScorer = {
  axis: 'relevance',
  kind: 'contribution',

  async score(ctx: ScoringContext, provider: LlmProvider): Promise<AxisScore> {
    const raw = await provider.generate(buildPrompt(ctx.content, ctx.prefs), {
      model: ctx.models?.relevance ?? FAST_MODEL,
      system: SYSTEM,
      temperature: 0.1,
      maxTokens: 120,
      jsonSchema: SCHEMA as unknown as Record<string, unknown>
    });
    const parsed = parseJson(raw);
    return {
      axis: 'relevance',
      score: clamp(parsed.score, 0, 100),
      reason: parsed.reason,
      ok: parsed.ok
    };
  }
};

function buildPrompt(content: Content, prefs: PreferenceDoc): string {
  return [
    `More of: ${prefs.topicsMore.join(', ') || '(none)'}`,
    `Less of: ${prefs.topicsLess.join(', ') || '(none)'}`,
    `Tone preferences: ${prefs.tonePreferences.join('; ') || '(none)'}`,
    `Rules: ${prefs.customRules.join('; ') || '(none)'}`,
    ``,
    `Post by ${content.authorName}:`,
    content.text.slice(0, 1500)
  ].join('\n');
}

/** Fallback is mid-range — neither a boost nor a penalty on an unjudged post. */
function parseJson(raw: string): { score: number; reason: string; ok: boolean } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { score: 50, reason: 'no JSON in model output', ok: false };
  try {
    const x = JSON.parse(match[0]);
    const score = Number(x.score);
    if (!Number.isFinite(score)) {
      return { score: 50, reason: 'model returned no usable score', ok: false };
    }
    return { score, reason: String(x.reason ?? ''), ok: true };
  } catch {
    return { score: 50, reason: 'malformed JSON in model output', ok: false };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, n));
}
