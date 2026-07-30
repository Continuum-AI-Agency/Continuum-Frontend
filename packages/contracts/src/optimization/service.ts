// Optimizer-SERVICE IO contracts — the DTOs that cross FE/agents <-> the
// standalone optimizer microservice and its RPC layer. The engine IO types
// (AdSetSnapshot, CycleResult, ...) live in ./index; these are the orchestration
// envelopes around them (enrollment, run requests, the FE read-model report).
//
// Discipline: REQUEST schemas are strict (validated at the boundary). The
// DB-derived read models (CycleRunReport, OptimizerStatus) are kept LOOSE — the
// Backend builds them from unknown DB jsonb and the Frontend narrows on read
// (see the "contracts wire DTOs stay loose" rule).

import { z } from 'zod';
import { competitorAdHookArchetypeSchema } from '../competitor-spy/analysis';
import {
  AdSetSnapshotSchema,
  FreezeReasonSchema,
  OptimizationObjectiveSchema,
} from './engine-contracts';

/** Why an ad set was HELD (budget left unchanged on purpose) this cycle — mirrors
 *  the engine FreezeReason. Surfaced so the FE renders a labeled "Held" state
 *  instead of a misleading $0.00 change. */
export type FreezeReason = z.infer<typeof FreezeReasonSchema>;

/** Per-portfolio autonomy dial (bottom → top):
 *  - `observe`   — ingest + score + dashboard approvals only; **no Meta writes ever**
 *                  (hard refuse on cycle apply, human apply, and approved-item apply).
 *  - `recommend` — proposes budgets; human apply may write after explicit approval.
 *  - `autopilot` — auto-applies budget within guardrails; large moves held for approval.
 *  Pause/fatigue recommendations always need dashboard approval in every mode and never
 *  auto-write to Meta. */
export const ApplyModeSchema = z.enum(['observe', 'recommend', 'autopilot']);
export type ApplyMode = z.infer<typeof ApplyModeSchema>;

export const OptimizationModeSchema = z.enum(['efficiency', 'balanced', 'scale']);
export type OptimizationModeDto = z.infer<typeof OptimizationModeSchema>;

/** What a portfolio reallocates: ad-set daily budgets (`adset`), or CAMPAIGN budgets
 *  (`campaign` — CBO, daily or lifetime) across a bucket of campaigns. One level per
 *  portfolio; the engine + membership RPCs are entity-agnostic. */
export const PortfolioLevelSchema = z.enum(['adset', 'campaign']);
export type PortfolioLevel = z.infer<typeof PortfolioLevelSchema>;

/** The objective-specific efficiency language used everywhere an optimizer
 * portfolio is rendered. `denominatorMultiplier` keeps awareness honest: Meta
 * provides impressions, while operators reason about CPM (cost per thousand),
 * not cost per one impression. */
export const OptimizationMetricDefinitionSchema = z.object({
  objective: OptimizationObjectiveSchema,
  kpiField: z.enum([
    'purchases',
    'appInstalls',
    'signups',
    'leads',
    'landingPageViews',
    'impressions',
    'conversations',
    'linkClicks',
    'thruplays',
    'postEngagement',
    'clicks',
  ]),
  resultLabel: z.string(),
  costLabel: z.string(),
  targetLabel: z.string(),
  denominatorMultiplier: z.number().positive(),
});
export type OptimizationMetricDefinition = z.infer<typeof OptimizationMetricDefinitionSchema>;

const OPTIMIZATION_METRIC_DEFINITIONS: Record<
  z.infer<typeof OptimizationObjectiveSchema>,
  OptimizationMetricDefinition
> = {
  purchase: {
    objective: 'purchase',
    kpiField: 'purchases',
    resultLabel: 'Purchases',
    costLabel: 'CPA',
    targetLabel: 'Target CPA',
    denominatorMultiplier: 1,
  },
  app_install: {
    objective: 'app_install',
    kpiField: 'appInstalls',
    resultLabel: 'Installs',
    costLabel: 'CPI',
    targetLabel: 'Target CPI',
    denominatorMultiplier: 1,
  },
  signup: {
    objective: 'signup',
    kpiField: 'signups',
    resultLabel: 'Sign-ups',
    costLabel: 'Cost per sign-up',
    targetLabel: 'Target cost per sign-up',
    denominatorMultiplier: 1,
  },
  lead: {
    objective: 'lead',
    kpiField: 'leads',
    resultLabel: 'Leads',
    costLabel: 'CPL',
    targetLabel: 'Target CPL',
    denominatorMultiplier: 1,
  },
  traffic: {
    objective: 'traffic',
    kpiField: 'landingPageViews',
    resultLabel: 'Landing page views',
    costLabel: 'Cost per LPV',
    targetLabel: 'Target cost per LPV',
    denominatorMultiplier: 1,
  },
  awareness: {
    objective: 'awareness',
    kpiField: 'impressions',
    resultLabel: 'Impressions',
    costLabel: 'CPM',
    targetLabel: 'Target CPM',
    denominatorMultiplier: 1_000,
  },
  // The currencies real Meta ad sets declare but the original six objectives could not
  // express. Naming them precisely is the point: a "cost per conversation" rendered as
  // "CPA" is how a $39.48 messaging thread gets read as a $255.98 failed lead. The labels
  // mirror KPI_COST_LABEL in ../paid/kpi.ts — one vocabulary, not two.
  conversations: {
    objective: 'conversations',
    kpiField: 'conversations',
    resultLabel: 'Conversations',
    costLabel: 'Cost per conversation',
    targetLabel: 'Target cost per conversation',
    denominatorMultiplier: 1,
  },
  link_clicks: {
    objective: 'link_clicks',
    kpiField: 'linkClicks',
    resultLabel: 'Link clicks',
    costLabel: 'Cost per link click',
    targetLabel: 'Target cost per link click',
    denominatorMultiplier: 1,
  },
  thruplays: {
    objective: 'thruplays',
    kpiField: 'thruplays',
    resultLabel: 'ThruPlays',
    costLabel: 'Cost per ThruPlay',
    targetLabel: 'Target cost per ThruPlay',
    denominatorMultiplier: 1,
  },
  post_engagement: {
    objective: 'post_engagement',
    kpiField: 'postEngagement',
    resultLabel: 'Engagements',
    costLabel: 'Cost per engagement',
    targetLabel: 'Target cost per engagement',
    denominatorMultiplier: 1,
  },
  clicks: {
    objective: 'clicks',
    kpiField: 'clicks',
    resultLabel: 'Clicks',
    // NOT "CPA". This counts every click including likes and comments — the weakest proxy
    // there is, and the one an ad that never converted anything looks good on.
    costLabel: 'Cost per click',
    targetLabel: 'Target cost per click',
    denominatorMultiplier: 1,
  },
};

/** Returns a safe purchase default for legacy or malformed portfolio records. */
export function getOptimizationMetricDefinition(
  objective: string | null | undefined,
): OptimizationMetricDefinition {
  const parsed = OptimizationObjectiveSchema.safeParse(objective);
  return OPTIMIZATION_METRIC_DEFINITIONS[parsed.success ? parsed.data : 'purchase'];
}

/** `expired` is terminal-by-staleness: pending recommendations are re-derived every
 *  cycle, so an untouched one ages out rather than lingering as a stale suggestion.
 *  Recs a human already turned into open work are never expired. */
export const RecommendationStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'applied',
  'expired',
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;

/** Whether the cycle's daily total is derived from live ad-set budgets or pinned by a human.
 *  See PortfolioConfigSchema.budget_source for why this exists. */
export const BudgetSourceSchema = z.enum(['observed', 'fixed']);
export type BudgetSource = z.infer<typeof BudgetSourceSchema>;

/** The trailing window read/analysis surfaces report on. */
export const LookbackWindowSchema = z.enum(['d7', 'd14', 'd30']);
export type LookbackWindow = z.infer<typeof LookbackWindowSchema>;

/** Input to create a portfolio (maps to optimizer_create_portfolio's p_config). */
export const PortfolioConfigSchema = z.object({
  name: z.string().min(1),
  objective: OptimizationObjectiveSchema,
  /** adset (default) or campaign-level (CBO) reallocation. */
  level: PortfolioLevelSchema.default('adset'),
  mode: OptimizationModeSchema.default('balanced'),
  apply_mode: ApplyModeSchema.default('recommend'),
  daily_total: z.number().nonnegative(),
  period_budget: z.number().nonnegative().optional(),
  /** Where the cycle's daily total comes from. 'observed' (default) reallocates within the
   *  live sum of enrolled ad-set budgets, so gainers and losers net to zero. 'fixed' means
   *  a human set daily_total as a deliberate target and the total is allowed to move. */
  budget_source: BudgetSourceSchema.default('observed'),
  /** Trailing window every read/analysis surface reports on. Does not re-key the engine's
   *  d3/d7/d14 scoring blend — use `config.weights` for that. */
  lookback_window: LookbackWindowSchema.default('d14'),
  /** Flight window (YYYY-MM-DD). With period_budget set, these turn on real pacing. */
  period_start: z.string().date().optional(),
  period_end: z.string().date().optional(),
  cpa_target: z.number().positive().optional(),
  velocity_cap_pct: z.number().min(0).max(5).optional(),
  /** Autopilot guardrails. max_daily_apply_minor: refuse autopilot if the daily pool
   *  exceeds this ceiling (MINOR units). max_change_pct_per_cycle: an autopilot change
   *  above this fraction is HELD for per-item human approval instead of auto-written. */
  max_daily_apply_minor: z.number().int().nonnegative().optional(),
  max_change_pct_per_cycle: z.number().min(0).optional(),
  /** DeepPartial<EngineConfig> overrides — kept loose; the engine validates. */
  config: z.record(z.string(), z.unknown()).optional(),
});
export type PortfolioConfig = z.infer<typeof PortfolioConfigSchema>;

export const PortfolioStatusSchema = z.enum(['active', 'paused', 'archived']);
export type PortfolioStatus = z.infer<typeof PortfolioStatusSchema>;

/** POST /portfolios body — the service boundary around optimizer_create_portfolio. */
export const CreatePortfolioRequestSchema = z.object({
  brand_id: z.string().uuid(),
  ad_account_id: z.string().min(1),
  config: PortfolioConfigSchema,
});
export type CreatePortfolioRequest = z.infer<typeof CreatePortfolioRequestSchema>;

/** POST /portfolios response — the id of the newly created portfolio. */
export const CreatePortfolioResponseSchema = z.object({
  portfolio_id: z.string().uuid(),
});
export type CreatePortfolioResponse = z.infer<typeof CreatePortfolioResponseSchema>;

/** Whitelisted patch for optimizer_update_portfolio (FE settings modal).
 *  Nullable fields (cpa_target, period_budget) can be cleared with null. */
export const UpdatePortfolioPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    /** Changing the objective changes the portfolio's KPI currency: enrolled ad sets
     *  buying the old event freeze as kpi_mismatch until moved. The Manage UI must
     *  surface that consequence before submitting this field. */
    objective: OptimizationObjectiveSchema.optional(),
    mode: OptimizationModeSchema.optional(),
    apply_mode: ApplyModeSchema.optional(),
    daily_total: z.number().nonnegative().optional(),
    period_budget: z.number().nonnegative().nullable().optional(),
    budget_source: BudgetSourceSchema.optional(),
    lookback_window: LookbackWindowSchema.optional(),
    // Flight window — null clears the date, returning the portfolio to unpaced.
    period_start: z.string().date().nullable().optional(),
    period_end: z.string().date().nullable().optional(),
    cpa_target: z.number().positive().nullable().optional(),
    velocity_cap_pct: z.number().min(0).max(5).optional(),
    // Autopilot guardrails — null clears the cap (uncapped).
    max_daily_apply_minor: z.number().int().nonnegative().nullable().optional(),
    max_change_pct_per_cycle: z.number().min(0).nullable().optional(),
    status: PortfolioStatusSchema.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Patch must set at least one field',
  });
export type UpdatePortfolioPatch = z.infer<typeof UpdatePortfolioPatchSchema>;

/** PATCH /portfolios/:id response — echoes the updated (loose) portfolio row so
 *  the FE settings modal can reconcile without a follow-up read. */
export const UpdatePortfolioResponseSchema = z.object({
  portfolio_id: z.string().uuid(),
  portfolio: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpdatePortfolioResponse = z.infer<typeof UpdatePortfolioResponseSchema>;

/** Enroll ad sets into a portfolio. Exactly one of adset_ids | campaign_id
 *  (campaign_id is expanded to its ad sets service-side). `adset_names` is an
 *  optional id→name map the client supplies so the plain-text ad-set name is
 *  persisted at enroll time (the dashboard otherwise renders raw Meta ids). */
export const EnrollRequestSchema = z
  .object({
    portfolio_id: z.string().uuid(),
    adset_ids: z.array(z.string()).min(1).optional(),
    campaign_id: z.string().optional(),
    adset_names: z.record(z.string(), z.string()).optional(),
  })
  .refine((d) => Boolean(d.adset_ids) !== Boolean(d.campaign_id), {
    message: 'Provide exactly one of adset_ids or campaign_id',
  });
export type EnrollRequest = z.infer<typeof EnrollRequestSchema>;

/** How a `campaign_id` enrollment resolved. Present ONLY on the campaign path, and only
 *  when the ad-set snapshot read SUCCEEDED — a failed read is a 502 with
 *  `reason: 'snapshot_read_failed'`, never a 200 with `enrolled: 0`. Without this the two
 *  are the same empty answer, and a dead Meta token reads as "the campaign has no ad sets". */
export const EnrollExpansionSchema = z.object({
  campaign_id: z.string(),
  snapshots_read: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  outcome: z.enum(['expanded', 'no_adsets_matched']),
});
export type EnrollExpansion = z.infer<typeof EnrollExpansionSchema>;

/** An ad set taken from another portfolio to satisfy this enrollment. The global partial
 *  unique index (one ACTIVE enrollment per ad set) means enrolling a claimed ad set is
 *  always a move, never a copy — so the caller must be able to say which portfolio lost it
 *  rather than surfacing a constraint violation. */
export const EnrollMovedAdsetSchema = z.object({
  adset_id: z.string(),
  from_portfolio_id: z.string().uuid(),
  from_portfolio_name: z.string().nullable().optional(),
});
export type EnrollMovedAdset = z.infer<typeof EnrollMovedAdsetSchema>;

export const EnrollResultSchema = z.object({
  /** Ad sets that were not already actively enrolled in this portfolio. */
  enrolled: z.number().int().nonnegative(),
  first_cycle: z.literal('queued'),
  /** Absent on older responses; treat as empty. */
  moved: z.array(EnrollMovedAdsetSchema).default([]),
  expansion: EnrollExpansionSchema.optional(),
});
export type EnrollResult = z.infer<typeof EnrollResultSchema>;

/** POST /enroll response — canonical `*Response` name for the route/MCP phases
 *  (same shape as EnrollResultSchema, kept for back-compat). */
export const EnrollResponseSchema = EnrollResultSchema;
export type EnrollResponse = z.infer<typeof EnrollResponseSchema>;

/** Trigger a cycle: either an enrolled portfolio, or an ad-hoc set. */
export const RunCycleRequestSchema = z.union([
  // Enrolled portfolio. brandId + accountId are optional context: the optimizer-run
  // edge verifies them against the caller's brand access (mirrors optimizer-suggest);
  // cron / the standalone service call with only portfolio_id.
  z.object({
    portfolio_id: z.string().uuid(),
    brandId: z.string().uuid().optional(),
    accountId: z.string().optional(),
  }),
  z.object({
    brand_id: z.string().uuid(),
    ad_account_id: z.string(),
    adset_ids: z.array(z.string()).min(1),
    objective: OptimizationObjectiveSchema,
    mode: OptimizationModeSchema.optional(),
    total: z.number().nonnegative().optional(),
  }),
]);
export type RunCycleRequest = z.infer<typeof RunCycleRequestSchema>;

/** Why a cycle produced no run. Both are HTTP 200 with `runId: null` — a skip is a
 *  SUCCESSFUL, ACTIONABLE outcome, not an outage:
 *    - `no_adsets`    — nothing is enrolled in the portfolio yet.
 *    - `no_snapshots` — ingest returned nothing for the enrolled entities (an expired
 *                       Meta token, or no active/spending ad sets).
 *  Mirrors CycleOutcome['skipped'] (Continuum-Optimizer/src/types.ts). */
export const CycleSkipReasonSchema = z.enum(['no_adsets', 'no_snapshots']);
export type CycleSkipReason = z.infer<typeof CycleSkipReasonSchema>;

/** POST /cycle response — mirrors the optimizer service's CycleOutcome EXACTLY
 *  (Continuum-Optimizer/src/types.ts; produced by runPortfolioCycle, scheduler.ts,
 *  on both its ran path and its skip path).
 *
 *  Every outcome field is a COUNT, not a row array. The rows themselves are read back
 *  through optimizer_get_portfolio_performance (CycleRunReportSchema below) — this
 *  envelope only tallies what the cycle did.
 *
 *  DELIBERATELY NARROW, and that is not a violation of the "wire DTOs stay loose" rule:
 *  that rule is for read models the DB hands us as opaque jsonb. This is a struct we
 *  author on BOTH sides, and a loose schema here is precisely what let the Frontend
 *  mis-read a real, persisted run as an outage — `recommendations`/`applied`/`failed`
 *  were declared as arrays while the service has always sent counts, so safeParse could
 *  never succeed and every "Run now" click reported "Optimizer service not live yet".
 *  `.loose()` is applied ONLY so a NEW service-side field cannot break a deployed FE;
 *  do NOT give the counters defaults, which would resurrect that same class of bug. */
export const RunCycleResponseSchema = z
  .object({
    portfolioId: z.string().uuid(),
    /** null IFF the cycle was SKIPPED — no optimizer.cycle_runs row was persisted. */
    runId: z.string().uuid().nullable(),
    snapshotCount: z.number().int().nonnegative(),
    /** How many recommendations the engine raised this cycle. */
    recommendations: z.number().int().nonnegative(),
    applied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    /** Writes skipped because the ledger showed the same target already applied/in-flight. */
    deduped: z.number().int().nonnegative(),
    /** Changed budgets NOT written because the applier is a dry-run/soak stub. */
    stubbed: z.number().int().nonnegative(),
    /** Autopilot changes parked over the %-cap for per-item human approval. */
    held: z.number().int().nonnegative(),
    /** Present ONLY on a skipped cycle. */
    skipped: CycleSkipReasonSchema.optional(),
  })
  .loose();
export type RunCycleResponse = z.infer<typeof RunCycleResponseSchema>;

/** FE performance-tab read model — the shape optimizer_get_portfolio_performance
 *  returns. LOOSE on purpose (DB jsonb in; FE narrows the fields it reads). */
export const CycleRunReportSchema = z.object({
  portfolio: z.record(z.string(), z.unknown()).nullable(),
  latest_run: z.record(z.string(), z.unknown()).nullable(),
  latest_items: z.array(z.record(z.string(), z.unknown())),
  recommendations: z.array(z.record(z.string(), z.unknown())),
  history: z.array(z.record(z.string(), z.unknown())),
});
export type CycleRunReport = z.infer<typeof CycleRunReportSchema>;

// ── Narrow row schemas over the loose report ─────────────────────────────────
// The report envelope stays loose (rule above), but the FE parses each row ONCE
// at its API boundary with these instead of probing fields ad hoc. All are
// `.loose()`: to_jsonb(row) carries every table column and may grow — unknown
// keys pass through, known keys are validated.

/** engine ItemDiagnostics fields the FE renders (ci bars + realloc narrative). */
export const CycleItemDiagnosticsSchema = z
  .object({
    score3d: z.number().optional(),
    score7d: z.number().optional(),
    // When present, the ad set was HELD (budget unchanged on purpose) — the FE
    // renders a labeled "Held" state instead of a $0.00 change.
    freezeReason: FreezeReasonSchema.optional(),
    ci: z
      .object({
        cpa: z.number().optional(),
        lo: z.number().optional(),
        hi: z.number().optional(),
        events: z.number().optional(),
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();
export type CycleItemDiagnostics = z.infer<typeof CycleItemDiagnosticsSchema>;

/** One optimizer.cycle_items row inside CycleRunReport.latest_items. */
/** Per-item apply state. 'held' is an AUTOPILOT change parked over the portfolio's
 *  max_change_pct_per_cycle — scored, too large to auto-write, waiting on a human.
 *  'approved_pending' is one a human approved (optimizer_request_apply_item) and the
 *  service's /apply/approved will execute. Mirrors optimizer_cycle_items_apply_status_chk. */
export const CycleItemApplyStatusSchema = z.enum([
  'applied',
  'failed',
  'skipped',
  'held',
  'approved_pending',
]);
export type CycleItemApplyStatus = z.infer<typeof CycleItemApplyStatusSchema>;

export const CycleItemRowSchema = z
  .object({
    adset_id: z.string(),
    /** Enroll-time name merged in by optimizer_get_portfolio_performance; null when the
     *  ad set was never enrolled in this portfolio (stale/unenrolled rows). */
    adset_name: z.string().nullable().optional(),
    current_budget: z.number().nullable(),
    final_budget: z.number().nullable(),
    change_abs: z.number().nullable(),
    change_pct: z.number().nullable(),
    composite_score: z.number().nullable().optional(),
    diagnostics: CycleItemDiagnosticsSchema.nullable().optional(),
    // optimizer_get_portfolio_performance returns the whole cycle_items row (to_jsonb),
    // so these arrive already — declaring them is what makes a held item renderable.
    apply_status: CycleItemApplyStatusSchema.nullable().optional(),
    apply_requested_by: z.string().nullable().optional(),
    apply_requested_at: z.string().nullable().optional(),
  })
  .loose();
export type CycleItemRow = z.infer<typeof CycleItemRowSchema>;

/** One optimizer.recommendations row inside CycleRunReport.recommendations. */
export const RecommendationRowSchema = z
  .object({
    id: z.string().uuid(),
    adset_id: z.string(),
    /** Enroll-time name merged in by optimizer_get_portfolio_performance; null when the
     *  ad set was never enrolled in this portfolio. */
    adset_name: z.string().nullable().optional(),
    /** The specific AD this is about. Non-null on the creative-level kinds (pause_ad,
     *  variate_creative); null on the ad-set-level ones. Without it, "your creative is worn
     *  out" across five creatives gives you five suspects and no defendant. */
    ad_id: z.string().nullable().optional(),
    // pause | creative_refresh | audience_expand | pause_ad | variate_creative | seed_experiment
    kind: z.string(),
    trigger: z.string(),
    severity: z.string().nullable(),
    reason: z.string().nullable(),
    status: z.string(),
    /** The generation seed on a variate_creative / seed_experiment: the winning creative's
     *  labels, its Library asset, and the deterministic citations the brief is grounded on. */
    seed: z.record(z.string(), z.unknown()).nullable().optional(),
    /** Set when a data-driven rule produced this row — the join key to its evaluation. */
    rule_id: z.string().nullable().optional(),
    /** Which channel decided it: a human verdict, or a human-granted standing rule. */
    decided_via: z.string().nullable().optional(),
    created_at: z.string().optional(),
  })
  .loose();
export type RecommendationRow = z.infer<typeof RecommendationRowSchema>;

/** Request to the optimizer-insight edge fn: generate/fetch a plain-language
 *  rephrasing of a recommendation's deterministic reason. `insightKey` is the DB
 *  recommendation id for enrolled recs, or a content hash (wi_<fnv1a>) for
 *  client-side what-if recs. `reason` is the grounding source — the model rephrases
 *  it and never introduces a figure not present in it. */
export const OptimizerInsightRequestSchema = z.object({
  brandId: z.string(),
  insightKey: z.string().min(1),
  adsetId: z.string(),
  reason: z.string().min(1),
  kind: z.string(),
  trigger: z.string(),
  severity: z.string().nullable().optional(),
});
export type OptimizerInsightRequest = z.infer<typeof OptimizerInsightRequestSchema>;

/** Response from optimizer-insight. `source` distinguishes a durable cache hit,
 *  fresh Gemini output, and the deterministic-reason fallback (Gemini unavailable). */
export const OptimizerInsightResponseSchema = z.object({
  insight: z.string(),
  source: z.enum(['cache', 'gemini', 'reason']),
});
export type OptimizerInsightResponse = z.infer<typeof OptimizerInsightResponseSchema>;

/** Cycle-level Confidence (optimizer.cycle_runs.confidence jsonb). Aligned with
 *  the optimizer wire `Confidence` shape (see ConfidenceSchema)
 *  but kept `.loose()` and all-optional for DB reads — the row is opaque jsonb and
 *  older rows may predate a field. `band` stays a loose string on read. */
export const RunConfidenceSchema = z
  .object({
    score: z.number().optional(),
    predictiveness: z.number().optional(),
    sampleSize: z.number().optional(),
    consistency: z.number().optional(),
    events: z.number().optional(),
    band: z.string().optional(),
  })
  .loose();
export type RunConfidence = z.infer<typeof RunConfidenceSchema>;

/** One optimizer.cycle_runs row (latest_run + history entries). */
export const CycleRunRowSchema = z
  .object({
    id: z.string().uuid(),
    cycle_ts: z.string(),
    mode: z.string(),
    allocated_total: z.number().nullable().optional(),
    conserved: z.boolean().nullable().optional(),
    confidence: RunConfidenceSchema.nullable().optional(),
  })
  .loose();
export type CycleRunRow = z.infer<typeof CycleRunRowSchema>;

/** The optimizer.portfolios row inside CycleRunReport.portfolio. */
export const PortfolioRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    mode: z.string(),
    apply_mode: z.string(),
    status: z.string(),
    level: z.string().optional(),
    daily_total: z.number().nullable().optional(),
    period_budget: z.number().nullable().optional(),
    budget_source: z.string().nullable().optional(),
    lookback_window: z.string().nullable().optional(),
    period_start: z.string().nullable().optional(),
    period_end: z.string().nullable().optional(),
    cpa_target: z.number().nullable().optional(),
    velocity_cap_pct: z.number().nullable().optional(),
  })
  .loose();
export type PortfolioRow = z.infer<typeof PortfolioRowSchema>;

/** CycleRunReport with every row narrowed — what the FE's parseReport returns. */
export const ParsedCycleRunReportSchema = z.object({
  portfolio: PortfolioRowSchema.nullable(),
  latest_run: CycleRunRowSchema.nullable(),
  latest_items: z.array(CycleItemRowSchema),
  recommendations: z.array(RecommendationRowSchema),
  history: z.array(CycleRunRowSchema),
});
export type ParsedCycleRunReport = z.infer<typeof ParsedCycleRunReportSchema>;

/** One row of optimizer_list_portfolios — the Overview/Portfolios list model.
 *  DB-derived, so objective/mode/apply_mode stay loose strings (FE narrows). */
export const PortfolioListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ad_account_id: z.string().nullable(),
  objective: z.string(),
  level: z.string().default('adset'),
  mode: z.string(),
  apply_mode: z.string(),
  daily_total: z.number().nullable(),
  period_budget: z.number().nullable(),
  // Same declare-or-be-stripped rule as the autopilot fields below: optimizer_list_portfolios
  // returns these, and an undeclared budget_source reads as undefined, which the FE would
  // render as a fixed target the user never set.
  budget_source: z.string().nullable().optional(),
  lookback_window: z.string().nullable().optional(),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
  status: z.string(),
  next_realloc_at: z.string().nullable(),
  adset_count: z.number().int().nonnegative(),
  pending_recommendations: z.number().int().nonnegative(),
  // Autopilot state. optimizer_list_portfolios returns all three; they must be DECLARED
  // here or z.object strips them and the FE reads undefined (which is how the paused
  // banner and the guardrail gate silently read as "not paused" / "no caps").
  autopilot_paused: z.boolean().nullable().optional(),
  max_daily_apply_minor: z.number().nullable().optional(),
  max_change_pct_per_cycle: z.number().nullable().optional(),
});
export type PortfolioListItem = z.infer<typeof PortfolioListItemSchema>;

/** A renewal work item, opened when a fatigue recommendation is approved. */
export const RenewalTaskStatusSchema = z.enum(['open', 'done', 'dismissed']);
export type RenewalTaskStatus = z.infer<typeof RenewalTaskStatusSchema>;

export const RenewalTaskSchema = z.object({
  id: z.string().uuid(),
  /** The approval that opened this task. `optimizer_list_renewal_tasks` has always
   *  returned it; it was undeclared here, so z.object STRIPPED it and no caller could
   *  link a task back to the recommendation — which is exactly what an approval
   *  receipt has to report (plan 054 Optimizer item 3). */
  recommendation_id: z.string().uuid().nullable().optional(),
  portfolio_id: z.string().uuid(),
  portfolio_name: z.string(),
  adset_id: z.string(),
  /** The specific AD this request is about, on the creative kinds. Null on the
   *  ad-set-level ones (creative_refresh / audience_expand). */
  ad_id: z.string().nullable().optional(),
  kind: z.string(), // creative_refresh | audience_expand | variate_creative | seed_experiment
  reason: z.string().nullable(),
  /** The generation seed the brief renders from — the winning creative, its Library
   *  asset, the labels to keep, and the grounded citations. Present on creative kinds. */
  seed: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.string(),
  /** Set once the request has been emailed to the brand team. */
  notified_at: z.string().nullable().optional(),
  /** The media.assets id a human attached to satisfy the request. */
  fulfilled_asset_id: z.string().nullable().optional(),
  created_at: z.string(),
});
export type RenewalTask = z.infer<typeof RenewalTaskSchema>;

/** A connected ad account (row of plugin_mcp.list_brand_ad_accounts). */
export const AdAccountSchema = z.object({
  platform: z.string(),
  account_id: z.string(),
  name: z.string().nullable(),
  status: z.string().nullable(),
  currency: z.string().nullable(),
});
export type AdAccount = z.infer<typeof AdAccountSchema>;

/** A suggested portfolio during onboarding (account ad sets grouped by objective).
 *  Today produced client-side; the canonical home is a future server RPC
 *  optimizer_suggest_portfolios — this schema is the shared contract for both. */
export const PortfolioSuggestionSchema = z.object({
  objective: OptimizationObjectiveSchema,
  name: z.string(),
  /** adset (default) or campaign-level suggestion. Campaign suggestions carry
   *  campaign_ids in `adset_ids` (the enroll field is the entity id at either level). */
  level: PortfolioLevelSchema.default('adset'),
  mode: OptimizationModeSchema,
  daily_total: z.number().nonnegative(),
  /** Wire DTO stays loose: the deployed suggest edge rounds a sub-1 CPA baseline to 0
   *  (guard-before-round), so 0 arrives on low-CPA accounts and means "no usable
   *  baseline". Consumers treat 0 as absent (suggestionToPortfolioConfig drops falsy). */
  cpa_target: z.number().nonnegative().optional(),
  adset_ids: z.array(z.string()),
  /** id→name for the suggestion's entities, resolved from the same snapshot read that
   *  produced the grouping. A suggestion used to carry ids only, so accepting one enrolled
   *  nameless rows and the dashboard rendered raw Meta ids until a backfill healed them.
   *  Optional because an older deployed suggest edge does not send it. */
  adset_names: z.record(z.string(), z.string()).optional(),
  summary: z.object({
    adsets: z.number().int().nonnegative(),
    spend14: z.number(),
    conv14: z.number(),
  }),
  reason: z.string(),
});
export type PortfolioSuggestion = z.infer<typeof PortfolioSuggestionSchema>;

/** One ad set's target daily budget when converting its parent campaign off CBO
 *  (Advantage Campaign Budget) to ad-set (ABO) budgets. `daily_budget` is MINOR units
 *  (what Meta's adset_budgets write takes); `daily_major` is the same in major units for
 *  display. */
export const AdsetBudgetSchema = z.object({
  adset_id: z.string(),
  adset_name: z.string().nullable().optional(),
  daily_budget: z.number().int().nonnegative(),
  daily_major: z.number().nonnegative(),
});
export type AdsetBudget = z.infer<typeof AdsetBudgetSchema>;

/** Request to convert a CBO campaign to ad-set budgets (optimizer-convert-cbo edge).
 *  `dryRun` (default true) returns the computed per-ad-set budgets WITHOUT writing to
 *  Meta — the FE previews them before the real convert (which is one POST /{campaign_id}
 *  with `adset_budgets`, removing the campaign budget). */
export const ConvertCboRequestSchema = z.object({
  brandId: z.string().uuid(),
  accountId: z.string().min(1),
  campaignId: z.string().min(1),
  dryRun: z.boolean().optional(),
});
export type ConvertCboRequest = z.infer<typeof ConvertCboRequestSchema>;

/** optimizer-convert-cbo response — the per-ad-set budgets that would be (dryRun) or were
 *  set. `reason` is present on a soft failure (not_permitted / no_adsets / no_token). */
export const ConvertCboResponseSchema = z.object({
  ok: z.boolean(),
  dryRun: z.boolean().optional(),
  campaignId: z.string().optional(),
  currency: z.string().optional(),
  adset_budgets: z.array(AdsetBudgetSchema).default([]),
  converted: z.number().int().nonnegative().optional(),
  /** A real convert (dryRun:false) skipped because this campaign was already converted
   *  today — the per-(campaign, utc_day) convert_ledger deduped the second write. */
  deduped: z.boolean().optional(),
  reason: z.string().optional(),
  error: z.string().optional(),
});
export type ConvertCboResponse = z.infer<typeof ConvertCboResponseSchema>;

// ── As-if-converted full preview (POST /cycle/preview) ───────────────────────
// The read-only "what would the optimizer DO after this CBO→ABO convert" preview.
// The FE synthesizes the post-convert ad-set snapshots (the held CBO ad sets given
// their dryRun ABO budgets, freeze cleared, status active) and asks the service to
// run the ACTUAL engine (runCycle) over them — with NO persist, NO applier, NO run
// row. The service maps the engine reallocation into the same row shape the
// performance report narrows, so the FE renders the identical ReallocationFlow it
// shows for a real scored cycle. Nothing here touches Meta or the DB.

/** POST /cycle/preview request — a stateless engine run over caller-supplied
 *  snapshots. `total` is the post-convert daily pool (sum of the ABO budgets);
 *  `mode` defaults to 'balanced'. Strict at the boundary: the snapshots are
 *  validated with the engine's own AdSetSnapshotSchema before the engine sees them. */
export const CyclePreviewRequestSchema = z.object({
  snapshots: z.array(AdSetSnapshotSchema).min(1),
  objective: OptimizationObjectiveSchema,
  mode: OptimizationModeSchema.default('balanced'),
  total: z.number().nonnegative(),
});
export type CyclePreviewRequest = z.infer<typeof CyclePreviewRequestSchema>;

/** One reallocation row of a cycle preview — the SAME field shape the FE's
 *  CycleItemRow narrows (adset_id + current/final/change + diagnostics), so
 *  ReallocationFlow renders it with no adapter. `diagnostics.freezeReason` is what
 *  keeps a HELD ad set out of the flow instead of drawn as a $0 move. */
export const CyclePreviewItemSchema = z
  .object({
    adset_id: z.string(),
    current_budget: z.number(),
    final_budget: z.number(),
    change_abs: z.number(),
    change_pct: z.number(),
    composite_score: z.number().optional(),
    diagnostics: CycleItemDiagnosticsSchema.nullable().optional(),
  })
  .loose();
export type CyclePreviewItem = z.infer<typeof CyclePreviewItemSchema>;

/** Cycle pacing carried on the preview (engine PacingResult). Loose — the FE reads
 *  only the daily total today, and the field set may grow service-side. */
export const CyclePreviewPacingSchema = z
  .object({
    dailyTotal: z.number(),
    idealCumulative: z.number(),
    pacingRatio: z.number(),
    status: z.string(),
    note: z.string(),
  })
  .loose();
export type CyclePreviewPacing = z.infer<typeof CyclePreviewPacingSchema>;

/** POST /cycle/preview response — the engine's reallocation mapped to FE rows, plus
 *  the recommendations it raised (FE renders a count), the cycle confidence, and the
 *  pacing. `recommendations` stays loose: an engine-authored struct the FE only tallies. */
export const CyclePreviewResponseSchema = z.object({
  items: z.array(CyclePreviewItemSchema),
  recommendations: z.array(z.record(z.string(), z.unknown())),
  confidence: RunConfidenceSchema.nullable(),
  pacing: CyclePreviewPacingSchema.nullable(),
});
export type CyclePreviewResponse = z.infer<typeof CyclePreviewResponseSchema>;

/** Request to apply a scored run's proposed ad-set budgets on Meta (optimizer-apply-run
 *  edge → service /apply). The manual "Apply proposed budgets" action for a portfolio in
 *  recommend mode — the human approval is the autonomy gate (no apply_mode flip needed).
 *  Observe-mode portfolios hard-refuse real applies (`reason: 'observe_mode'`) even with
 *  dryRun:false. `run_id` (optional) pins the apply to the run the user is looking at; if
 *  it no longer matches the latest run the apply is refused (stale). `dryRun` (default true)
 *  returns the would-write set with ZERO writes; `dryRun:false` is the real Meta apply for
 *  recommend-mode human approval (FE Apply budgets + Apply N approved). */
export const ApplyRunRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  accountId: z.string().optional(),
  run_id: z.string().uuid().optional(),
  dryRun: z.boolean().optional(),
  /** The human who approved this apply — recorded as the actor on the immutable
   *  apply_audits row (authorized_kind='human'). The per-item approval path
   *  (/apply/approved) reads the approver per item from cycle_items instead. */
  authorized_by: z.string().uuid().optional(),
});
export type ApplyRunRequest = z.infer<typeof ApplyRunRequestSchema>;

/** Set/clear a portfolio's autopilot kill-switch (optimizer_set_autopilot_paused).
 *  Halts autonomous writes instantly without losing the apply_mode config. */
export const SetAutopilotPausedRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  paused: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type SetAutopilotPausedRequest = z.infer<typeof SetAutopilotPausedRequestSchema>;

/** Approve one proposed budget change for the per-item apply path
 *  (optimizer_request_apply_item → marks the cycle item approved_pending). */
export const RequestApplyItemRequestSchema = z.object({
  run_id: z.string().uuid(),
  adset_id: z.string().min(1),
});
export type RequestApplyItemRequest = z.infer<typeof RequestApplyItemRequestSchema>;

/** Approve MANY proposed budget changes in one round-trip
 *  (optimizer_request_apply_items — the Action Log's multi-select "Approve selected"). */
export const RequestApplyItemsRequestSchema = z.object({
  run_id: z.string().uuid(),
  adset_ids: z.array(z.string().min(1)).min(1),
});
export type RequestApplyItemsRequest = z.infer<typeof RequestApplyItemsRequestSchema>;

/** Drain approved ad-set pause recommendations into real Meta status writes
 *  (optimizer-apply-adset-status edge → service /apply/adset-status). Pause is a
 *  HUMAN-ONLY write in every tier: the scheduler never calls this path, observe
 *  hard-refuses, and `dryRun` (default true) returns the would-pause set with ZERO
 *  writes. Each executed pause is ledgered (optimizer.adset_status_ledger), audited
 *  (apply_audits scope 'adset_status', prior→target status), and revertible. */
export const ApplyAdsetStatusRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  accountId: z.string().optional(),
  dryRun: z.boolean().optional(),
  /** The human who approved the pauses — stamped by the edge from the caller's JWT. */
  authorized_by: z.string().uuid().optional(),
});
export type ApplyAdsetStatusRequest = z.infer<typeof ApplyAdsetStatusRequestSchema>;

/** One would-pause / pause outcome in the adset-status drain envelope. */
export const AdsetStatusWouldWriteSchema = z.object({
  adset_id: z.string(),
  target_status: z.string(),
});
export type AdsetStatusWouldWrite = z.infer<typeof AdsetStatusWouldWriteSchema>;

/** optimizer-apply-adset-status response — same envelope family as ApplyRunResponse.
 *  Dry-run returns `would` (the pauses that WOULD be written, 0 writes); a real drain
 *  returns ledger-guarded counters + per-item `results`. */
export const ApplyAdsetStatusResponseSchema = z.object({
  ok: z.boolean(),
  dryRun: z.boolean().optional(),
  runId: z.string().optional(),
  would: z.array(AdsetStatusWouldWriteSchema).default([]),
  applied: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  deduped: z.number().int().nonnegative().optional(),
  skipped: z.number().int().nonnegative().optional(),
  results: z
    .array(z.object({ adsetId: z.string(), ok: z.boolean(), error: z.string().optional() }))
    .default([]),
  reason: z.string().optional(),
  error: z.string().optional(),
});
export type ApplyAdsetStatusResponse = z.infer<typeof ApplyAdsetStatusResponseSchema>;

/** The Meta write receipt captured on a successful budget write and stored in
 *  optimizer.apply_audits.meta_receipt. Kept loose — it is read back from jsonb. */
export const ApplyReceiptSchema = z
  .object({
    success: z.boolean().optional(),
    entityId: z.string().optional(),
    fbtraceId: z.string().optional(),
  })
  .loose();
export type ApplyReceipt = z.infer<typeof ApplyReceiptSchema>;

/** One immutable money-write audit row (optimizer.apply_audits) surfaced to the FE.
 *  DB-derived read model → LOOSE (built from jsonb, narrowed on read). */
export const ApplyAuditSchema = z
  .object({
    id: z.string().optional(),
    scope: z.enum(['adset_budget', 'campaign_convert', 'ad_status', 'adset_status']).optional(),
    portfolio_id: z.string().nullable().optional(),
    campaign_id: z.string().nullable().optional(),
    adset_id: z.string().nullable().optional(),
    /** The specific ad on a scope='ad_status' row; null on ad-set-scoped writes. */
    ad_id: z.string().nullable().optional(),
    prior_minor: z.number().nullable().optional(),
    target_minor: z.number().nullable().optional(),
    /** Status-write scopes (ad_status / adset_status) record the transition here;
     *  budget scopes leave them null. prior_status null = unknown, not revertible. */
    prior_status: z.string().nullable().optional(),
    target_status: z.string().nullable().optional(),
    authorized_kind: z.enum(['autopilot', 'human']).optional(),
    authorized_by: z.string().nullable().optional(),
    mode: z.string().nullable().optional(),
    meta_receipt: z.record(z.string(), z.unknown()).optional(),
    created_at: z.string().optional(),
  })
  .loose();
export type ApplyAudit = z.infer<typeof ApplyAuditSchema>;

/** One proposed budget move in an apply preview: the current daily budget and the
 *  proposed one (both MAJOR units, account currency). */
export const ApplyWouldWriteSchema = z.object({
  adset_id: z.string(),
  current: z.number().nonnegative(),
  proposed: z.number().nonnegative(),
});
export type ApplyWouldWrite = z.infer<typeof ApplyWouldWriteSchema>;

/** One applied-write outcome (real apply). */
export const ApplyResultItemSchema = z.object({
  adsetId: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type ApplyResultItem = z.infer<typeof ApplyResultItemSchema>;

/** optimizer-apply-run response. Dry-run returns `would` (the moves that WOULD be
 *  written, 0 writes); a real apply returns the ledger-guarded outcome counters +
 *  per-item `results`. `reason` is a soft failure (no_cycle / stale_run / not_permitted). */
export const ApplyRunResponseSchema = z.object({
  ok: z.boolean(),
  dryRun: z.boolean().optional(),
  runId: z.string().optional(),
  would: z.array(ApplyWouldWriteSchema).default([]),
  applied: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  deduped: z.number().int().nonnegative().optional(),
  results: z.array(ApplyResultItemSchema).default([]),
  reason: z.string().optional(),
  error: z.string().optional(),
});
export type ApplyRunResponse = z.infer<typeof ApplyRunResponseSchema>;

/** Request to revert ONE prior ad-set budget write back to its pre-write value
 *  (optimizer-apply-revert edge → service /apply/revert). The "Revert" action on an
 *  apply_executed money row. The service reloads the immutable apply_audits row named by
 *  `audit_id`, refuses anything but scope 'adset_budget', and pushes a single-item apply
 *  back to the audit's `prior_minor` through the SAME ledger-guarded, audited write seam —
 *  so the revert's own audit row records target←prior naturally. `portfolio_id` is
 *  cross-checked against the audit's portfolio (the edge proves the caller can access it),
 *  so a caller can never revert a write under a portfolio they cannot reach. Observe-mode
 *  portfolios hard-refuse (`reason: 'observe_mode'`). `dryRun` (default true) returns the
 *  single would-write with ZERO writes. */
export const ApplyRevertRequestSchema = z.object({
  audit_id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  accountId: z.string().optional(),
  dryRun: z.boolean().optional(),
  /** The human who authorized this revert — recorded as the actor on the new immutable
   *  apply_audits row (authorized_kind='human'). Stamped by the edge from the caller's JWT. */
  authorized_by: z.string().uuid().optional(),
});
export type ApplyRevertRequest = z.infer<typeof ApplyRevertRequestSchema>;

/** optimizer-apply-revert response — the same envelope family as ApplyRunResponse. A
 *  dry-run returns `would` (0 writes); a real revert returns the ledger-guarded outcome
 *  counters + per-item `results`. `auditId` echoes the reverted audit id. `reason` is a soft
 *  failure: audit_not_found / unsupported_scope / scope_mismatch / no_prior / no_prior_status
 *  / observe_mode / campaign_unsupported / account_unreadable.
 *
 *  `would` is scope-shaped: a BUDGET revert previews the single current←prior move
 *  (ApplyWouldWrite); an ad-set STATUS revert (unpausing a pause) previews the target status
 *  it would restore (AdsetStatusWouldWrite {adset_id, target_status}). The union lets one
 *  envelope carry both without a status revert failing to parse as a budget move. */
export const ApplyRevertResponseSchema = z.object({
  ok: z.boolean(),
  dryRun: z.boolean().optional(),
  auditId: z.string().optional(),
  would: z.array(z.union([ApplyWouldWriteSchema, AdsetStatusWouldWriteSchema])).default([]),
  applied: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  deduped: z.number().int().nonnegative().optional(),
  skipped: z.number().int().nonnegative().optional(),
  results: z.array(ApplyResultItemSchema).default([]),
  reason: z.string().optional(),
  error: z.string().optional(),
});
export type ApplyRevertResponse = z.infer<typeof ApplyRevertResponseSchema>;

/** Ingest data-quality signal from paid-media-metrics (tracking gaps / empty account). */
export const IngestDiagnosticsSchema = z.object({
  adsets: z.number().int().nonnegative(),
  spending: z.number().int().nonnegative(),
  trackingGaps: z.number().int().nonnegative(),
  gapSamples: z.array(z.string()),
});
export type IngestDiagnostics = z.infer<typeof IngestDiagnosticsSchema>;

/** Why the suggestion list is the way it is — lets the onboarding UI explain an
 *  empty result precisely instead of a bare "no suggestions yet":
 *  - `ok`            — suggestions were produced.
 *  - `no_active`     — the account returned no active ad sets at all.
 *  - `all_cbo`       — active ad sets exist, but every one is CBO/lifetime (no
 *                      ad-set daily budget the optimizer can move).
 *  - `tracking_gaps` — eligible ad sets exist and are spending, but none has a
 *                      tracked conversion, so we can't responsibly group them.
 *  - `not_permitted` — the ad account isn't visible to this brand/caller (the
 *                      brand-access gate rejected it), so nothing was fetched. */
export const SuggestReasonSchema = z.enum([
  'ok',
  'no_active',
  'all_cbo',
  'tracking_gaps',
  'not_permitted',
]);
export type SuggestReason = z.infer<typeof SuggestReasonSchema>;

/** Onboarding suggestions plus ingest data-quality flags (partial data / tracking gaps). */
export const SuggestResultSchema = z.object({
  suggestions: z.array(PortfolioSuggestionSchema),
  /** Present when the suggestion list is empty (or partial) — the FE renders it. */
  reason: SuggestReasonSchema.optional(),
  truncated: z.boolean().optional(),
  diagnostics: IngestDiagnosticsSchema.nullable().optional(),
});
export type SuggestResult = z.infer<typeof SuggestResultSchema>;

/** One active ad set enrolled in a portfolio (row of optimizer_list_portfolio_adsets).
 *  Read to pre-select the picker and diff enroll/unenroll on save. */
export const PortfolioAdsetSchema = z.object({
  adset_id: z.string(),
  adset_name: z.string().nullable(),
  active: z.boolean(),
  /** Last cycle at which this ad set appeared in the account's live ACTIVE fleet. */
  last_seen_at: z.string().nullable().optional(),
  /** Set once the ad set STOPPED appearing there — paused, deleted, or flipped to CBO in Ads
   *  Manager. It stays enrolled (releasing a claim is a human decision) but the optimizer can
   *  no longer score it, so the roster must say so rather than presenting it as live.
   *  Optional: older deployments of the read do not return it. */
  missing_since: z.string().nullable().optional(),
});
export type PortfolioAdset = z.infer<typeof PortfolioAdsetSchema>;

/** One row of optimizer_list_account_enrollments — which portfolio already claims an ad set,
 *  across the whole account. An ad set may hold exactly one ACTIVE enrollment, so the picker
 *  needs this to say "already in Prospecting Q3" BEFORE the user saves, and the confirm step
 *  needs it to say what will move. */
export const AccountEnrollmentSchema = z.object({
  adset_id: z.string(),
  portfolio_id: z.string().uuid(),
  portfolio_name: z.string().nullable(),
});
export type AccountEnrollment = z.infer<typeof AccountEnrollmentSchema>;

/** What kind of thing happened to a portfolio at a point in time. */
export const TimelineEventKindSchema = z.enum(['cycle', 'applied', 'status', 'config']);
export type TimelineEventKind = z.infer<typeof TimelineEventKindSchema>;

/** One row of optimizer_get_timeline_events — an observed event plotted as a flag on the
 *  cost timeline. Money and status writes arrive pre-aggregated per day (one reallocation
 *  touching 20 ad sets is one event to a reader); config changes arrive individually. */
export const TimelineEventSchema = z.object({
  ts: z.string(),
  kind: TimelineEventKindSchema,
  label: z.string(),
  detail: z.string().nullable().optional(),
  adset_id: z.string().nullable().optional(),
  count: z.number().int().nonnegative().default(1),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

/** What an ad's creative actually IS, at a resolution you can read.
 *
 *  `thumbnailUrl` on the ad is Meta's default 64x64 (`stp=...p64x64_q75...`) — about
 *  4,000 pixels, and the signed URL cannot be resized by hand (stripping `stp=`
 *  returns 403). Every consumer that showed a creative larger than a favicon was
 *  upscaling that smear. These fields carry the readable renditions instead:
 *  `imageUrl` for an image creative, `posterUrl` for the 480x848-class video poster
 *  from `GET /{video_id}/thumbnails`, `videoUrl` for the playable source when Meta
 *  grants it.
 *
 *  Every field is optional: an edge deployment that predates this shape must keep
 *  parsing, and the Frontend falls back to `thumbnailUrl` when they are absent. */
export const AdCreativeSlideSchema = z.object({
  /** Position in the carousel, 0-based. */
  index: z.number(),
  imageUrl: z.string().nullable().optional(),
  /** Playable source when this slide is a video AND Meta granted access to it. */
  videoUrl: z.string().nullable().optional(),
  posterUrl: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
});
export type AdCreativeSlide = z.infer<typeof AdCreativeSlideSchema>;

export const AdCreativeMediaSchema = z.object({
  /** Derived the same way as paid_media.ad_creatives.format. */
  format: z.enum(['image', 'video', 'carousel', 'unknown']).optional(),
  imageUrl: z.string().nullable().optional(),
  posterUrl: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  permalinkUrl: z.string().nullable().optional(),
  /** Populated only for carousels; a single-media ad leaves this empty. */
  slides: z.array(AdCreativeSlideSchema).optional(),
});
export type AdCreativeMedia = z.infer<typeof AdCreativeMediaSchema>;

/** One ad inside an ad set — provenance only (display-only; ads are not enrollable).
 *  Lazy-loaded per ad set via paid-media-metrics scope=adset_ads. */
export const AdsetAdSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  status: z.string().nullable().optional(), // Meta effective_status
  /** Meta's 64x64. Kept as the last-resort fallback, never the preferred render. */
  thumbnailUrl: z.string().nullable().optional(),
  creative: AdCreativeMediaSchema.nullable().optional(),
});
export type AdsetAd = z.infer<typeof AdsetAdSchema>;

/** paid-media-metrics scope=adset_ads response — the ads under one ad set. */
export const AdsetAdsResponseSchema = z.object({
  ads: z.array(AdsetAdSchema),
});
export type AdsetAdsResponse = z.infer<typeof AdsetAdsResponseSchema>;

/** One calendar day of an individual ad's paid performance — the grain behind the
 *  creative hovercard sparkline and the per-creative line chart. Derived from Meta
 *  ad-level daily insights (time_increment=1). cpa is null on a zero-purchase day
 *  and roas is null on a zero-spend day (undefined ratios stay undefined, not 0). */
export const AdDailyTrendPointSchema = z.object({
  date: z.string(),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  cpc: z.number(),
  cpa: z.number().nullable(),
  roas: z.number().nullable(),
  purchases: z.number(),
  purchase_value: z.number(),
});
export type AdDailyTrendPoint = z.infer<typeof AdDailyTrendPointSchema>;

/** One ad's date-ascending daily series (paid-media-metrics scope=ad_daily_trends). */
export const AdDailyTrendSchema = z.object({
  ad_id: z.string(),
  ad_name: z.string().nullable(),
  series: z.array(AdDailyTrendPointSchema),
});
export type AdDailyTrend = z.infer<typeof AdDailyTrendSchema>;

/** paid-media-metrics scope=ad_daily_trends response — per-ad daily trend series
 *  for a set of ads (filtered by adset or explicit adIds). */
export const AdDailyTrendsResponseSchema = z.object({
  ads: z.array(AdDailyTrendSchema),
});
export type AdDailyTrendsResponse = z.infer<typeof AdDailyTrendsResponseSchema>;

/** One point of optimizer_get_cpa_series — portfolio spend/objective-results per
 * cycle, aggregated across ad sets for each trailing window. The established
 * `conv_d*` wire keys remain for compatibility; their semantic is determined by
 * the portfolio objective through {@link getOptimizationMetricDefinition}. */
export const EfficiencySeriesPointSchema = z.object({
  cycle_ts: z.string(),
  spend_d3: z.number(),
  conv_d3: z.number(),
  spend_d7: z.number(),
  conv_d7: z.number(),
  spend_d14: z.number(),
  conv_d14: z.number(),
  adsets: z.number().int().nonnegative(),
});
export type EfficiencySeriesPoint = z.infer<typeof EfficiencySeriesPointSchema>;

/** @deprecated Prefer EfficiencySeriesPoint. Kept for existing RPC consumers. */
export const CpaSeriesPointSchema = EfficiencySeriesPointSchema;
/** @deprecated Prefer EfficiencySeriesPoint. Kept for existing RPC consumers. */
export type CpaSeriesPoint = EfficiencySeriesPoint;

/** One cell of optimizer_get_angle_matrix — spend/conversions for an
 *  (audience_type × communication angle) combination in a portfolio. FE pivots
 *  these into a heat map and derives CPA = spend / conversions per cell. */
export const AngleMatrixCellSchema = z.object({
  audience_type: z.string(), // prospecting | retargeting | remarketing | unknown
  angle: z.string(), // a CommunicationAngle archetype, or "untagged" until analyzed
  spend: z.number(),
  conversions: z.number(),
  adsets: z.number().int().nonnegative(),
});
export type AngleMatrixCell = z.infer<typeof AngleMatrixCellSchema>;

/** Canonical communication-angle vocabulary — REUSES the competitor-spy hook
 *  archetypes so the brand's own paid ads and competitors' ads are tagged on the
 *  same scale (no parallel enum to drift). */
export const CommunicationAngleSchema = competitorAdHookArchetypeSchema;
export type CommunicationAngle = z.infer<typeof CommunicationAngleSchema>;

/** Jaina's creative-angle analysis for ONE of the brand's own paid ads. Produced by
 *  a Jaina creative-analysis worker (multimodal Gemini over the ad creative + copy);
 *  its `angle` is written to optimizer.adset_snapshots.angle and powers the audience ×
 *  angle heat map (optimizer_get_angle_matrix). Loose object (an LLM may add keys). */
export const PaidAdAngleSchema = z.object({
  ad_id: z.string(),
  adset_id: z.string(),
  angle: CommunicationAngleSchema, // the communication-angle archetype
  hook: z.string().nullable().optional(), // the headline/hook that defines the angle
  rationale: z.string().nullable().optional(), // short, human "why this angle"
  confidence: z.number().min(0).max(1).nullable().optional(),
  themes: z.array(z.string()).default([]),
  analyzed_from_image: z.boolean().default(false), // saw the creative vs copy-only
  analyzed_at: z.string().nullable().optional(), // ISO timestamp
});
export type PaidAdAngle = z.infer<typeof PaidAdAngleSchema>;

/** Request to Jaina's creative-angle worker: tag the ads in a portfolio (or a
 *  specific ad-set subset) and write angles back to the snapshots. */
export const AnalyzePaidAdAnglesRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  adset_ids: z.array(z.string()).optional(), // omit = all ad sets in the portfolio
});
export type AnalyzePaidAdAnglesRequest = z.infer<typeof AnalyzePaidAdAnglesRequestSchema>;

/** Compact status for agents (paid.optimizer_status). */
export const OptimizerStatusSchema = z.object({
  portfolio_id: z.string().uuid(),
  last_cycle_ts: z.string().nullable(),
  conserved: z.boolean().nullable(),
  pending_recommendations: z.number().int().nonnegative(),
  adset_count: z.number().int().nonnegative(),
});
export type OptimizerStatus = z.infer<typeof OptimizerStatusSchema>;

/** One row of the optimizer activity log for the in-app log page
 *  (optimizer_list_logs). DB-derived read model: `id` may arrive as bigint number
 *  or string, and `fields` is arbitrary per-event context — kept loose; the FE
 *  narrows on read (see "contracts wire DTOs stay loose"). */
export const OptimizerLogRowSchema = z.object({
  id: z.coerce.number().int(),
  portfolio_id: z.string().uuid().nullable(),
  portfolio_name: z.string().nullable(),
  ts: z.string(), // ISO timestamptz
  level: z.enum(['info', 'warn', 'error']),
  event: z.string(),
  fields: z.record(z.string(), z.unknown()).default({}),
});
export type OptimizerLogRow = z.infer<typeof OptimizerLogRowSchema>;

/** The optimizer log-page response envelope (edge optimizer-status ?view=logs). */
export const OptimizerLogsResponseSchema = z.object({
  logs: z.array(OptimizerLogRowSchema),
});
export type OptimizerLogsResponse = z.infer<typeof OptimizerLogsResponseSchema>;

// ---------------------------------------------------------------------------
// Rules engine (optimizer.rules) — rules-as-data, and rules-as-permissions
// ---------------------------------------------------------------------------

/** One rule version. `conditions`/`action`/`params` are the engine's JSONB wire
 *  format (see packages/optimization-engine/src/rules) and stay opaque here — the
 *  engine owns their shape, contracts only carries the row.
 *
 *  `execution_mode` is the permission: 'suggest' means findings only ever become
 *  pending recommendations; 'granted' means the user has given the optimizer a
 *  standing instruction to act on them. Only reversible action kinds can ever be
 *  granted (enforced by a DB CHECK, the set-rule RPC, and GRANTABLE_ACTION_KINDS
 *  in the engine) — scale, spend increases, and ad activation always need a fresh
 *  human verdict. */
export const RuleRowSchema = z
  .object({
    id: z.string(),
    portfolio_id: z.string(),
    template_id: z.string().nullable().optional(),
    version: z.number().int(),
    name: z.string(),
    enabled: z.boolean(),
    priority: z.number().int(),
    conditions: z.unknown(),
    action: z.unknown(),
    params: z.unknown().optional(),
    origin: z.string(),
    execution_mode: z.string(),
    /** Binds a grant to a still-native trigger (e.g. 'C1_creative_drag') before that
     *  trigger has a DSL expression. Such rows carry empty conditions and never evaluate. */
    trigger_binding: z.string().nullable().optional(),
    max_executions_per_day: z.number().int().nullable().optional(),
    granted_by: z.string().nullable().optional(),
    granted_at: z.string().nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .loose();
export type RuleRow = z.infer<typeof RuleRowSchema>;

/** One rule × ad-set evaluation from a cycle. `facts` is the threshold/metric
 *  snapshot the match was made on — populated on matched rows only (storage bound),
 *  and the reason a fired rule can be audited months later. */
export const RuleEvaluationRowSchema = z
  .object({
    id: z.coerce.number().int(),
    rule_id: z.string(),
    run_id: z.string(),
    portfolio_id: z.string(),
    adset_id: z.string(),
    matched: z.boolean(),
    /** True when the rule matched but a built-in trigger (or a higher-priority rule)
     *  already owned this (ad set, kind). */
    deduped: z.boolean(),
    facts: z.record(z.string(), z.unknown()).nullable().optional(),
    error: z.string().nullable().optional(),
    created_at: z.string().optional(),
  })
  .loose();
export type RuleEvaluationRow = z.infer<typeof RuleEvaluationRowSchema>;

/** A standing-rule proposal mined from the user's OWN approval history — "you
 *  approved this 9 times out of 9 in this portfolio; make it a rule?". Computed at
 *  read time from human decisions only (grant-executed approvals are excluded, or a
 *  single grant would keep re-justifying itself). */
export const RuleSuggestionRowSchema = z
  .object({
    portfolio_id: z.string(),
    kind: z.string(),
    trigger: z.string(),
    n_approved: z.number().int().nonnegative(),
    n_rejected: z.number().int().nonnegative(),
    last_decided_at: z.string().nullable().optional(),
  })
  .loose();
export type RuleSuggestionRow = z.infer<typeof RuleSuggestionRowSchema>;

/** Per-rule outcome record. `win_rate` is empirical-Bayes shrunk on read, so a
 *  2-for-2 rule does not outrank a 40-for-50 one. Directional evidence about
 *  whether a rule's decisions helped — never causal proof. */
export const RuleStatsRowSchema = z
  .object({
    rule_id: z.string(),
    n: z.number().int().nonnegative(),
    win_rate: z.number().nullable().optional(),
  })
  .loose();
export type RuleStatsRow = z.infer<typeof RuleStatsRowSchema>;

/** Patch accepted by optimizer_set_rule. `executionMode: 'granted'` is the
 *  permission ceremony — it stamps the grantor and writes an audit row. */
export const UpdateRulePatchSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  maxExecutionsPerDay: z.number().int().positive().optional(),
  executionMode: z.enum(['suggest', 'granted']).optional(),
});
export type UpdateRulePatch = z.infer<typeof UpdateRulePatchSchema>;

// ---------------------------------------------------------------------------
// Creative swap — the optimizer asking for the next creative
// ---------------------------------------------------------------------------

/** How the replacement creative gets made.
 *  generate       — headless model generation from the seed + brand grounding.
 *  render_template — the external After Effects render API (adapter seam).
 *  use_asset      — a creative a human (or the canvas) already produced. */
export const CreativeSwapModeSchema = z.enum(['generate', 'render_template', 'use_asset']);
export type CreativeSwapMode = z.infer<typeof CreativeSwapModeSchema>;

export const CreativeSwapSourceSchema = z.enum(['optimizer', 'jaina', 'human']);
export type CreativeSwapSource = z.infer<typeof CreativeSwapSourceSchema>;

/** The swap request: a prompt plus the destination it is going up into. The
 *  campaign/ad-set/ad ids are what make this a *swap* rather than a generation —
 *  the endpoint knows where the result lands, so the whole loop closes without a
 *  human copying an asset id between two screens. */
export const CreativeSwapRequestSchema = z.object({
  brandId: z.string(),
  campaignId: z.string(),
  adsetId: z.string(),
  /** The ad being iterated on / replaced. */
  adId: z.string(),
  mode: CreativeSwapModeSchema,
  prompt: z.string().optional(),
  /** CreativeVariationSeed passthrough from the recommendation. */
  seed: z.record(z.string(), z.unknown()).optional(),
  /** Required for mode: 'use_asset' — the media.assets row to publish. */
  assetId: z.string().optional(),
  source: CreativeSwapSourceSchema,
  recommendationId: z.string().optional(),
});
export type CreativeSwapRequest = z.infer<typeof CreativeSwapRequestSchema>;

/** A durable swap job. `brief` is FROZEN at enqueue: what the worker executes must
 *  not drift under it if the recommendation is later re-derived. */
export const CreativeSwapJobRowSchema = z
  .object({
    id: z.string(),
    portfolio_id: z.string().nullable().optional(),
    brand_id: z.string(),
    recommendation_id: z.string().nullable().optional(),
    campaign_id: z.string(),
    adset_id: z.string(),
    ad_id: z.string().nullable().optional(),
    mode: z.string(),
    seed: z.record(z.string(), z.unknown()).nullable().optional(),
    brief: z.record(z.string(), z.unknown()).nullable().optional(),
    asset_id: z.string().nullable().optional(),
    // queued | generating | generated | publishing | published | failed | cancelled
    status: z.string(),
    attempts: z.number().int().nonnegative().optional(),
    result: z.record(z.string(), z.unknown()).nullable().optional(),
    error: z.record(z.string(), z.unknown()).nullable().optional(),
    enqueued_via: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .loose();
export type CreativeSwapJobRow = z.infer<typeof CreativeSwapJobRowSchema>;
