// ---------------------------------------------------------------------------
// realdata — bridge REAL ingest snapshots into the backtest harness.
//
// The backtest (backtest.ts) grades the engine on an `AdSetSeries[]` — a per-day
// {day, spend, events} series where `events` is ONE generic count and the objective
// decides which WindowMetrics field it stands for. The production ingest
// (paid-media-metrics → AdSetSnapshot) already carries exactly that daily grain on
// `snapshot.daily[]`, keyed by real KPI fields. This module is the (pure) adapter:
// pick each ad set's declared KPI field as `events`, turn the ISO date into a stable
// epoch-day, and hand the result to the existing harness. No I/O — the caller fetches.
// ---------------------------------------------------------------------------

import type { AdSetSeries, BacktestReport } from './backtest';
import { backtestPredictiveness, buildEvalSamples } from './backtest';
import type { DeepPartial, EngineConfig } from './config';
import { OBJECTIVE_PROFILES } from './objectives';
import type { AdSetSnapshot, OptimizationObjective, WindowMetrics } from './types';

const EPOCH_DAY_MS = 86_400_000;

/** Reverse of `OBJECTIVE_PROFILES[o].kpiField`. Each objective declares a DISTINCT
 *  kpiField, so a snapshot's declared kpiField maps back to exactly one objective. Built
 *  once from the profiles so it can never drift from them. */
export const KPI_FIELD_TO_OBJECTIVE = Object.fromEntries(
  Object.values(OBJECTIVE_PROFILES).map((p) => [p.kpiField, p.objective]),
) as Record<keyof WindowMetrics, OptimizationObjective>;

export type SnapshotsToSeriesOptions = {
  /** Objective for ad sets whose snapshot carries no (or an unrecognized) kpiField. */
  defaultObjective?: OptimizationObjective;
  /** Resolve the objective when the snapshot carries no `kpiField` (unset at ingest, or an
   *  account whose declared goal isn't stamped). Lets the caller inject Meta's goal-taxonomy
   *  mapping — a boundary concern the engine deliberately doesn't bake in — or an observed-KPI
   *  fallback. Consulted after `kpiField`, before `defaultObjective`. Return undefined to defer. */
  resolveObjective?: (s: AdSetSnapshot) => OptimizationObjective | undefined;
};

/** Resolve the objective an ad set is being scored on: its declared kpiField first
 *  (stable at zero — the currency it said it was buying), then the caller's resolver
 *  (e.g. optimization_goal mapping), then the caller default, then `purchase` (the
 *  engine's own default kpiField). */
function objectiveOf(s: AdSetSnapshot, opts: SnapshotsToSeriesOptions): OptimizationObjective {
  const fromField = s.kpiField ? KPI_FIELD_TO_OBJECTIVE[s.kpiField] : undefined;
  return fromField ?? opts.resolveObjective?.(s) ?? opts.defaultObjective ?? 'purchase';
}

/** Convert ingest snapshots into backtest `AdSetSeries`. Snapshots without a usable
 *  `daily[]` series are dropped (the backtest needs the per-day grain to measure realized
 *  next-period efficiency — a windows-only snapshot cannot produce a single sample). */
export function snapshotsToSeries(
  snapshots: AdSetSnapshot[],
  opts: SnapshotsToSeriesOptions = {},
): AdSetSeries[] {
  const series: AdSetSeries[] = [];
  for (const s of snapshots) {
    if (!s.daily || s.daily.length === 0) continue;
    const objective = objectiveOf(s, opts);
    const kpiField = OBJECTIVE_PROFILES[objective].kpiField;
    series.push({
      id: s.id,
      objective,
      audienceType: s.audienceType,
      ageDays: s.ageDays,
      daily: s.daily.map((d) => ({
        // ISO date → epoch-day: a stable integer index that PRESERVES calendar gaps
        // (buildEvalSamples reads days through a Map and tolerates missing ones).
        day: Math.round(Date.parse(d.date) / EPOCH_DAY_MS),
        spend: d.spend,
        // The declared KPI field is this ad set's `events`. Optional fields (leads,
        // conversations, …) may be undefined on a given day → 0, never NaN.
        events: (d[kpiField] as number | undefined) ?? 0,
      })),
    });
  }
  return series;
}

export type BacktestSnapshotsOptions = SnapshotsToSeriesOptions & {
  /** Backtest window stride (default 3, from buildEvalSamples). */
  stride?: number;
  /** Realized-efficiency horizon in days (default 3, from buildEvalSamples). */
  nextDays?: number;
  /** Config override passed to the scorer — A/B a scoring change without touching the engine. */
  override?: DeepPartial<EngineConfig>;
};

export type BacktestSnapshotsResult = {
  report: BacktestReport;
  /** Total eval samples produced (== report.overall.n). */
  sampleCount: number;
  /** Ad sets that yielded a series (had a daily grain). */
  seriesCount: number;
  /** Ad sets dropped for want of a daily series (coverage gap the caller should surface). */
  skipped: number;
};

/** One-call convenience: real snapshots → series → eval samples → Spearman report,
 *  plus the coverage counts a harness/onboarding surface needs to report honestly. */
export function backtestSnapshots(
  snapshots: AdSetSnapshot[],
  opts: BacktestSnapshotsOptions = {},
): BacktestSnapshotsResult {
  const series = snapshotsToSeries(snapshots, opts);
  const samples = buildEvalSamples(series, { stride: opts.stride, nextDays: opts.nextDays });
  const report = backtestPredictiveness(samples, opts.override);
  return {
    report,
    sampleCount: samples.length,
    seriesCount: series.length,
    skipped: snapshots.length - series.length,
  };
}
