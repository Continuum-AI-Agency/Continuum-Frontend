// ---------------------------------------------------------------------------
// BACKTEST HARNESS — makes "how significant is the 3/7/14 signal" a NUMBER.
// For each ad set at cycle t we have its trailing 3/7/14d windows; we measure
// how well the engine's score at t ranks the efficiency the ad set ACTUALLY
// realizes in the next period (Spearman rank correlation), overall, per
// objective, and per window. This is the baseline any scoring change (precision
// weighting, shrinkage, …) must beat — it does NOT change the engine, only
// grades it on a dataset.
// ---------------------------------------------------------------------------

import { resolveConfig, type DeepPartial, type EngineConfig } from './config';
import { OBJECTIVE_PROFILES } from './objectives';
import { scoreAdSet, windowScore } from './scoring';
import type { AdSetSnapshot, OptimizationObjective, WindowMetrics } from './types';

/** One backtest observation: an ad set at cycle t, plus the efficiency (events
 *  per $) it actually realized in the FOLLOWING period. */
export type EvalSample = {
  objective?: OptimizationObjective;
  snapshot: AdSetSnapshot;
  nextEfficiency: number;
};

/** Spearman rank correlation. 0 for < 3 points or zero variance (rank ties averaged). */
export function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const rank = (arr: number[]): number[] => {
    const idx = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(arr.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avgRank = (i + j) / 2 + 1; // 1-based average rank for ties
      for (let k = i; k <= j; k++) r[idx[k][1]] = avgRank;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs.slice(0, n));
  const ry = rank(ys.slice(0, n));
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx, b = ry[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

export type WindowPredictiveness = { d3: number; d7: number; d14: number };
export type ObjectivePredictiveness = {
  n: number;
  composite: number; // Spearman(composite score, realized next efficiency)
  perWindow: WindowPredictiveness;
};
export type BacktestReport = {
  overall: ObjectivePredictiveness;
  byObjective: Record<string, ObjectivePredictiveness>;
};

function predictivenessFor(samples: EvalSample[], override?: DeepPartial<EngineConfig>): ObjectivePredictiveness {
  const composite: number[] = [];
  const w3: number[] = [], w7: number[] = [], w14: number[] = [];
  const next: number[] = [];
  for (const s of samples) {
    const cfg = resolveConfig({ objective: s.objective, ...override });
    composite.push(scoreAdSet(s.snapshot, cfg).composite);
    w3.push(windowScore(s.snapshot.windows.d3, cfg));
    w7.push(windowScore(s.snapshot.windows.d7, cfg));
    w14.push(windowScore(s.snapshot.windows.d14, cfg));
    next.push(s.nextEfficiency);
  }
  return {
    n: samples.length,
    composite: spearman(composite, next),
    perWindow: { d3: spearman(w3, next), d7: spearman(w7, next), d14: spearman(w14, next) },
  };
}

/** Headline metric: how well the score predicts realized next-period efficiency,
 *  overall and per objective. Pass a config `override` to A/B a scoring change. */
export function backtestPredictiveness(
  samples: EvalSample[],
  override?: DeepPartial<EngineConfig>,
): BacktestReport {
  const groups = new Map<string, EvalSample[]>();
  for (const s of samples) {
    const key = s.objective ?? 'default';
    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }
  const byObjective: Record<string, ObjectivePredictiveness> = {};
  for (const [key, arr] of groups) byObjective[key] = predictivenessFor(arr, override);
  return { overall: predictivenessFor(samples, override), byObjective };
}

// --- Build eval samples from raw daily rows -------------------------------------
export type DailyRow = { day: number; spend: number; events: number };
export type AdSetSeries = {
  id: string;
  objective?: OptimizationObjective;
  audienceType?: AdSetSnapshot['audienceType'];
  ageDays?: number;
  daily: DailyRow[]; // one row per day (day = integer index or epoch-day)
};

function kpiWindow(obj: OptimizationObjective | undefined, spend: number, events: number): WindowMetrics {
  const base: WindowMetrics = { spend, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
  const field: keyof WindowMetrics = obj ? OBJECTIVE_PROFILES[obj].kpiField : 'purchases';
  return { ...base, [field]: events };
}

/** Slide cycle dates over each ad set's daily series, pairing the 3/7/14 trailing
 *  windows at t with the efficiency realized over the next `nextDays`. */
export function buildEvalSamples(series: AdSetSeries[], opts?: { stride?: number; nextDays?: number }): EvalSample[] {
  const stride = opts?.stride ?? 3;
  const nextDays = opts?.nextDays ?? 3;
  const samples: EvalSample[] = [];
  for (const s of series) {
    if (s.daily.length === 0) continue;
    const byDay = new Map<number, DailyRow>();
    let minDay = Infinity, maxDay = -Infinity;
    for (const d of s.daily) { byDay.set(d.day, d); minDay = Math.min(minDay, d.day); maxDay = Math.max(maxDay, d.day); }
    const sumWin = (end: number, len: number) => {
      let spend = 0, events = 0;
      for (let d = end - len + 1; d <= end; d++) { const r = byDay.get(d); if (r) { spend += r.spend; events += r.events; } }
      return { spend, events };
    };
    for (let t = minDay + 13; t + nextDays <= maxDay; t += stride) {
      const d3 = sumWin(t, 3), d7 = sumWin(t, 7), d14 = sumWin(t, 14);
      if (d14.spend <= 0) continue;
      const nxt = sumWin(t + nextDays, nextDays);
      const nextEfficiency = nxt.spend > 0 ? nxt.events / nxt.spend : 0;
      samples.push({
        objective: s.objective,
        nextEfficiency,
        snapshot: {
          id: s.id,
          status: 'active',
          currentBudget: 0,
          ageDays: s.ageDays ?? 30,
          audienceType: s.audienceType,
          windows: {
            d3: kpiWindow(s.objective, d3.spend, d3.events),
            d7: kpiWindow(s.objective, d7.spend, d7.events),
            d14: kpiWindow(s.objective, d14.spend, d14.events),
          },
        },
      });
    }
  }
  return samples;
}
