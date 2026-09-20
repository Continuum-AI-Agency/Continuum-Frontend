import { describe, expect, it } from 'bun:test';
import { buildDailyRead } from './dailyReadModel';
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
  series: [],
  delta: { spend: 0.21, results: 0.34, costPerResult: -0.1 },
  vsTarget: 0.11,
} as never;
const rec = (over: Record<string, unknown>) => ({
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
  ...over,
});

describe('buildDailyRead', () => {
  it('lists one row per category, strongest first, with impact in words and the hero marked', () => {
    const view = buildHeroView({
      report: {
        portfolio: null,
        latest_run: { id: 'run1', cycle_ts: '2026-09-19T06:10:00Z' } as never,
        latest_items: [],
        recommendations: [
          rec({}) as never,
          rec({
            id: '2f1c1c1e-0000-4000-8000-000000000002',
            kind: 'creative_refresh',
            trigger: 'C4_creative_decay',
            adset_name: 'Retargeting',
            reason: 'CTR down 30% in 14 days.',
            evidence: {
              metric: 'ctr',
              value: 1,
              comparator: '<',
              threshold: 2,
              window: 'd14',
              estImpactPerDay: 12,
              source: 'engine',
            },
          }) as never,
          rec({
            id: '2f1c1c1e-0000-4000-8000-000000000003',
            kind: 'creative_refresh',
            adset_name: 'Prospecting',
            evidence: {
              metric: 'ctr',
              value: 1,
              comparator: '<',
              threshold: 2,
              window: 'd14',
              estImpactPerDay: 3,
              source: 'engine',
            },
          }) as never,
        ],
        history: [],
      },
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio: { id: 'p1', apply_mode: 'recommend', daily_total: 500 } as never,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    const rows = buildDailyRead(view, 500);
    expect(rows.map((r) => [r.category, r.tierLabel, r.title, r.isHero])).toEqual([
      ['Pausing', 'High impact', 'Pause · Dead', true],
      ['Creatives', 'Medium impact', 'Creative rotation · Retargeting', false],
    ]);
    expect(rows[1]?.cta).toEqual({
      kind: 'queue_row',
      rowKey: 'rec:2f1c1c1e-0000-4000-8000-000000000002',
      label: 'Open the creative recommendation',
    });
  });
});
