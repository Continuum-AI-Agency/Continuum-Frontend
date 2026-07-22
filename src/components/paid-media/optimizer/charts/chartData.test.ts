import { describe, expect, it } from 'bun:test';
import type { CpaSeriesPoint, CycleItemRow, PortfolioListItem } from '@continuum/contracts';
import { freezeLabel, parseReport } from '../reportModel';
import {
  budgetByObjective,
  budgetByPortfolio,
  budgetMix,
  buildCpaTrendPoints,
  cpaTrendSummary,
  splitReallocation,
} from './chartData';

function cpaPoint(over: Partial<CpaSeriesPoint>): CpaSeriesPoint {
  return {
    cycle_ts: '2026-07-01T00:00:00Z',
    spend_d3: 0,
    conv_d3: 0,
    spend_d7: 0,
    conv_d7: 0,
    spend_d14: 0,
    conv_d14: 0,
    adsets: 1,
    ...over,
  };
}

describe('buildCpaTrendPoints', () => {
  it('derives CPA per cycle, drops no-conversion cycles, and sorts chronologically', () => {
    const series = [
      cpaPoint({ cycle_ts: '2026-07-03T00:00:00Z', spend_d7: 760, conv_d7: 20 }), // $38
      cpaPoint({ cycle_ts: '2026-07-01T00:00:00Z', spend_d7: 500, conv_d7: 10 }), // $50
      cpaPoint({ cycle_ts: '2026-07-02T00:00:00Z', spend_d7: 300, conv_d7: 0 }), // no signal → dropped
    ];
    const points = buildCpaTrendPoints(series);
    expect(points.map((p) => p.cpa)).toEqual([50, 38]);
  });
});

describe('cpaTrendSummary', () => {
  it('reports the latest CPA and improving (negative) delta', () => {
    const points = buildCpaTrendPoints([
      cpaPoint({ cycle_ts: '2026-07-01T00:00:00Z', spend_d7: 500, conv_d7: 10 }),
      cpaPoint({ cycle_ts: '2026-07-03T00:00:00Z', spend_d7: 760, conv_d7: 20 }),
    ]);
    expect(cpaTrendSummary(points)).toEqual({ last: 38, deltaPct: -24 });
  });
  it('returns null with fewer than two points', () => {
    expect(cpaTrendSummary([])).toBeNull();
  });
});

function item(over: Partial<CycleItemRow>): CycleItemRow {
  return {
    adset_id: 'a',
    current_budget: 100,
    final_budget: 100,
    change_abs: 0,
    change_pct: 0,
    ...over,
  } as CycleItemRow;
}

describe('splitReallocation', () => {
  it('splits gainers/losers and EXCLUDES held items (freezeReason)', () => {
    const items = [
      item({ adset_id: 'gain', change_abs: 380 }),
      item({ adset_id: 'loss', change_abs: -410 }),
      item({ adset_id: 'held', change_abs: 0, diagnostics: { freezeReason: 'no_conversions' } }),
      item({ adset_id: 'noise', change_abs: 0 }),
    ];
    const flow = splitReallocation(items);
    expect(flow.gaining.map((r) => r.adsetId)).toEqual(['gain']);
    expect(flow.losing.map((r) => r.adsetId)).toEqual(['loss']);
    expect(flow.totalMoved).toBe(380);
    expect(flow.maxAbs).toBe(410);
  });

  it('carries the current→proposed budget pair and signed % per moved row', () => {
    const items = [
      item({
        adset_id: 'gain',
        current_budget: 40,
        final_budget: 60,
        change_abs: 20,
        change_pct: 0.5,
      }),
    ];
    const flow = splitReallocation(items);
    expect(flow.gaining[0]).toMatchObject({
      adsetId: 'gain',
      change: 20,
      current: 40,
      proposed: 60,
      changePct: 0.5,
    });
  });
});

describe('budgetByObjective', () => {
  it('sums daily_total per objective, descending', () => {
    const portfolios = [
      { objective: 'purchase', daily_total: 4200 },
      { objective: 'lead', daily_total: 1500 },
      { objective: 'purchase', daily_total: 800 },
    ] as PortfolioListItem[];
    expect(budgetByObjective(portfolios)).toEqual([
      { name: 'Purchase', daily: 5000 },
      { name: 'Lead', daily: 1500 },
    ]);
  });
});

describe('budgetByPortfolio', () => {
  it('lists funded portfolios by name descending, dropping zero/null-budget ones', () => {
    const portfolios = [
      { name: 'Alpha', daily_total: 2100 },
      { name: 'Beta', daily_total: 2200 },
      { name: 'Draft', daily_total: null },
      { name: 'Zero', daily_total: 0 },
    ] as PortfolioListItem[];
    expect(budgetByPortfolio(portfolios)).toEqual([
      { name: 'Beta', daily: 2200 },
      { name: 'Alpha', daily: 2100 },
    ]);
  });
});

describe('budgetMix', () => {
  it('splits by objective when 2+ objectives carry budget', () => {
    const portfolios = [
      { name: 'A', objective: 'purchase', daily_total: 300 },
      { name: 'B', objective: 'lead', daily_total: 120 },
    ] as PortfolioListItem[];
    expect(budgetMix(portfolios)).toEqual({
      dimension: 'objective',
      slices: [
        { name: 'Purchase', daily: 300 },
        { name: 'Lead', daily: 120 },
      ],
    });
  });

  it('falls back to per-portfolio when every portfolio shares one objective', () => {
    const portfolios = [
      { name: 'Daniel — resto', objective: 'conversations', daily_total: 2100 },
      { name: 'Daniel — todas', objective: 'conversations', daily_total: 2200 },
    ] as PortfolioListItem[];
    expect(budgetMix(portfolios)).toEqual({
      dimension: 'portfolio',
      slices: [
        { name: 'Daniel — todas', daily: 2200 },
        { name: 'Daniel — resto', daily: 2100 },
      ],
    });
  });

  it('ignores unfunded objectives when deciding the dimension', () => {
    const portfolios = [
      { name: 'A', objective: 'purchase', daily_total: 300 },
      { name: 'B', objective: 'lead', daily_total: 0 },
    ] as PortfolioListItem[];
    // Only one objective actually carries budget → per-portfolio fallback.
    expect(budgetMix(portfolios).dimension).toBe('portfolio');
  });
});

describe('freezeReason survives the real contracts parse (WS0+WS1 boundary)', () => {
  it('parseReport keeps diagnostics.freezeReason and freezeLabel renders the Held state', () => {
    const report = {
      portfolio: null,
      latest_run: null,
      latest_items: [
        {
          adset_id: 'held_adset',
          current_budget: 100,
          final_budget: 100,
          change_abs: 0,
          change_pct: 0,
          diagnostics: { freezeReason: 'unsupported_budget' },
        },
      ],
      recommendations: [],
      history: [],
    };
    const parsed = parseReport(report);
    const reason = parsed?.latest_items[0]?.diagnostics?.freezeReason;
    expect(reason).toBe('unsupported_budget');
    expect(freezeLabel(reason)?.label).toBe('Held · CBO/lifetime');
  });
});
