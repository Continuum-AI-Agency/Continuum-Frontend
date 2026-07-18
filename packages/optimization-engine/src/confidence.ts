// ---------------------------------------------------------------------------
// CONFIDENCE — how much to trust a measured efficiency signal (0..1). This is
// NOT a probability of business outcome; it qualifies how reliable the signal
// driving a reallocation is, so the UI can say "projected CPA $X -> $Y, ~68%
// confidence". Deterministic and grounded in the engine's own machinery:
//   predictiveness — the objective's calibrated Spearman ceiling (objectives.ts)
//   sampleSize     — KPI events in the decision window: events / (events + k)
//   consistency    — agreement of the 3/7/14d per-$ scores: 1 - CoV
//   score = predictiveness × sampleSize × consistency   (all in 0..1)
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import { kpiEvents, scoreAdSet } from './scoring';
import type { AdSetSnapshot, Confidence } from './types';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Coefficient of variation (std / mean) of a positive series; 0 if < 2 points. */
function cov(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean <= 0) return 0;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance) / mean;
}

function bandOf(score: number): Confidence['band'] {
  return score >= 0.66 ? 'high' : score >= 0.4 ? 'medium' : 'low';
}

export function confidenceOf(s: AdSetSnapshot, cfg: EngineConfig): Confidence {
  const events = kpiEvents(s.windows.d14, cfg);
  const k = cfg.confidenceSampleK > 0 ? cfg.confidenceSampleK : 20;
  const sampleSize = events / (events + k);

  const sb = scoreAdSet(s, cfg);
  const scores = [sb.score3d, sb.score7d, sb.score14d].filter((x) => x > 0);
  const consistency =
    scores.length >= 2 ? clamp01(1 - cov(scores)) : scores.length === 1 ? 0.5 : 0;

  const predictiveness = cfg.predictiveness ?? 0.75;
  const score = clamp01(predictiveness * sampleSize * consistency);
  return { score, predictiveness, sampleSize, consistency, events, band: bandOf(score) };
}

/** Spend-weighted confidence over a set of ad sets — the reliability of the
 *  portfolio's reallocation as a whole. */
export function portfolioConfidence(snapshots: AdSetSnapshot[], cfg: EngineConfig): Confidence {
  let wsum = 0;
  const acc = { score: 0, predictiveness: 0, sampleSize: 0, consistency: 0, events: 0 };
  for (const s of snapshots) {
    const w = Math.max(s.windows.d14.spend, 0);
    if (w <= 0) continue;
    const c = confidenceOf(s, cfg);
    wsum += w;
    acc.score += c.score * w;
    acc.predictiveness += c.predictiveness * w;
    acc.sampleSize += c.sampleSize * w;
    acc.consistency += c.consistency * w;
    acc.events += c.events;
  }
  if (wsum <= 0) {
    return { score: 0, predictiveness: cfg.predictiveness ?? 0.75, sampleSize: 0, consistency: 0, events: 0, band: 'low' };
  }
  const score = acc.score / wsum;
  return {
    score,
    predictiveness: acc.predictiveness / wsum,
    sampleSize: acc.sampleSize / wsum,
    consistency: acc.consistency / wsum,
    events: acc.events,
    band: bandOf(score),
  };
}
