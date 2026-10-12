import { describe, expect, it } from 'bun:test';
import type { AdSetSnapshot, CycleItemRow } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { adsetTableRows, scoredEvents } from './adsetTableRows';
import { readBody } from './news/realBodies.fixture';

// Regression: on the live FORMULARIOS // TODOS portfolio (Easy Fit, 2026-10-12) the table read
// "—" leads on every row beside a measured CPL, while the hero said 59 leads. The leads came
// from the account snapshot read, which lists ACTIVE ad sets only — the portfolio's ad sets
// were not in it, so no row joined. The count now comes from the engine interval the cost
// comes from.

const lead = getOptimizationMetricDefinition('lead');

type Interval = { cpa: number; lo: number; hi: number | null; events: number };

const item = (adset_id: string, ci?: Interval): CycleItemRow =>
  ({
    adset_id,
    adset_name: `Ad set ${adset_id}`,
    current_budget: 100,
    final_budget: 100,
    change_abs: 0,
    change_pct: 0,
    diagnostics: ci ? { ci } : undefined,
  }) as unknown as CycleItemRow;

const snapshot = (id: string, leads: number): AdSetSnapshot =>
  ({
    id,
    status: 'active',
    currentBudget: 100,
    ageDays: 30,
    windows: { d3: { spend: 0 }, d7: { spend: 300, leads }, d14: { spend: 600, leads } },
  }) as unknown as AdSetSnapshot;

describe('the ad-set table rows', () => {
  it('reads every row’s leads off the engine interval when no snapshot joins (the live bug)', () => {
    const { report } = readBody('formularios');
    const rows = adsetTableRows(report.latest_items, {
      metric: lead,
      snapshotById: new Map(),
      nameById: new Map(),
    });
    expect(rows.every((row) => row.results != null)).toBe(true);
    // The table now sums to what the engine scored, the figure the hero's growth read carries.
    const total = rows.reduce((sum, row) => sum + (row.results ?? 0), 0);
    expect(total).toBe(report.latest_run?.confidence?.events ?? Number.NaN);
    expect(total).toBe(80);
  });

  it('keeps the count and the cost on one window even when a snapshot joins', () => {
    const rows = adsetTableRows([item('a', { cpa: 25, lo: 15, hi: 45, events: 14 })], {
      metric: lead,
      snapshotById: new Map([['a', snapshot('a', 3)]]),
      nameById: new Map(),
    });
    expect(rows[0]).toMatchObject({ results: 14, cost: 25 });
  });

  it('a zero-event interval is zero leads, not a blank', () => {
    const rows = adsetTableRows([item('z', { cpa: 0, lo: 0, hi: null, events: 0 })], {
      metric: lead,
      snapshotById: new Map(),
      nameById: new Map(),
    });
    expect(rows[0]).toMatchObject({ results: 0, cost: null });
  });

  it('a row the engine did not score falls back to the snapshot', () => {
    const rows = adsetTableRows([item('s')], {
      metric: lead,
      snapshotById: new Map([['s', snapshot('s', 6)]]),
      nameById: new Map(),
    });
    expect(rows[0]?.results).toBe(6);
    expect(scoredEvents(item('s'))).toBeNull();
  });
});
