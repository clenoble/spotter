import type { AxisScorer, ScoringContext } from './types';
import { parseAxisJson, axisSchema } from './shared';

const NOVELTY_MODEL = 'mistral';

/**
 * Novelty — is this outside what the reader has already encountered? (spec §2)
 *
 * The frontier artifact (§3) is, in v0.1, the **offers journal**: the titles
 * recently *proposed* to this reader. That choice is load-bearing and not a
 * shortcut. What was **read** must never feed a scorer — a layer that learns
 * from reads learns the reader rarely opens what contradicts them and stops
 * offering it, with every axis reporting green (§5.6, the comfort-filter trap).
 * What was **offered** is Spotter's own output, carries nothing about the
 * reader's behaviour, and is exactly the redundancy question this axis asks:
 * *have I put this in front of you before?*
 *
 * With an empty journal (first runs) novelty is judged against the declared
 * topics alone — "new relative to what you asked for" — which the reason says.
 */
const SYSTEM = `You judge the NOVELTY of one web document for one reader. Novelty requires TWO conditions, TOGETHER — score the WEAKER one:

1. NEW TO HUMAN KNOWLEDGE: the document carries a new result, finding, event or genuinely new idea — something recently added to what humanity knows, or a fresh vulgarisation OF such a recent result. Test: would its core substance already sit in a mature encyclopedia article (Wikipedia)? If yes, it is NOT novel, however recently the page itself was published. An introduction, summary, review or reference page on a canonical subject (Hegel, Darwin, the basics of any field) is not novel — unless it reports a discovery that genuinely changes the picture. The SUBJECT may be old if the piece's own idea about it is genuinely new.

2. NEW TO THIS READER: distant from the recently offered items listed below.

The scale — most documents are NOT in the top band:
- 85-100: a genuinely new result or idea (too new to be encyclopedic) AND absent from the recent items.
- 55-75: a real new development on a subject present in the recent items.
- 30-50: settled, encyclopedic substance — background, reference material, another introduction to a classic — however absent from the recent items. New to nobody.
- 0-25: substantially the same story or argument as a recent item, however well made; the fifth take on the same news.

Novelty is about new information, NOT quality and NOT topic fit. An off-topic piece can be low-novelty (same old take) and an on-topic one can be high (new result in a followed field).

Your reason MUST say which condition failed or held — what this is near to, or what makes it genuinely new. Output ONLY valid JSON: {"novelty": 0-100, "reason": "one short sentence"}.`;

export const noveltyScorer: AxisScorer = {
  axis: 'novelty',
  kind: 'contribution',

  async score(ctx: ScoringContext, provider) {
    const seen = ctx.recentlySeen ?? [];
    const recent = seen.length
      ? `Recently offered to this reader:\n${seen.slice(0, 40).map(t => `- ${t}`).join('\n')}`
      : `Nothing offered yet (empty journal): judge distance from the declared interests instead — ${ctx.prefs.topicsMore.join(', ') || '(none)'} — and say that is the basis.`;

    const raw = await provider.generate(
      [recent, '', `Document titled "${ctx.content.id}":`, ctx.content.text.slice(0, 1800)].join('\n'),
      {
        model: ctx.models?.novelty ?? NOVELTY_MODEL,
        system: SYSTEM,
        temperature: 0.1,
        maxTokens: 140,
        jsonSchema: axisSchema('novelty')
      }
    );
    return parseAxisJson('novelty', 'contribution', 'novelty', raw);
  }
};
