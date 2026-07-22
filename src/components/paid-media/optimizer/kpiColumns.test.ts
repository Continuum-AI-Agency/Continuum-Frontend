import { describe, expect, it } from 'bun:test';

import { type AdSetSnapshot, getOptimizationMetricDefinition } from '@continuum/contracts';
import { flowToRow, itemToRow, kpiColumns, snapshotToRow } from './kpiColumns';

const window7 = (over: Record<string, number>) => ({
  spend: 0,
  purchases: 0,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
  ...over,
});

function snapshot(
  id: string,
  d7: Record<string, number>,
  d14?: Record<string, number>,
): AdSetSnapshot {
  return {
    id,
    status: 'active',
    currentBudget: 100,
    ageDays: 30,
    windows: {
      d3: window7({}),
      d7: window7(d7),
      d14: window7(d14 ?? d7),
    },
  } as AdSetSnapshot;
}

describe('kpiColumns headers switch by objective', () => {
  it('lead → Leads / CPL', () => {
    const cols = kpiColumns({ metric: getOptimizationMetricDefinition('lead') });
    expect(cols.map((c) => c.id)).toEqual(['name', 'results', 'cost']);
    expect(cols.find((c) => c.id === 'results')?.header).toBe('Leads');
    expect(cols.find((c) => c.id === 'cost')?.header).toBe('CPL');
  });

  it('awareness → Impressions / CPM', () => {
    const cols = kpiColumns({ metric: getOptimizationMetricDefinition('awareness') });
    expect(cols.find((c) => c.id === 'results')?.header).toBe('Impressions');
    expect(cols.find((c) => c.id === 'cost')?.header).toBe('CPM');
  });

  it('conversations → Conversations / Cost per conversation', () => {
    const cols = kpiColumns({ metric: getOptimizationMetricDefinition('conversations') });
    expect(cols.find((c) => c.id === 'results')?.header).toBe('Conversations');
    expect(cols.find((c) => c.id === 'cost')?.header).toBe('Cost per conversation');
  });

  it('adds the display-only ROAS column only when included', () => {
    const base = kpiColumns({ metric: getOptimizationMetricDefinition('purchase') });
    expect(base.some((c) => c.id === 'roas')).toBe(false);
    const withRoas = kpiColumns({
      metric: getOptimizationMetricDefinition('purchase'),
      include: { roas: true },
    });
    expect(withRoas.some((c) => c.id === 'roas')).toBe(true);
  });
});

describe('itemToRow joins the objective KPI from the d7 snapshot window', () => {
  it('lead: CPL = spend / leads (no multiplier)', () => {
    const metric = getOptimizationMetricDefinition('lead');
    const row = itemToRow(
      {
        adset_id: 'act_1::a',
        current_budget: 100,
        final_budget: 120,
        change_abs: 20,
        change_pct: 20,
      },
      { metric, snapshot: snapshot('act_1::a', { spend: 360, leads: 10 }) },
    );
    expect(row.results).toBe(10);
    expect(row.cost).toBe(36); // 360 / 10
  });

  it('awareness: CPM applies the ×1000 denominator', () => {
    const metric = getOptimizationMetricDefinition('awareness');
    const row = itemToRow(
      {
        adset_id: 'act_1::b',
        current_budget: 100,
        final_budget: 100,
        change_abs: 0,
        change_pct: 0,
      },
      { metric, snapshot: snapshot('act_1::b', { spend: 100, impressions: 10_000 }) },
    );
    expect(row.results).toBe(10_000);
    expect(row.cost).toBe(10); // (100 / 10000) * 1000
  });

  it('conversations: cost per conversation from the conversations count', () => {
    const metric = getOptimizationMetricDefinition('conversations');
    const row = itemToRow(
      {
        adset_id: 'act_1::c',
        current_budget: 100,
        final_budget: 100,
        change_abs: 0,
        change_pct: 0,
      },
      { metric, snapshot: snapshot('act_1::c', { spend: 200, conversations: 5 }) },
    );
    expect(row.results).toBe(5);
    expect(row.cost).toBe(40); // 200 / 5
  });

  it('prefers the CI point estimate for cost when diagnostics carry one', () => {
    const metric = getOptimizationMetricDefinition('purchase');
    const row = itemToRow(
      {
        adset_id: 'act_1::d',
        current_budget: 100,
        final_budget: 100,
        change_abs: 0,
        change_pct: 0,
        diagnostics: { ci: { cpa: 22, lo: 16, hi: 30, events: 55 } },
      },
      { metric },
    );
    expect(row.cost).toBe(22);
    expect(row.ci?.hi).toBe(30);
  });

  it('carries the freeze reason and leaves cost null for a held ad set', () => {
    const metric = getOptimizationMetricDefinition('lead');
    const row = itemToRow(
      {
        adset_id: 'act_1::e',
        current_budget: 100,
        final_budget: 100,
        change_abs: 0,
        change_pct: 0,
        diagnostics: { freezeReason: 'unsupported_budget' },
      },
      { metric },
    );
    expect(row.freezeReason).toBe('unsupported_budget');
    expect(row.cost).toBeNull();
  });
});

describe('sortValue is monotonic in the underlying metric', () => {
  const metric = getOptimizationMetricDefinition('lead');
  const cols = kpiColumns({ metric });
  const results = cols.find((c) => c.id === 'results');
  const cost = cols.find((c) => c.id === 'cost');

  const low = itemToRow(
    {
      adset_id: 'lo',
      current_budget: 0,
      final_budget: 0,
      change_abs: 0,
      change_pct: 0,
      diagnostics: { ci: { cpa: 20 } },
    },
    { metric, snapshot: snapshot('lo', { spend: 100, leads: 10 }) },
  );
  const high = itemToRow(
    {
      adset_id: 'hi',
      current_budget: 0,
      final_budget: 0,
      change_abs: 0,
      change_pct: 0,
      diagnostics: { ci: { cpa: 60 } },
    },
    { metric, snapshot: snapshot('hi', { spend: 100, leads: 40 }) },
  );

  it('results sort rises with the result count', () => {
    expect(Number(results?.sortValue?.(low))).toBeLessThan(Number(results?.sortValue?.(high)));
  });

  it('cost sort rises with the cost estimate', () => {
    expect(Number(cost?.sortValue?.(low))).toBeLessThan(Number(cost?.sortValue?.(high)));
  });
});

describe('snapshotToRow and flowToRow adapters', () => {
  it('snapshotToRow derives cost from the 14-day window and the ad-set name', () => {
    const metric = getOptimizationMetricDefinition('lead');
    const snap = snapshot('act_1::s', { spend: 10, leads: 1 }, { spend: 200, leads: 5 });
    snap.name = 'Prospecting — Broad';
    const row = snapshotToRow(snap, { metric });
    expect(row.name).toBe('Prospecting — Broad');
    expect(row.cost).toBe(40); // 200 / 5 from d14
  });

  it('flowToRow keeps the change fields and reads "—"-worthy cost without a snapshot', () => {
    const row = flowToRow({
      adset_id: 'act_1::f',
      current_budget: 100,
      final_budget: 140,
      change_abs: 40,
      change_pct: 40,
    });
    expect(row.changeAbs).toBe(40);
    expect(row.cost).toBeNull();
    expect(row.results).toBeNull();
  });
});
