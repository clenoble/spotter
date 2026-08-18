import type { AxisScore, AxisScorer, ScoringContext } from './types';
import type { LlmProvider } from '../llm/provider';
import type { Content } from '../content';

const POLLUTION_MODEL = 'mistral';

/**
 * Rewritten at spec v0.7 for the retrieval turn (§2.1). The previous prompt
 * described one adversary — content engineered for *engagement*, which is what
 * a feed is full of. Search returns a different one: content engineered for
 * *ranking*. Both are pollution under the same definition (built to capture
 * attention rather than to inform), but they use opposite craft, and a detector
 * that knows only hooks and emoji reads a keyword-stuffed content farm as a
 * normal article.
 *
 * Ranking-engineered filler is the harder case precisely because it *imitates*
 * substance: headings, length, a confident tone, and nothing in it. That is
 * where every local model tested scored a generic listicle as clean.
 *
 * The "cite something specific" instruction is not decoration. Measuring the
 * old prompt showed models handing back its own vocabulary as their reason
 * ("substantive content — a real argument", verbatim), which is a verdict that
 * cannot be checked. A reason that must quote the document is falsifiable.
 */
const SYSTEM = `You detect ATTENTION POLLUTION in a web document — an article, a post, a paper, a newsletter. Pollution means the thing was built to capture attention rather than to inform. Judge the *construction*, not the subject, and never whether you agree with it.

Two kinds, both pollution:

ENGINEERED FOR ENGAGEMENT — bait hooks ("Agree? 👇", "comment WORD and I'll DM you the guide"), manufactured outrage, false urgency, hollow motivational filler, humble-brags dressed as advice, rage-farming, one-line-per-sentence padding.

ENGINEERED FOR RANKING — this is the harder kind, because it imitates a real article. Keyword-stuffed or repeated-phrase writing; listicles that promise a number and deliver padding; restating the question for paragraphs before any answer ("In this article, we will explore…"); generic advice true of anything and specific to nothing; text that reads fluent but names no person, place, number, study or date; heavy affiliate or product links wrapped in thin editorial; machine-written filler stretched to look thorough.

NOT pollution: substance — a real argument, a concrete fact, a specific first-person account, a technical point, an actual finding — whether or not it is correct, well-written, or to your taste. A short piece is not pollution for being short. A commercial or promotional piece is not pollution if it says something specific. A piece you disagree with is not pollution.

The test that separates them: strip the formatting and the confident tone. Is there a claim, a fact, an experience, or a number left? If yes, it is low pollution however it is dressed. If the text could be regenerated from its own headline with no loss, it is high.

Your reason MUST quote or name something specific from this document — a phrase, a missing specific, a concrete detail. Do not restate these categories back.

Output ONLY valid JSON: {"pollution": 0-100, "reason": "one short sentence"}. No prose outside the JSON.`;

/**
 * Handed to providers that can constrain decoding (Anthropic structured
 * outputs, Ollama `format`). Belt and braces with the prompt above: the eval
 * harness showed unparseable replies are a real failure mode, and a schema
 * removes them where the backend supports one.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    pollution: { type: 'integer', minimum: 0, maximum: 100 },
    reason: { type: 'string' }
  },
  required: ['pollution', 'reason'],
  additionalProperties: false
} as const;

/**
 * Pollution — a GATE axis (spec §2). It does not lift anything; it demotes
 * engineered content. The model rates pollution 0..100; we map that to a gate
 * multiplier (clean → 1, pure bait → 0) which `compose()` multiplies in.
 *
 * Fail-safe, loudly. On a parse error the gate opens (1, no demotion): a gate
 * that failed *closed* would bury content on a model glitch, which is the worse
 * error for trust. But the failure is flagged (`ok: false`) and travels all the
 * way to the badge and the dashboard. Silent fail-open is how a protective
 * mechanism stops protecting without anyone noticing.
 */
export const pollutionScorer: AxisScorer = {
  axis: 'pollution',
  kind: 'gate',

  async score(ctx: ScoringContext, provider: LlmProvider): Promise<AxisScore> {
    const raw = await provider.generate(buildPrompt(ctx.content), {
      model: ctx.models?.pollution ?? POLLUTION_MODEL,
      system: SYSTEM,
      temperature: 0.1,
      maxTokens: 120,
      jsonSchema: SCHEMA as unknown as Record<string, unknown>
    });
    const { pollution, reason, ok } = parseJson(raw);
    const gate = ok ? clamp01(1 - pollution / 100) : 1;
    return { axis: 'pollution', score: gate, reason, ok };
  }
};

function buildPrompt(content: Content): string {
  return [`Post by ${content.authorName}:`, content.text.slice(0, 1500)].join('\n');
}

function parseJson(raw: string): { pollution: number; reason: string; ok: boolean } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { pollution: 0, reason: 'no JSON in model output', ok: false };
  try {
    const x = JSON.parse(match[0]);
    const pollution = Number(x.pollution);
    if (!Number.isFinite(pollution)) {
      return { pollution: 0, reason: 'model returned no usable rating', ok: false };
    }
    return { pollution, reason: String(x.reason ?? ''), ok: true };
  } catch {
    return { pollution: 0, reason: 'malformed JSON in model output', ok: false };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
