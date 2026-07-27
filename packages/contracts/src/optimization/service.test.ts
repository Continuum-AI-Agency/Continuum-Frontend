import { describe, expect, test } from 'bun:test';
import {
  AdsetBudgetSchema,
  AdsetStatusWouldWriteSchema,
  ApplyAdsetStatusRequestSchema,
  ApplyAdsetStatusResponseSchema,
  ApplyAuditSchema,
  ApplyModeSchema,
  ApplyReceiptSchema,
  ApplyRevertRequestSchema,
  ApplyRevertResponseSchema,
  ApplyRunRequestSchema,
  ApplyRunResponseSchema,
  ApplyWouldWriteSchema,
  ConvertCboRequestSchema,
  ConvertCboResponseSchema,
  CreatePortfolioRequestSchema,
  CycleItemRowSchema,
  CyclePreviewRequestSchema,
  CyclePreviewResponseSchema,
  CycleRunReportSchema,
  EnrollRequestSchema,
  EnrollResultSchema,
  getOptimizationMetricDefinition,
  OptimizerStatusSchema,
  ParsedCycleRunReportSchema,
  PortfolioConfigSchema,
  RecommendationRowSchema,
  RenewalTaskSchema,
  RenewalTaskStatusSchema,
  RequestApplyItemRequestSchema,
  RequestApplyItemsRequestSchema,
  RunCycleRequestSchema,
  RunCycleResponseSchema,
  SetAutopilotPausedRequestSchema,
  UpdatePortfolioPatchSchema,
} from './service';

const UUID = '11111111-1111-4111-8111-111111111111';

const ZERO_WINDOW = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
const SNAPSHOT = {
  id: 'as1',
  status: 'active' as const,
  currentBudget: 42,
  ageDays: 30,
  windows: { d3: ZERO_WINDOW, d7: ZERO_WINDOW, d14: ZERO_WINDOW },
};

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

describe('EnrollResultSchema — expansion distinguishes empty-match from read failure', () => {
  test('the adset_ids path carries no expansion', () => {
    expect(EnrollResultSchema.parse({ enrolled: 2, first_cycle: 'queued' })).toMatchObject({
      enrolled: 2,
    });
  });
  test('a campaign that genuinely matched nothing says so', () => {
    const parsed = EnrollResultSchema.parse({
      enrolled: 0,
      first_cycle: 'queued',
      expansion: {
        campaign_id: 'c1',
        snapshots_read: 64,
        matched: 0,
        outcome: 'no_adsets_matched',
      },
    });
    expect(parsed.expansion?.outcome).toBe('no_adsets_matched');
    expect(parsed.expansion?.snapshots_read).toBe(64);
  });
  test('a successful expansion reports the matched count', () => {
    const parsed = EnrollResultSchema.parse({
      enrolled: 7,
      first_cycle: 'queued',
      expansion: { campaign_id: 'c1', snapshots_read: 64, matched: 7, outcome: 'expanded' },
    });
    expect(parsed.expansion?.matched).toBe(7);
  });
  test('rejects an unknown expansion outcome', () => {
    expect(() =>
      EnrollResultSchema.parse({
        enrolled: 0,
        first_cycle: 'queued',
        expansion: { campaign_id: 'c1', snapshots_read: 0, matched: 0, outcome: 'read_failed' },
      }),
    ).toThrow();
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

describe('CyclePreviewRequestSchema — stateless engine-preview inputs', () => {
  test('validates snapshots + objective + total, defaulting mode to balanced', () => {
    const parsed = CyclePreviewRequestSchema.parse({
      snapshots: [SNAPSHOT],
      objective: 'purchase',
      total: 42,
    });
    expect(parsed.mode).toBe('balanced');
    expect(parsed.snapshots).toHaveLength(1);
  });

  test('rejects an empty snapshot fleet', () => {
    expect(() =>
      CyclePreviewRequestSchema.parse({ snapshots: [], objective: 'purchase', total: 0 }),
    ).toThrow();
  });

  test('rejects a malformed snapshot (strict at the boundary)', () => {
    expect(() =>
      CyclePreviewRequestSchema.parse({
        snapshots: [{ id: 'as1', status: 'active' }],
        objective: 'purchase',
        total: 42,
      }),
    ).toThrow();
  });
});

describe('CyclePreviewResponseSchema — engine reallocation mapped to FE rows', () => {
  test('parses items, recommendations, confidence, and pacing', () => {
    const parsed = CyclePreviewResponseSchema.parse({
      items: [
        {
          adset_id: 'as1',
          current_budget: 42,
          final_budget: 50,
          change_abs: 8,
          change_pct: 0.19,
          diagnostics: { score3d: 1.2, freezeReason: 'kpi_mismatch' },
        },
      ],
      recommendations: [{ kind: 'pause', adSetId: 'as1' }],
      confidence: { score: 0.7, band: 'high' },
      pacing: { dailyTotal: 92, idealCumulative: 0, pacingRatio: 1, status: 'on_track', note: '' },
    });
    expect(parsed.items[0].final_budget).toBe(50);
    expect(parsed.items[0].diagnostics?.freezeReason).toBe('kpi_mismatch');
    expect(parsed.recommendations).toHaveLength(1);
    expect(parsed.confidence?.band).toBe('high');
    expect(parsed.pacing?.dailyTotal).toBe(92);
  });

  test('allows a null confidence/pacing (a degenerate cycle)', () => {
    const parsed = CyclePreviewResponseSchema.parse({
      items: [],
      recommendations: [],
      confidence: null,
      pacing: null,
    });
    expect(parsed.confidence).toBeNull();
    expect(parsed.pacing).toBeNull();
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
  test('row schemas carry the merged adset_name and tolerate its absence', () => {
    const named = CycleItemRowSchema.parse({
      adset_id: 'a1',
      adset_name: 'ITESO // ANUALIDAD 2026',
      current_budget: 100,
      final_budget: 120,
      change_abs: 20,
      change_pct: 0.2,
    });
    expect(named.adset_name).toBe('ITESO // ANUALIDAD 2026');
    // Rows recorded before the RPC gained the join (or never-enrolled ad sets) have no name.
    const unnamed = CycleItemRowSchema.parse({
      adset_id: 'a2',
      current_budget: 100,
      final_budget: 100,
      change_abs: 0,
      change_pct: 0,
      adset_name: null,
    });
    expect(unnamed.adset_name).toBeNull();
    const rec = RecommendationRowSchema.parse({
      id: UUID,
      adset_id: 'a1',
      adset_name: 'AV CAMACHO // 333',
      kind: 'pause',
      trigger: 'P1',
      severity: null,
      reason: null,
      status: 'pending',
    });
    expect(rec.adset_name).toBe('AV CAMACHO // 333');
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

// ── The money "apply" family ─────────────────────────────────────────────────
// These are the schemas that gate real Meta writes: budget applies, ad-set status
// (pause) writes, and reverts. Every one has a dryRun that MUST default to previewing
// the would-write set with zero writes, and each carries the current/proposed (or
// prior/target) money it is about to move. A loose or wrong schema here is money at risk.

const RUN_ID = '33333333-3333-4333-8333-333333333333';
const AUDIT_ID = '44444444-4444-4444-8444-444444444444';

describe('ApplyRunRequestSchema — the manual "Apply proposed budgets" gate', () => {
  test('accepts a minimal request (only portfolio_id required)', () => {
    const r = ApplyRunRequestSchema.parse({ portfolio_id: UUID });
    expect(r.portfolio_id).toBe(UUID);
    // dryRun is optional here (the edge defaults it) — absent, not defaulted true.
    expect(r.dryRun).toBeUndefined();
  });
  test('accepts a run-pinned real apply with an approver', () => {
    const r = ApplyRunRequestSchema.parse({
      portfolio_id: UUID,
      run_id: RUN_ID,
      dryRun: false,
      authorized_by: UUID,
    });
    expect(r.run_id).toBe(RUN_ID);
    expect(r.dryRun).toBe(false);
  });
  test('rejects a non-uuid portfolio_id', () => {
    expect(ApplyRunRequestSchema.safeParse({ portfolio_id: 'p1' }).success).toBe(false);
  });
  test('rejects a missing portfolio_id', () => {
    expect(ApplyRunRequestSchema.safeParse({ run_id: RUN_ID }).success).toBe(false);
  });
});

describe('ApplyWouldWriteSchema — one previewed current→proposed move', () => {
  test('carries the current and proposed daily budgets', () => {
    const w = ApplyWouldWriteSchema.parse({ adset_id: 'as1', current: 100, proposed: 130 });
    expect(w.current).toBe(100);
    expect(w.proposed).toBe(130);
  });
  test('rejects a negative proposed budget', () => {
    expect(
      ApplyWouldWriteSchema.safeParse({ adset_id: 'as1', current: 100, proposed: -5 }).success,
    ).toBe(false);
  });
  test('rejects a missing proposed value — the money target is required', () => {
    expect(ApplyWouldWriteSchema.safeParse({ adset_id: 'as1', current: 100 }).success).toBe(false);
  });
});

describe('ApplyRunResponseSchema — dry-run previews vs real applies', () => {
  test('a dry-run returns the would-write set and defaults would/results to []', () => {
    const r = ApplyRunResponseSchema.parse({ ok: true, dryRun: true });
    expect(r.would).toEqual([]);
    expect(r.results).toEqual([]);
  });
  test('a real apply returns ledger-guarded counters + per-item results', () => {
    const r = ApplyRunResponseSchema.parse({
      ok: true,
      dryRun: false,
      runId: RUN_ID,
      would: [{ adset_id: 'as1', current: 100, proposed: 130 }],
      applied: 1,
      failed: 0,
      deduped: 0,
      results: [{ adsetId: 'as1', ok: true }],
    });
    expect(r.applied).toBe(1);
    expect(r.would[0].proposed).toBe(130);
    expect(r.results[0].ok).toBe(true);
  });
  test('rejects a would-write with a malformed money move', () => {
    expect(
      ApplyRunResponseSchema.safeParse({
        ok: true,
        would: [{ adset_id: 'as1', current: 100 }],
      }).success,
    ).toBe(false);
  });
});

describe('ApplyAdsetStatusRequestSchema — the human-only pause drain', () => {
  test('accepts a minimal pause-drain request', () => {
    const r = ApplyAdsetStatusRequestSchema.parse({ portfolio_id: UUID });
    expect(r.portfolio_id).toBe(UUID);
    expect(r.dryRun).toBeUndefined();
  });
  test('rejects a non-uuid portfolio_id', () => {
    expect(ApplyAdsetStatusRequestSchema.safeParse({ portfolio_id: 'p1' }).success).toBe(false);
  });
});

describe('AdsetStatusWouldWriteSchema — one previewed status transition', () => {
  test('carries the adset_id and target_status', () => {
    const w = AdsetStatusWouldWriteSchema.parse({ adset_id: 'as1', target_status: 'PAUSED' });
    expect(w.target_status).toBe('PAUSED');
  });
  test('rejects a missing target_status', () => {
    expect(AdsetStatusWouldWriteSchema.safeParse({ adset_id: 'as1' }).success).toBe(false);
  });
});

describe('ApplyAdsetStatusResponseSchema', () => {
  test('a dry-run returns the would-pause set and defaults would/results to []', () => {
    const r = ApplyAdsetStatusResponseSchema.parse({ ok: true, dryRun: true });
    expect(r.would).toEqual([]);
    expect(r.results).toEqual([]);
  });
  test('a real drain returns the pauses it would have written + counters', () => {
    const r = ApplyAdsetStatusResponseSchema.parse({
      ok: true,
      dryRun: false,
      runId: RUN_ID,
      would: [{ adset_id: 'as1', target_status: 'PAUSED' }],
      applied: 1,
      failed: 0,
      deduped: 0,
      skipped: 0,
      results: [{ adsetId: 'as1', ok: true }],
    });
    expect(r.would[0].target_status).toBe('PAUSED');
    expect(r.applied).toBe(1);
  });
});

describe('ApplyRevertRequestSchema — revert one prior budget write', () => {
  test('targets an audit_id and cross-checks the portfolio', () => {
    const r = ApplyRevertRequestSchema.parse({ audit_id: AUDIT_ID, portfolio_id: UUID });
    expect(r.audit_id).toBe(AUDIT_ID);
    expect(r.portfolio_id).toBe(UUID);
    expect(r.dryRun).toBeUndefined();
  });
  test('rejects a missing audit_id — there is nothing to revert without it', () => {
    expect(ApplyRevertRequestSchema.safeParse({ portfolio_id: UUID }).success).toBe(false);
  });
  test('rejects a non-uuid audit_id', () => {
    expect(ApplyRevertRequestSchema.safeParse({ audit_id: 'a1', portfolio_id: UUID }).success).toBe(
      false,
    );
  });
});

describe('ApplyRevertResponseSchema — the budget-vs-status would union', () => {
  test('echoes the reverted auditId and previews a BUDGET current←prior move', () => {
    const r = ApplyRevertResponseSchema.parse({
      ok: true,
      dryRun: true,
      auditId: AUDIT_ID,
      would: [{ adset_id: 'as1', current: 130, proposed: 100 }],
    });
    expect(r.auditId).toBe(AUDIT_ID);
    // Budget shape: carries current/proposed.
    expect((r.would[0] as { proposed: number }).proposed).toBe(100);
  });
  test('previews a STATUS revert (unpause) as an {adset_id, target_status} move', () => {
    const r = ApplyRevertResponseSchema.parse({
      ok: true,
      dryRun: true,
      auditId: AUDIT_ID,
      would: [{ adset_id: 'as1', target_status: 'ACTIVE' }],
    });
    // Status shape: carries target_status — the union lets it parse without failing as a budget move.
    expect((r.would[0] as { target_status: string }).target_status).toBe('ACTIVE');
  });
  test('rejects a would entry that is neither a budget nor a status move', () => {
    expect(
      ApplyRevertResponseSchema.safeParse({
        ok: true,
        would: [{ adset_id: 'as1', nonsense: true }],
      }).success,
    ).toBe(false);
  });
});

describe('AdsetBudgetSchema — one CBO→ABO target budget', () => {
  test('carries MINOR-unit daily_budget + MAJOR-unit daily_major', () => {
    const b = AdsetBudgetSchema.parse({ adset_id: 'as1', daily_budget: 1000, daily_major: 10 });
    expect(b.daily_budget).toBe(1000);
    expect(b.daily_major).toBe(10);
  });
  test('rejects a non-integer minor-unit daily_budget', () => {
    expect(
      AdsetBudgetSchema.safeParse({ adset_id: 'as1', daily_budget: 10.5, daily_major: 10 }).success,
    ).toBe(false);
  });
  test('rejects a negative daily_budget', () => {
    expect(
      AdsetBudgetSchema.safeParse({ adset_id: 'as1', daily_budget: -1, daily_major: 0 }).success,
    ).toBe(false);
  });
});

describe('ConvertCboRequestSchema / ConvertCboResponseSchema', () => {
  test('a request validates ids; dryRun stays optional', () => {
    const r = ConvertCboRequestSchema.parse({
      brandId: UUID,
      accountId: 'act_1',
      campaignId: 'c1',
    });
    expect(r.campaignId).toBe('c1');
    expect(r.dryRun).toBeUndefined();
  });
  test('rejects an empty campaignId (min 1)', () => {
    expect(
      ConvertCboRequestSchema.safeParse({ brandId: UUID, accountId: 'act_1', campaignId: '' })
        .success,
    ).toBe(false);
  });
  test('a response defaults adset_budgets to [] and carries the converted count', () => {
    const r = ConvertCboResponseSchema.parse({ ok: true, dryRun: false, converted: 4 });
    expect(r.adset_budgets).toEqual([]);
    expect(r.converted).toBe(4);
  });
  test('a response carries the per-ad-set budget targets', () => {
    const r = ConvertCboResponseSchema.parse({
      ok: true,
      dryRun: true,
      adset_budgets: [{ adset_id: 'as1', daily_budget: 1000, daily_major: 10 }],
    });
    expect(r.adset_budgets[0].daily_budget).toBe(1000);
  });
});

describe('SetAutopilotPausedRequestSchema — the kill-switch', () => {
  test('accepts a pause with an optional reason', () => {
    const r = SetAutopilotPausedRequestSchema.parse({
      portfolio_id: UUID,
      paused: true,
      reason: 'CPA spiked overnight',
    });
    expect(r.paused).toBe(true);
  });
  test('rejects a missing paused flag', () => {
    expect(SetAutopilotPausedRequestSchema.safeParse({ portfolio_id: UUID }).success).toBe(false);
  });
  test('rejects a reason over 500 chars', () => {
    expect(
      SetAutopilotPausedRequestSchema.safeParse({
        portfolio_id: UUID,
        paused: false,
        reason: 'x'.repeat(501),
      }).success,
    ).toBe(false);
  });
});

describe('RequestApplyItemRequestSchema / RequestApplyItemsRequestSchema — per-item approval', () => {
  test('single: approves one budget change on a run', () => {
    const r = RequestApplyItemRequestSchema.parse({ run_id: RUN_ID, adset_id: 'as1' });
    expect(r.adset_id).toBe('as1');
  });
  test('single: rejects an empty adset_id (min 1)', () => {
    expect(RequestApplyItemRequestSchema.safeParse({ run_id: RUN_ID, adset_id: '' }).success).toBe(
      false,
    );
  });
  test('bulk: approves many in one round-trip', () => {
    const r = RequestApplyItemsRequestSchema.parse({ run_id: RUN_ID, adset_ids: ['as1', 'as2'] });
    expect(r.adset_ids).toHaveLength(2);
  });
  test('bulk: rejects an empty adset_ids list (min 1)', () => {
    expect(
      RequestApplyItemsRequestSchema.safeParse({ run_id: RUN_ID, adset_ids: [] }).success,
    ).toBe(false);
  });
});

describe('ApplyAuditSchema / ApplyReceiptSchema — the immutable money trail', () => {
  test('an audit row records the prior→target money and the authorizing actor', () => {
    const a = ApplyAuditSchema.parse({
      id: AUDIT_ID,
      scope: 'adset_budget',
      portfolio_id: UUID,
      adset_id: 'as1',
      prior_minor: 10000,
      target_minor: 13000,
      authorized_kind: 'human',
      authorized_by: UUID,
      meta_receipt: { success: true, entityId: 'as1', fbtraceId: 'AbC123' },
      created_at: '2026-07-02T09:00:00Z',
    });
    expect(a.scope).toBe('adset_budget');
    expect(a.prior_minor).toBe(10000);
    expect(a.target_minor).toBe(13000);
    expect(a.authorized_kind).toBe('human');
  });
  test('a status-scope audit records the transition, leaving budgets null', () => {
    const a = ApplyAuditSchema.parse({
      scope: 'adset_status',
      adset_id: 'as1',
      prior_status: 'ACTIVE',
      target_status: 'PAUSED',
      authorized_kind: 'human',
    });
    expect(a.target_status).toBe('PAUSED');
    expect(a.prior_minor).toBeUndefined();
  });
  test('rejects an unknown scope enum', () => {
    expect(ApplyAuditSchema.safeParse({ scope: 'wire_transfer' }).success).toBe(false);
  });
  test('rejects an unknown authorized_kind', () => {
    expect(ApplyAuditSchema.safeParse({ authorized_kind: 'robot' }).success).toBe(false);
  });
  test('a Meta receipt captures the fbtraceId for a successful write', () => {
    const r = ApplyReceiptSchema.parse({ success: true, entityId: 'as1', fbtraceId: 'AbC123' });
    expect(r.fbtraceId).toBe('AbC123');
    expect(r.success).toBe(true);
  });
  test('the receipt is loose — an unknown Meta field passes through', () => {
    const r = ApplyReceiptSchema.parse({ success: true, some_future_meta_field: 'x' });
    expect((r as Record<string, unknown>).some_future_meta_field).toBe('x');
  });
});

describe('RenewalTaskSchema / RenewalTaskStatusSchema', () => {
  test('the status union carries exactly open | done | dismissed', () => {
    expect([...RenewalTaskStatusSchema.options].sort()).toEqual(['dismissed', 'done', 'open']);
  });
  test('rejects an unknown renewal status', () => {
    expect(RenewalTaskStatusSchema.safeParse('closed').success).toBe(false);
  });
  test('a renewal task validates its portfolio + ad-set + kind', () => {
    const t = RenewalTaskSchema.parse({
      id: UUID,
      portfolio_id: '55555555-5555-4555-8555-555555555555',
      portfolio_name: 'Prospecting',
      adset_id: 'as1',
      kind: 'creative_refresh',
      reason: 'fatigue',
      status: 'open',
      created_at: '2026-07-02T09:00:00Z',
    });
    expect(t.kind).toBe('creative_refresh');
    expect(t.status).toBe('open');
  });
  test('rejects a task with a non-uuid portfolio_id', () => {
    expect(
      RenewalTaskSchema.safeParse({
        id: UUID,
        portfolio_id: 'p1',
        portfolio_name: 'P',
        adset_id: 'as1',
        kind: 'audience_expand',
        reason: null,
        status: 'open',
        created_at: '2026-07-02T09:00:00Z',
      }).success,
    ).toBe(false);
  });
});
