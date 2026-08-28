import type { PreferenceDoc, RankResult, AxisTrace } from '$shared/types';
import type { LlmProvider, AxisScorer, Content, EngineResult, CompositionPolicy } from '$core/index';
import { scoreAll, relevanceScorer, pollutionScorer, DEFAULT_POLICY } from '$core/index';

/**
 * The extension's scoring path. It picks *which* axes run and *which* policy
 * composes them — a host decision today, the user's own once §4's dispositions
 * land. The engine only knows how to combine what it is handed.
 */
const SCORERS: readonly AxisScorer[] = [relevanceScorer, pollutionScorer];

/** Relevance carries the contribution; Pollution gates it. */
const POLICY: CompositionPolicy = DEFAULT_POLICY;

export async function scorePost(
  content: Content,
  prefs: PreferenceDoc,
  provider: LlmProvider,
  model?: string
): Promise<RankResult> {
  // One model for every axis today (the user picks one backend). The per-axis
  // override already exists in `ScoringContext`, so F6 plugs in here without
  // touching the engine.
  const models = model
    ? Object.fromEntries(SCORERS.map(s => [s.axis, model]))
    : undefined;
  const result = await scoreAll({ content, prefs, models }, provider, SCORERS, POLICY);
  return toRankResult(content.id, result);
}

function toRankResult(postId: string, result: EngineResult): RankResult {
  const axes: AxisTrace[] = [];
  for (const scorer of SCORERS) {
    const score = result.vector[scorer.axis];
    if (score) {
      axes.push({
        axis: scorer.axis,
        kind: scorer.kind,
        score: score.score,
        reason: score.reason,
        ok: score.ok
      });
    }
  }

  return {
    postId,
    score: result.score,
    reason: headlineReason(axes, result),
    contribution: result.contribution,
    gate: result.gate,
    axes,
    degraded: result.degraded,
    failures: result.failures
  };
}

/**
 * One line for the badge. A gate that actually demoted the item is *why* it
 * ranks where it ranks, so it takes the headline over the contribution that
 * lifted it — otherwise a buried post would display the reason it was
 * promoted, which is the opposite of an explanation. Nothing is lost by
 * choosing: the full vector always travels in `axes`.
 */
function headlineReason(axes: readonly AxisTrace[], result: EngineResult): string {
  if (result.degraded) {
    const names = [...new Set(result.failures.map(f => f.axis))].join(', ');
    return `degraded — ${names} could not judge; ranked on the remaining axes`;
  }

  const demoting = axes
    .filter(a => a.kind === 'gate' && a.score < 0.999)
    .sort((a, b) => a.score - b.score)[0];
  if (demoting) return `${demoting.axis}: ${demoting.reason}`;

  const lifting = axes
    .filter(a => a.kind === 'contribution')
    .sort((a, b) => b.score - a.score)[0];
  return lifting?.reason ?? '';
}
