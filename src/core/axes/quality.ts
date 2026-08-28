import type { AxisScorer, ScoringContext } from './types';
import type { LlmProvider } from '../llm/provider';
import type { ExampleLink } from '../prefs';
import { parseAxisJson, axisSchema } from './shared';

const QUALITY_MODEL = 'mistral';

/**
 * Quality — is this substantive, well-made, worth the friction? (spec §2)
 *
 * Under retrieval this is the axis the product turns on (§2.1): the engine
 * forms its own candidate set from a large, mostly-worthless haul, and Quality
 * is what separates *the good and the great* from the merely-on-topic.
 *
 * **Quality ≠ reliability, and ≠ pollution.** Crabe answers "is this
 * epistemically sound"; Pollution answers "was this built to capture
 * attention". Quality asks what neither does: is this deep, original,
 * well-reasoned — worth a slot in a digest of five? A reliable post can be
 * hollow; a clean one can be trivial; a flawed one can be the piece worth
 * reading. Judge the craft and the substance, never the topic (that is
 * Relevance) and never agreement.
 *
 * The user's bar, not a universal one: good/bad examples from onboarding are
 * shown to the judge as taste exemplars when they exist. With none, the
 * generic bar below applies and says so in its reason.
 */
const SYSTEM = `You judge the QUALITY of one web document for one specific reader: is it substantive, well-made, worth their limited attention?

High quality: a real argument developed rather than asserted; specific evidence (names, numbers, studies, first-hand experience); original thought or synthesis; writing that earns its length. Depth in a short piece counts; padding in a long one counts against.

Low quality: hollow even if clean — generic points anyone could make, summary-of-a-summary, competent emptiness. Judge craft and substance, NOT the topic and NOT whether you agree.

When TASTE EXAMPLES are provided, they show what this reader rates as good or bad: weigh your judgement toward their bar, and say so when you do.

Your reason MUST cite something specific from the document — a claim, a piece of evidence, a missing specific. Output ONLY valid JSON: {"quality": 0-100, "reason": "one short sentence"}.`;

export const qualityScorer: AxisScorer = {
  axis: 'quality',
  kind: 'contribution',

  async score(ctx: ScoringContext, provider: LlmProvider) {
    const raw = await provider.generate(buildPrompt(ctx), {
      model: ctx.models?.quality ?? QUALITY_MODEL,
      system: SYSTEM,
      temperature: 0.1,
      maxTokens: 140,
      jsonSchema: axisSchema('quality')
    });
    return parseAxisJson('quality', 'contribution', 'quality', raw);
  }
};

function buildPrompt(ctx: ScoringContext): string {
  const lines = [exampleBlock(ctx.prefs.examples), `Document titled "${ctx.content.id}":`, ctx.content.text.slice(0, 2500)];
  return lines.filter(Boolean).join('\n\n');
}

function exampleBlock(examples: readonly ExampleLink[] | undefined): string {
  if (!examples?.length) return '';
  const fmt = (e: ExampleLink) =>
    `- ${e.title ?? e.url}${e.note ? ` (reader's note: ${e.note})` : ''}${e.excerpt ? `\n  excerpt: ${e.excerpt.slice(0, 220)}` : ''}`;
  const good = examples.filter(e => e.verdict === 'good').slice(0, 4).map(fmt);
  const bad = examples.filter(e => e.verdict === 'bad').slice(0, 4).map(fmt);
  return [
    good.length ? `TASTE EXAMPLES the reader rated GOOD:\n${good.join('\n')}` : '',
    bad.length ? `TASTE EXAMPLES the reader rated BAD:\n${bad.join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}
