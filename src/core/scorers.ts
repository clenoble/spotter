import type { AxisScorer } from './axes/types';
import type { PreferenceDoc } from './prefs';
import { relevanceScorer } from './axes/relevance';
import { qualityScorer } from './axes/quality';
import { noveltyScorer } from './axes/novelty';
import { challengeScorer } from './axes/challenge';
import { pollutionScorer } from './axes/pollution';
import { calibrationScorer, calibrationHasABand } from './axes/calibration';

/**
 * The standard axis set for a digest run, assembled in one place.
 *
 * Two hosts run digests now (the browser extension and the companion), and a
 * Sovereign host will be the third. Each assembling its own scorer list is how
 * they drift — one host learns a new axis, another silently doesn't — which is
 * the guarantee-on-one-side defect in host form. The calibration rule lives
 * here too: **no band declared, no calibration run** — a band nobody declared
 * is not a band (see calibration.ts).
 */
export function standardScorers(prefs: PreferenceDoc): AxisScorer[] {
  const scorers: AxisScorer[] = [
    relevanceScorer,
    qualityScorer,
    noveltyScorer,
    challengeScorer,
    pollutionScorer
  ];
  if (calibrationHasABand(prefs.examples)) scorers.push(calibrationScorer);
  return scorers;
}
