import type { AxisScorer, ScoringContext } from './types';
import { parseAxisJson, axisSchema } from './shared';

const CALIBRATION_MODEL = 'mistral';

/**
 * Calibration — is this pitched in the reader's zone? (spec §2) A **gate**,
 * and two-sided: over their head is noise they cannot use, lay-level in their
 * own field is load with no payoff. Both demote; neither lifts.
 *
 * The band is derived from the **good examples** the reader submitted — the
 * altitude of what they like is the only declared signal v0.1 has (the
 * expertise map is a later artifact). Which forces the rule the orchestrator
 * enforces rather than this file: **with no examples, this scorer is not run
 * at all.** A band nobody declared is not a band, and inventing one from the
 * topics would be inference from the container — the move this project keeps
 * refusing. Not-run is visible (§1.1) rather than a silent neutral, and F13
 * already governs what the editor does with an item this gate never checked.
 */
const SYSTEM = `You judge LEVEL FIT: is this document pitched at the right altitude for one specific reader — neither over their head nor beneath their level?

The reader's level is shown by EXAMPLES of what they chose as good reading. Compare altitude: assumed background, density of jargon, depth of treatment. A document far MORE technical than their examples is a poor fit (they cannot use it); one far MORE elementary is also a poor fit (nothing in it for them). Similar altitude = good fit.

Fit is NOT quality and NOT topic: a brilliant paper can be a poor fit, an intro explainer can be a perfect one. 100 = right in their zone, 0 = hopelessly mismatched in either direction.

Your reason MUST say which direction the mismatch runs, or why the altitude matches. Output ONLY valid JSON: {"fit": 0-100, "reason": "one short sentence"}.`;

export const calibrationScorer: AxisScorer = {
  axis: 'calibration',
  kind: 'gate',

  async score(ctx: ScoringContext, provider) {
    const good = (ctx.prefs.examples ?? []).filter(e => e.verdict === 'good' && (e.excerpt || e.title));
    const examples = good
      .slice(0, 4)
      .map(e => `- ${e.title ?? e.url}${e.excerpt ? `\n  excerpt: ${e.excerpt.slice(0, 260)}` : ''}`)
      .join('\n');

    const raw = await provider.generate(
      [
        `Reading the reader chose as good (their altitude):\n${examples}`,
        '',
        `Document titled "${ctx.content.id}":`,
        ctx.content.text.slice(0, 1800)
      ].join('\n'),
      {
        model: ctx.models?.calibration ?? CALIBRATION_MODEL,
        system: SYSTEM,
        temperature: 0.1,
        maxTokens: 140,
        jsonSchema: axisSchema('fit')
      }
    );
    return parseAxisJson('calibration', 'gate', 'fit', raw);
  }
};

/** The orchestrator's rule, exported so it is one predicate rather than a habit. */
export function calibrationHasABand(examples: readonly { verdict: string; excerpt?: string; title?: string }[] | undefined): boolean {
  return (examples ?? []).some(e => e.verdict === 'good' && (e.excerpt || e.title));
}
