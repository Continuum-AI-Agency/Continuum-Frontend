// ---------------------------------------------------------------------------
// CONFIDENCE — how much to trust a measured efficiency signal (0..1). This is
// NOT a probability of business outcome; it qualifies how reliable the signal
// driving a reallocation is, so the UI can say "projected CPA $X -> $Y, ~68%
// confidence". Deterministic and grounded in the engine's own machinery:
//   sampleSize     — KPI events in the decision window: events / (events + k)
//   consistency    — agreement of the 3/7/14d per-$ scores: 1 - CoV
//   score          — DATA confidence: the geometric mean of the two, so a well-fed,
//                    consistent ad set can reach the top of the scale
//   predictiveness — the objective's calibrated Spearman ceiling (objectives.ts),
//                    carried as a DISCLOSURE, never multiplied in
//
// It used to be score = predictiveness × sampleSize × consistency. That put a hard
// ceiling on every account equal to its objective's prior (0.45 for lead), so 786
// conversions with all three windows agreeing read "Low 28%" — and the account
// owner could do nothing about the term that held it down. Two things the account
// controls make the score; the thing it cannot control is said beside it.
//
// portfolioConfidence also names WHY the number is what it is: which ad sets sit
// under the event floor, which windows disagree, which ad sets spend with no tracked
// conversions at all — each with what would move the score. Those are the actions.
// ---------------------------------------------------------------------------
import type { EngineConfig } from './config';
import { kpiEvents, scoreAdSet } from './scoring';
import type { AdSetSnapshot, Confidence, ConfidenceActionable } from './types';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Coefficient of variation (std / mean) of a positive series; 0 if < 2 points. */
function cov(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean <= 0) return 0;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance) / mean;
}

/** Data confidence bands. The score is a geometric mean of two 0..1 terms, so 0.75 means
 *  both terms are strong (e.g. 0.9 × 0.63, or 0.75 × 0.75); 0.5 is one strong, one weak. */
function bandOf(score: number): Confidence['band'] {
  return score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';
}

const sampleFloorEvents = (cfg: EngineConfig): number =>
  cfg.confidenceSampleK > 0 ? cfg.confidenceSampleK : 20;

/** The two account-controlled terms and their combination. */
function dataScore(sampleSize: number, consistency: number): number {
  return clamp01(Math.sqrt(clamp01(sampleSize) * clamp01(consistency)));
}

export function confidenceOf(s: AdSetSnapshot, cfg: EngineConfig): Confidence {
  const events = kpiEvents(s.windows.d14, cfg);
  const k = sampleFloorEvents(cfg);
  const sampleSize = events / (events + k);
  const sb = scoreAdSet(s, cfg);
  const scores = [sb.score3d, sb.score7d, sb.score14d].filter((x) => x > 0);
  const consistency = scores.length >= 2 ? clamp01(1 - cov(scores)) : scores.length === 1 ? 0.5 : 0;
  const predictiveness = cfg.predictiveness ?? 0.75;
  const score = dataScore(sampleSize, consistency);
  return {
    score,
    predictiveness,
    sampleSize,
    consistency,
    events,
    band: bandOf(score),
    underFloor: { adsetIds: events < k ? [s.id] : [], floorEvents: k },
    actionables: [],
  };
}

const CONSISTENCY_WEAK = 0.6;

/** Spend-weighted confidence over a set of ad sets — the reliability of the
 *  portfolio's reallocation as a whole — plus what would raise it. */
export function portfolioConfidence(snapshots: AdSetSnapshot[], cfg: EngineConfig): Confidence {
  const k = sampleFloorEvents(cfg);
  const predictiveness = cfg.predictiveness ?? 0.75;
  const empty: Confidence = {
    score: 0,
    predictiveness,
    sampleSize: 0,
    consistency: 0,
    events: 0,
    band: 'low',
    underFloor: { adsetIds: [], floorEvents: k },
    actionables: [],
  };

  type Weighed = { id: string; w: number; c: Confidence; spend: number };
  const weighed: Weighed[] = [];
  for (const s of snapshots) {
    const w = Math.max(s.windows.d14.spend, 0);
    if (w <= 0) continue;
    weighed.push({ id: s.id, w, c: confidenceOf(s, cfg), spend: w });
  }
  const wsum = weighed.reduce((sum, x) => sum + x.w, 0);
  if (wsum <= 0) return empty;

  const mean = (pick: (c: Confidence) => number, rows: Weighed[]): number => {
    const total = rows.reduce((sum, x) => sum + x.w, 0);
    return total > 0 ? rows.reduce((sum, x) => sum + pick(x.c) * x.w, 0) / total : 0;
  };
  const score = mean((c) => c.score, weighed);
  const events = weighed.reduce((sum, x) => sum + x.c.events, 0);

  const underFloor = weighed.filter((x) => x.c.events < k);
  const disagreeing = weighed.filter((x) => x.c.consistency < CONSISTENCY_WEAK && x.c.events >= k);
  const untracked = weighed.filter((x) => x.c.events === 0 && x.spend > cfg.cpaTarget);

  const actionables: ConfidenceActionable[] = [];
  if (underFloor.length > 0) {
    const rest = weighed.filter((x) => x.c.events >= k);
    const projected = rest.length > 0 ? mean((c) => c.score, rest) : null;
    const spendShare = underFloor.reduce((sum, x) => sum + x.w, 0) / wsum;
    actionables.push({
      code: 'under_event_floor',
      adsetIds: underFloor.map((x) => x.id),
      spendShare,
      projectedScore: projected,
      message:
        `${underFloor.length} of ${weighed.length} ad sets are under the ${k}-event floor ` +
        `(${Math.round(spendShare * 100)}% of spend). Consolidating them, or giving them ` +
        `budget until they clear ${k} conversions in 14 days, ` +
        (projected != null && projected > score
          ? `would put data confidence near ${Math.round(projected * 100)}%.`
          : 'is what raises the sample term.'),
    });
  }
  if (disagreeing.length > 0) {
    const rest = weighed.filter((x) => !disagreeing.includes(x));
    const projected = rest.length > 0 ? mean((c) => c.score, rest) : null;
    const spendShare = disagreeing.reduce((sum, x) => sum + x.w, 0) / wsum;
    actionables.push({
      code: 'windows_disagree',
      adsetIds: disagreeing.map((x) => x.id),
      spendShare,
      projectedScore: projected,
      message:
        `${disagreeing.length} ad set${disagreeing.length === 1 ? '' : 's'} score differently ` +
        `over 3, 7 and 14 days (${Math.round(spendShare * 100)}% of spend) — a recent change ` +
        'or noisy delivery. Reading them on the 14-day window, or waiting a cycle, settles it.',
    });
  }
  if (untracked.length > 0) {
    const spendShare = untracked.reduce((sum, x) => sum + x.w, 0) / wsum;
    actionables.push({
      code: 'tracking_gap',
      adsetIds: untracked.map((x) => x.id),
      spendShare,
      projectedScore: null,
      message:
        `${untracked.length} ad set${untracked.length === 1 ? '' : 's'} spent more than a ` +
        'target CPA over 14 days with no tracked conversions at all. The engine reads that as ' +
        'failure and will defund them; if they do convert, the pixel / CAPI is not reporting it.',
    });
  }

  return {
    score,
    predictiveness,
    sampleSize: mean((c) => c.sampleSize, weighed),
    consistency: mean((c) => c.consistency, weighed),
    events,
    band: bandOf(score),
    underFloor: { adsetIds: underFloor.map((x) => x.id), floorEvents: k },
    actionables,
  };
}
