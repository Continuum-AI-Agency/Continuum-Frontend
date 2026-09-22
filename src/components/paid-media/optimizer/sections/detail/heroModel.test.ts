import { describe, expect, it } from 'bun:test';
import { buildHeroView } from './heroModel';

const metric = {
  kpiField: 'leads',
  resultLabel: 'Leads',
  costLabel: 'Cost per lead',
  targetLabel: 'CPL',
  denominatorMultiplier: 1,
} as never;
const recap = {
  source: 'daily',
  windowUsed: null,
  current: {
    spend: 3640,
    results: 47,
    impressions: 0,
    clicks: 0,
    costPerResult: 77.45,
    daysCovered: 7,
  },
  previous: {
    spend: 3000,
    results: 35,
    impressions: 0,
    clicks: 0,
    costPerResult: 85.7,
    daysCovered: 7,
  },
  series: [
    { date: '2026-09-13', spend: 500, results: 6 },
    { date: '2026-09-14', spend: 520, results: 7 },
  ],
  delta: { spend: 0.21, results: 0.34, costPerResult: -0.1 },
  vsTarget: 0.11,
} as never;
const portfolio = { id: 'p1', apply_mode: 'recommend', daily_total: 500 } as never;
const rec = {
  id: '2f1c1c1e-0000-4000-8000-000000000001',
  adset_id: 'as-3',
  adset_name: 'Dead',
  kind: 'pause',
  trigger: 'P1_zero_upper_funnel',
  severity: 'high',
  reason: 'No leads in 7 days.',
  status: 'pending',
  evidence: {
    metric: 'conversions',
    value: 0,
    comparator: '=',
    threshold: 1,
    window: 'd7',
    estImpactPerDay: 120,
    source: 'engine',
  },
  seed: null,
};

/** The row the engine synthesises for a portfolio with NO declared flight: nothing was
 *  planned, so there is nothing to be on or off track of. */
const pacingWithoutAFlight = {
  dailyTotal: 500,
  idealCumulative: 0,
  pacingRatio: 1,
  status: 'on_track',
  note: 'No pacing state: using the provided total.',
  source: 'observed',
};

/** A real flight far enough in for the plan to have expected spend. */
const pacingFromAFlight = {
  dailyTotal: 500,
  idealCumulative: 3500,
  pacingRatio: 1.04,
  status: 'overpacing',
  note: 'Ahead of plan.',
  source: 'pacing',
  periodBudget: 15000,
  periodDays: 30,
  dayIndex: 7,
  actualSpendToDate: 3640,
};

describe('buildHeroView', () => {
  it('composes the fallback from the report when no brief is stored', () => {
    const view = buildHeroView({
      report: {
        portfolio: null,
        latest_run: { id: 'run1', cycle_ts: '2026-09-19T06:10:00Z' } as never,
        latest_items: [],
        recommendations: [rec as never],
        history: [],
      },
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    expect(view.source).toBe('fallback');
    expect(view.tiles.map((t) => [t.key, t.value])).toEqual([
      ['spend', 3640],
      ['results', 47],
      ['cost', 77.45],
    ]);
    expect(view.tiles[2]?.note).toBe('11% over target');
    expect(view.brief.hero).toMatchObject({ module: 'pause', impact_per_day: 120 });
    expect(view.cta).toEqual({
      kind: 'queue_row',
      rowKey: 'rec:2f1c1c1e-0000-4000-8000-000000000001',
      label: 'Review the pause',
    });
  });
  it('uses the stored brief when it belongs to the latest run, and points observe mode at Manage', () => {
    const stored = {
      version: 1,
      growth: {
        spend: 1,
        results: 1,
        cost_per_result: null,
        target: null,
        deltas: { spend: null, results: null, cost_per_result: null },
        pacing: { status: null, ratio: null, note: null },
        scale: null,
        window: 'd7',
        as_of: 'x',
        currency: 'USD',
        result_label: 'leads',
      },
      hero: {
        module: 'audience',
        candidate_id: 'rec:a',
        headline: 'Open a new audience beside Warm',
        why: 'w',
        impact_per_day: 90,
        impact_unit: 'currency',
        impact_basis: 'b',
        justification: null,
        confidence_note: null,
        cta: { kind: 'audience_card', target_id: 'prop-1' },
      },
      growth_sentence: 'g',
      candidates: [
        {
          id: 'rec:a',
          module: 'audience',
          kind: 'audience_expand',
          trigger: null,
          adset_id: 'as-2',
          adset_name: 'Warm',
          impact_per_day: 90,
          impact_unit: 'currency',
          results_per_day: null,
          impact_basis: 'b',
          reason: null,
          cta: { kind: 'audience_card', target_id: 'prop-1' },
        },
      ],
      secondary: [],
      prompt_version: 'v1',
      model: 'gemini-2.5-flash',
      generated_at: '2026-09-19T06:15:00Z',
    };
    const report = {
      portfolio: null,
      latest_run: { id: 'run1', cycle_ts: '2026-09-19T06:10:00Z' } as never,
      latest_items: [],
      recommendations: [],
      history: [],
      hero_brief: {
        id: '2f1c1c1e-0000-4000-8000-000000000009',
        portfolio_id: '2f1c1c1e-0000-4000-8000-000000000002',
        brand_id: '2f1c1c1e-0000-4000-8000-000000000003',
        cycle_run_id: 'run1',
        utc_day: '2026-09-19',
        status: 'ready',
        brief: stored,
        created_at: 'x',
        updated_at: 'x',
      } as never,
    };
    const view = buildHeroView({
      report,
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio,
      target: 70,
      window: 'd7',
      firstCycle: false,
      now: '2030-01-01T00:00:00Z',
    });
    expect(view.source).toBe('brief');
    expect(view.cta).toEqual({
      kind: 'audience_card',
      rowKey: 'rec:a',
      label: 'Open the audience proposal',
    });
    const observe = buildHeroView({
      report,
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio: { ...portfolio, apply_mode: 'observe' } as never,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    expect(observe.cta?.kind).toBe('manage');
  });
  it('reports no pacing verdict when the engine had no flight to measure against', () => {
    const view = buildHeroView({
      report: {
        portfolio: null,
        latest_run: {
          id: 'run1',
          cycle_ts: '2026-09-19T06:10:00Z',
          pacing: pacingWithoutAFlight,
        } as never,
        latest_items: [],
        recommendations: [rec as never],
        history: [],
      },
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    expect(view.source).toBe('fallback');
    expect(view.brief.growth.pacing.status).toBeNull();
    expect(view.brief.growth.pacing.ratio).toBeNull();
    // The reason for the absence survives; only the invented verdict is dropped.
    expect(view.brief.growth.pacing.note).toBe('No pacing state: using the provided total.');
    expect(view.brief.growth_sentence).not.toContain('on track');
    expect(view.brief.growth_sentence).toContain('over target');
  });

  it('keeps the verdict when the engine measured it against a real flight', () => {
    const view = buildHeroView({
      report: {
        portfolio: null,
        latest_run: {
          id: 'run1',
          cycle_ts: '2026-09-19T06:10:00Z',
          pacing: pacingFromAFlight,
        } as never,
        latest_items: [],
        recommendations: [rec as never],
        history: [],
      },
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    expect(view.brief.growth.pacing).toEqual({
      status: 'overpacing',
      ratio: 1.04,
      note: 'Ahead of plan.',
    });
    expect(view.brief.growth_sentence).toContain('overpacing');
  });
});
