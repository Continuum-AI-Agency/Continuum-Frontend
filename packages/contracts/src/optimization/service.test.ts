import { describe, expect, test } from 'bun:test';
import {
  ApplyModeSchema,
  CreatePortfolioRequestSchema,
  CycleItemRowSchema,
  CycleRunReportSchema,
  EnrollRequestSchema,
  getOptimizationMetricDefinition,
  OptimizerStatusSchema,
  ParsedCycleRunReportSchema,
  PortfolioConfigSchema,
  RecommendationRowSchema,
  RunCycleRequestSchema,
  RunCycleResponseSchema,
  UpdatePortfolioPatchSchema,
} from './service';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('ApplyModeSchema', () => {
  test('accepts the three autonomy tiers (observe < recommend < autopilot)', () => {
    expect(ApplyModeSchema.parse('observe')).toBe('observe');
    expect(ApplyModeSchema.parse('recommend')).toBe('recommend');
    expect(ApplyModeSchema.parse('autopilot')).toBe('autopilot');
  });
  test('rejects anything else', () => {
    expect(() => ApplyModeSchema.parse('yolo')).toThrow();
  });
});

describe('getOptimizationMetricDefinition', () => {
  test('maps each objective to its result and cost language', () => {
    expect(getOptimizationMetricDefinition('lead')).toMatchObject({
      kpiField: 'leads',
      costLabel: 'CPL',
      denominatorMultiplier: 1,
    });
    expect(getOptimizationMetricDefinition('awareness')).toMatchObject({
      kpiField: 'impressions',
      costLabel: 'CPM',
      denominatorMultiplier: 1_000,
    });
  });

  test('uses the purchase metric for a legacy objective', () => {
    expect(getOptimizationMetricDefinition('not-a-real-objective').costLabel).toBe('CPA');
  });
});

describe('PortfolioConfigSchema', () => {
  test('applies safe defaults (balanced + recommend)', () => {
    const cfg = PortfolioConfigSchema.parse({
      name: 'Privalia Prospecting',
      objective: 'purchase',
      daily_total: 500,
    });
    expect(cfg.mode).toBe('balanced');
    expect(cfg.apply_mode).toBe('recommend');
  });
  test('rejects an unknown objective', () => {
    expect(() =>
      PortfolioConfigSchema.parse({ name: 'x', objective: 'vibes', daily_total: 1 }),
    ).toThrow();
  });
});

describe('CreatePortfolioRequestSchema', () => {
  test('accepts a full request and applies config defaults', () => {
    const r = CreatePortfolioRequestSchema.parse({
      brand_id: UUID,
      ad_account_id: 'act_1',
      config: { name: 'Prospecting', objective: 'purchase', daily_total: 500 },
    });
    expect(r.config.apply_mode).toBe('recommend');
  });
  test('rejects a missing ad_account_id', () => {
    expect(() =>
      CreatePortfolioRequestSchema.parse({
        brand_id: UUID,
        ad_account_id: '',
        config: { name: 'P', objective: 'purchase', daily_total: 1 },
      }),
    ).toThrow();
  });
  test('rejects a non-uuid brand_id', () => {
    expect(() =>
      CreatePortfolioRequestSchema.parse({
        brand_id: 'brand-1',
        ad_account_id: 'act_1',
        config: { name: 'P', objective: 'purchase', daily_total: 1 },
      }),
    ).toThrow();
  });
});

describe('UpdatePortfolioPatchSchema', () => {
  test('accepts a partial patch', () => {
    expect(UpdatePortfolioPatchSchema.parse({ daily_total: 800 })).toMatchObject({
      daily_total: 800,
    });
  });
  test('allows clearing nullable fields with null', () => {
    const p = UpdatePortfolioPatchSchema.parse({ cpa_target: null, period_budget: null });
    expect(p.cpa_target).toBeNull();
    expect(p.period_budget).toBeNull();
  });
  test('rejects an empty patch', () => {
    expect(() => UpdatePortfolioPatchSchema.parse({})).toThrow();
  });
  test('rejects an unknown status', () => {
    expect(() => UpdatePortfolioPatchSchema.parse({ status: 'retired' })).toThrow();
  });
});

describe('EnrollRequestSchema — exactly one of adset_ids | campaign_id', () => {
  test('accepts adset_ids only', () => {
    expect(EnrollRequestSchema.parse({ portfolio_id: UUID, adset_ids: ['123'] })).toMatchObject({
      adset_ids: ['123'],
    });
  });
  test('accepts campaign_id only', () => {
    expect(EnrollRequestSchema.parse({ portfolio_id: UUID, campaign_id: 'c1' })).toMatchObject({
      campaign_id: 'c1',
    });
  });
  test('rejects both', () => {
    expect(() =>
      EnrollRequestSchema.parse({ portfolio_id: UUID, adset_ids: ['1'], campaign_id: 'c1' }),
    ).toThrow();
  });
  test('rejects neither', () => {
    expect(() => EnrollRequestSchema.parse({ portfolio_id: UUID })).toThrow();
  });
});

describe('RunCycleRequestSchema', () => {
  test('accepts the portfolio form', () => {
    expect(RunCycleRequestSchema.parse({ portfolio_id: UUID })).toMatchObject({
      portfolio_id: UUID,
    });
  });
  test('accepts the ad-hoc form', () => {
    const r = RunCycleRequestSchema.parse({
      brand_id: UUID,
      ad_account_id: 'act_1',
      adset_ids: ['a', 'b'],
      objective: 'lead',
    });
    expect(r).toMatchObject({ ad_account_id: 'act_1' });
  });
});

// These fixtures are the VERBATIM bodies the optimizer service sends — the ran path and
// the skip path of runPortfolioCycle (Continuum-Optimizer/src/scheduler.ts). The schema
// used to declare recommendations/applied/failed as arrays and runId as non-nullable, so
// NEITHER of these could parse. Every "Run now" click ran a real cycle and then reported
// "Optimizer service not live yet", because a failed safeParse was indistinguishable from
// an offline service. If a change to CycleOutcome ever breaks these, the wire and the
// contract have drifted again — fix the schema, do not loosen these fixtures.
describe('RunCycleResponseSchema mirrors the service wire shape', () => {
  const ran = {
    portfolioId: UUID,
    runId: '22222222-2222-4222-8222-222222222222',
    snapshotCount: 12,
    recommendations: 3,
    applied: 0,
    failed: 0,
    deduped: 0,
    stubbed: 0,
    held: 0,
  };

  test('parses a cycle that ran and persisted', () => {
    const r = RunCycleResponseSchema.parse(ran);
    expect(r.runId).toBe('22222222-2222-4222-8222-222222222222');
    expect(r.recommendations).toBe(3);
    expect(r.skipped).toBeUndefined();
  });

  test('the outcome fields are COUNTS, not row arrays', () => {
    expect(() => RunCycleResponseSchema.parse({ ...ran, recommendations: [{}, {}, {}] })).toThrow();
    expect(() => RunCycleResponseSchema.parse({ ...ran, applied: [] })).toThrow();
  });

  test.each([
    'no_adsets',
    'no_snapshots',
  ] as const)('parses a skipped cycle (%s): HTTP 200, runId null, every counter zero', (skipped) => {
    const r = RunCycleResponseSchema.parse({
      portfolioId: UUID,
      runId: null,
      snapshotCount: 0,
      recommendations: 0,
      applied: 0,
      failed: 0,
      deduped: 0,
      stubbed: 0,
      held: 0,
      skipped,
    });
    expect(r.runId).toBeNull();
    expect(r.skipped).toBe(skipped);
  });

  test('rejects an unknown skip reason', () => {
    expect(() => RunCycleResponseSchema.parse({ ...ran, runId: null, skipped: 'vibes' })).toThrow();
  });

  test('the apply counters are required — a missing one is drift, not a zero', () => {
    const { held: _held, ...withoutHeld } = ran;
    expect(() => RunCycleResponseSchema.parse(withoutHeld)).toThrow();
  });

  test('tolerates a NEW service field so a deployed FE cannot be broken by one', () => {
    expect(RunCycleResponseSchema.parse({ ...ran, someFutureField: 'x' }).runId).toBe(ran.runId);
  });
});

describe('loose DB-derived read models', () => {
  test('CycleRunReportSchema accepts opaque jsonb shapes', () => {
    const report = CycleRunReportSchema.parse({
      portfolio: { id: UUID, name: 'P' },
      latest_run: { conserved: true, anything: 1 },
      latest_items: [{ adset_id: '1', final_budget: 10 }],
      recommendations: [],
      history: [{ cycle_ts: '2026-06-24' }],
    });
    expect(report.latest_items).toHaveLength(1);
  });
  test('narrow row schemas validate known fields and pass unknown ones through', () => {
    const item = CycleItemRowSchema.parse({
      run_id: UUID, // unknown-to-the-schema table column, passes through
      adset_id: 'a1',
      current_budget: 100,
      final_budget: 120,
      change_abs: 20,
      change_pct: 0.2,
      composite_score: 0.7,
      diagnostics: { score3d: 0.6, score7d: 0.8, ci: { cpa: 32, lo: 24, hi: 45, events: 41 } },
    });
    expect(item.diagnostics?.ci?.events).toBe(41);
    expect((item as Record<string, unknown>).run_id).toBe(UUID);
  });
  test('RecommendationRowSchema rejects a row missing its id', () => {
    expect(() =>
      RecommendationRowSchema.parse({
        adset_id: 'a1',
        kind: 'pause',
        trigger: 'P1',
        status: 'pending',
      }),
    ).toThrow();
  });
  test('ParsedCycleRunReportSchema narrows a full report', () => {
    const parsed = ParsedCycleRunReportSchema.parse({
      portfolio: {
        id: UUID,
        name: 'P',
        mode: 'balanced',
        apply_mode: 'recommend',
        status: 'active',
        cpa_target: 40,
      },
      latest_run: {
        id: UUID,
        cycle_ts: '2026-07-02T09:00:00Z',
        mode: 'balanced',
        confidence: { band: 'medium', events: 12 },
      },
      latest_items: [
        { adset_id: 'a1', current_budget: 10, final_budget: 12, change_abs: 2, change_pct: 0.2 },
      ],
      recommendations: [
        {
          id: UUID,
          adset_id: 'a1',
          kind: 'pause',
          trigger: 'P2_sustained_poor',
          severity: 'high',
          reason: 'CPA 3x target',
          status: 'pending',
        },
      ],
      history: [{ id: UUID, cycle_ts: '2026-07-01T09:00:00Z', mode: 'balanced' }],
    });
    expect(parsed.latest_run?.confidence?.band).toBe('medium');
    expect(parsed.recommendations[0]?.severity).toBe('high');
  });
  test('OptimizerStatusSchema validates the compact agent view', () => {
    const s = OptimizerStatusSchema.parse({
      portfolio_id: UUID,
      last_cycle_ts: null,
      conserved: null,
      pending_recommendations: 0,
      adset_count: 3,
    });
    expect(s.adset_count).toBe(3);
  });
});
