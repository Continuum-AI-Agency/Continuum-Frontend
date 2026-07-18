// ---------------------------------------------------------------------------
// realdata — snapshot → AdSetSeries bridge + a backtest-on-snapshots convenience.
// These tests pin the boundary contract: the RIGHT KPI field becomes `events`,
// the ISO date becomes a stable epoch-day, the objective is resolved from the
// ad set's declared kpiField, daily-less snapshots are skipped, and the whole
// thing chains into the existing backtest harness to a finite Spearman.
// ---------------------------------------------------------------------------

import { describe, expect, test } from 'bun:test';
import { backtestSnapshots, KPI_FIELD_TO_OBJECTIVE, snapshotsToSeries } from './realdata';
import type { AdSetSnapshot, DailyMetrics, WindowMetrics } from './types';

const EPOCH_DAY_MS = 86_400_000;

/** One daily row: required WindowMetrics fields at 0, plus spend and the chosen KPI field. */
function day(
  date: string,
  spend: number,
  events: number,
  kpiField: keyof WindowMetrics = 'purchases',
): DailyMetrics {
  const base: WindowMetrics = { spend, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
  return { ...base, [kpiField]: events, date };
}

function isoRange(startIso: string, days: number): string[] {
  const start = Date.parse(startIso);
  return Array.from({ length: days }, (_, i) =>
    new Date(start + i * EPOCH_DAY_MS).toISOString().slice(0, 10),
  );
}

function snapshot(over: Partial<AdSetSnapshot> & { daily?: DailyMetrics[] }): AdSetSnapshot {
  const zero: WindowMetrics = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
  return {
    id: 'as_1',
    status: 'active',
    currentBudget: 40,
    ageDays: 30,
    windows: { d3: zero, d7: zero, d14: zero },
    ...over,
  };
}

describe('KPI_FIELD_TO_OBJECTIVE', () => {
  test('is the unambiguous reverse of each objective profile kpiField', () => {
    expect(KPI_FIELD_TO_OBJECTIVE.purchases).toBe('purchase');
    expect(KPI_FIELD_TO_OBJECTIVE.leads).toBe('lead');
    expect(KPI_FIELD_TO_OBJECTIVE.appInstalls).toBe('app_install');
    expect(KPI_FIELD_TO_OBJECTIVE.landingPageViews).toBe('traffic');
    expect(KPI_FIELD_TO_OBJECTIVE.impressions).toBe('awareness');
    expect(KPI_FIELD_TO_OBJECTIVE.conversations).toBe('conversations');
  });
});

describe('snapshotsToSeries', () => {
  test('picks `events` from the ad set kpiField and resolves the objective from it', () => {
    const s = snapshot({
      kpiField: 'leads',
      daily: [day('2026-01-01', 100, 5, 'leads'), day('2026-01-02', 120, 8, 'leads')],
    });
    const [series] = snapshotsToSeries([s]);
    expect(series.objective).toBe('lead');
    expect(series.daily.map((d) => d.events)).toEqual([5, 8]);
    expect(series.daily.map((d) => d.spend)).toEqual([100, 120]);
  });

  test('derives a stable epoch-day from the ISO date (consecutive days differ by 1)', () => {
    const s = snapshot({
      kpiField: 'purchases',
      daily: [day('2026-03-10', 10, 1), day('2026-03-11', 10, 1), day('2026-03-13', 10, 1)],
    });
    const [series] = snapshotsToSeries([s]);
    const [d0, d1, d2] = series.daily.map((d) => d.day);
    expect(d1 - d0).toBe(1);
    expect(d2 - d1).toBe(2); // gap preserved (the 12th is missing)
    expect(d0).toBe(Math.round(Date.parse('2026-03-10') / EPOCH_DAY_MS));
  });

  test('falls back to defaultObjective, then to purchase, when kpiField is absent', () => {
    const bare = snapshot({ daily: [day('2026-01-01', 10, 2)] });
    expect(snapshotsToSeries([bare])[0].objective).toBe('purchase');
    expect(snapshotsToSeries([bare], { defaultObjective: 'awareness' })[0].objective).toBe(
      'awareness',
    );
  });

  test('consults resolveObjective when kpiField is absent, before defaultObjective', () => {
    // A CONVERSATIONS account with no stamped kpiField: the caller maps optimization_goal.
    const s = snapshot({
      optimization_goal: 'CONVERSATIONS',
      daily: [day('2026-01-01', 100, 5, 'leads')],
    });
    const series = snapshotsToSeries([s], {
      defaultObjective: 'purchase',
      resolveObjective: (snap) =>
        snap.optimization_goal === 'CONVERSATIONS' ? 'conversations' : undefined,
    })[0];
    expect(series.objective).toBe('conversations'); // resolver wins over defaultObjective
  });

  test('kpiField still wins over resolveObjective when present', () => {
    const s = snapshot({
      kpiField: 'leads',
      optimization_goal: 'CONVERSATIONS',
      daily: [day('2026-01-01', 100, 5, 'leads')],
    });
    const series = snapshotsToSeries([s], { resolveObjective: () => 'conversations' })[0];
    expect(series.objective).toBe('lead');
  });

  test('carries id, audienceType and ageDays straight through', () => {
    const s = snapshot({
      id: 'as_xyz',
      ageDays: 17,
      audienceType: 'prospecting',
      kpiField: 'purchases',
      daily: [day('2026-01-01', 10, 1)],
    });
    const [series] = snapshotsToSeries([s]);
    expect(series.id).toBe('as_xyz');
    expect(series.ageDays).toBe(17);
    expect(series.audienceType).toBe('prospecting');
  });

  test('skips snapshots with no usable daily series', () => {
    const withDaily = snapshot({
      id: 'has',
      kpiField: 'purchases',
      daily: [day('2026-01-01', 10, 1)],
    });
    const noDaily = snapshot({ id: 'none' });
    const emptyDaily = snapshot({ id: 'empty', daily: [] });
    const series = snapshotsToSeries([withDaily, noDaily, emptyDaily]);
    expect(series.map((s) => s.id)).toEqual(['has']);
  });
});

describe('backtestSnapshots', () => {
  test('chains snapshot → series → backtest and reports coverage counts', () => {
    // A 30-day series with a clear efficiency trend so the score has something to rank.
    const dates = isoRange('2026-01-01', 30);
    const daily = dates.map((date, i) =>
      // spend flat, events climbing → efficiency rises over time (rankable signal)
      day(date, 50, 2 + i, 'purchases'),
    );
    const s = snapshot({ id: 'trend', kpiField: 'purchases', daily });
    const noDaily = snapshot({ id: 'skipme' });

    const { report, sampleCount, seriesCount, skipped } = backtestSnapshots([s, noDaily]);

    expect(seriesCount).toBe(1);
    expect(skipped).toBe(1);
    expect(sampleCount).toBeGreaterThan(0);
    expect(report.byObjective.purchase).toBeDefined();
    expect(Number.isFinite(report.overall.composite)).toBe(true);
    expect(report.overall.n).toBe(sampleCount);
  });

  test('returns an empty report (no throw) when nothing carries a daily series', () => {
    const { report, sampleCount, seriesCount } = backtestSnapshots([snapshot({ id: 'x' })]);
    expect(seriesCount).toBe(0);
    expect(sampleCount).toBe(0);
    expect(report.overall.n).toBe(0);
  });
});
