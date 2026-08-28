import type { AxisScorer, ScoringContext } from './types';
import { parseAxisJson, axisSchema } from './shared';

const CHALLENGE_MODEL = 'mistral';

/**
 * Challenge — does this contest a position, and contest it *well*? (spec §2)
 *
 * ⚠️ **v0.1 interpretation, documented rather than slid past** (decision of
 * 2026-08-10, taken under the autonomy mandate). The spec's full Challenge
 * reads the stance model — the privacy-heaviest artifact, which is *not* in
 * v0.1. This scorer therefore judges contestation of **the dominant line of
 * the day's haul and the declared topics**, never of the reader's beliefs:
 * the same move as F9's resolution, where a contradiction query targets what
 * a *document* claims. Nothing about the reader is modelled, stored, or sent
 * — which is also what keeps the extension's `tender` class empty (§6.3).
 * When the stance model lands, this becomes the fallback path, not the axis.
 *
 * The "contests it well" half is the guard against rewarding mere
 * contrarianism, and §5.6.1's one-axis rule polices the rest downstream: a
 * challenger may be off on one axis at most, so noise wearing the badge is
 * refused by composition rather than by this prompt alone.
 */
const SYSTEM = `You judge whether one web document CHALLENGES WELL: does it take a position that runs against the prevailing line on its subject, and argue that position seriously?

High challenge: a well-argued counter-position — engages the strongest form of what it disputes, brings evidence or a coherent framework, would give a thoughtful reader of the mainstream view real work to do. Low challenge: agrees with the prevailing line; or disagrees emptily — contrarian assertion, strawmen, outrage without argument. Mere disagreement is NOT challenge; lazy contrarianism scores LOW, not high.

Judge against the prevailing line as represented by the reader's recent items and declared interests when given; otherwise the mainstream framing of the document's own subject.

Your reason MUST name the position being contested. Output ONLY valid JSON: {"challenge": 0-100, "reason": "one short sentence"}.`;

export const challengeScorer: AxisScorer = {
  axis: 'challenge',
  kind: 'contribution',

  async score(ctx: ScoringContext, provider) {
    const line = [
      `Declared interests: ${ctx.prefs.topicsMore.join(', ') || '(none)'}`,
      ctx.recentlySeen?.length
        ? `Recent items (the prevailing line of this reader's intake):\n${ctx.recentlySeen.slice(0, 25).map(t => `- ${t}`).join('\n')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await provider.generate(
      [line, '', `Document titled "${ctx.content.id}":`, ctx.content.text.slice(0, 2200)].join('\n'),
      {
        model: ctx.models?.challenge ?? CHALLENGE_MODEL,
        system: SYSTEM,
        temperature: 0.1,
        maxTokens: 140,
        jsonSchema: axisSchema('challenge')
      }
    );
    return parseAxisJson('challenge', 'contribution', 'challenge', raw);
  }
};
