// Optimizer-SERVICE IO contracts — the DTOs that cross FE/agents <-> the
// standalone optimizer microservice and its RPC layer. The engine IO types
// (AdSetSnapshot, CycleResult, ...) live in ./index; these are the orchestration
// envelopes around them (enrollment, run requests, the FE read-model report).
//
// Discipline: REQUEST schemas are strict (validated at the boundary). The
// DB-derived read models (CycleRunReport, OptimizerStatus) are kept LOOSE — the
// Backend builds them from unknown DB jsonb and the Frontend narrows on read
// (see the "contracts wire DTOs stay loose" rule).

import {
  FreezeReasonSchema,
  OptimizationObjectiveSchema,
} from '@continuum/optimization-engine/schemas';
import { z } from 'zod';
import { competitorAdHookArchetypeSchema } from '../competitor-spy/analysis';

/** Why an ad set was HELD (budget left unchanged on purpose) this cycle — mirrors
 *  the engine FreezeReason. Surfaced so the FE renders a labeled "Held" state
 *  instead of a misleading $0.00 change. */
export type FreezeReason = z.infer<typeof FreezeReasonSchema>;

/** Per-portfolio autonomy dial. `recommend` proposes; `autopilot` auto-applies
 *  budget within the engine's guardrails. Pauses always need approval in both. */
export const ApplyModeSchema = z.enum(['recommend', 'autopilot']);
export type ApplyMode = z.infer<typeof ApplyModeSchema>;

export const OptimizationModeSchema = z.enum(['efficiency', 'balanced', 'scale']);
export type OptimizationModeDto = z.infer<typeof OptimizationModeSchema>;

export const RecommendationStatusSchema = z.enum(['pending', 'approved', 'rejected', 'applied']);
export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;

/** Input to create a portfolio (maps to optimizer_create_portfolio's p_config). */
export const PortfolioConfigSchema = z.object({
  name: z.string().min(1),
  objective: OptimizationObjectiveSchema,
  mode: OptimizationModeSchema.default('balanced'),
  apply_mode: ApplyModeSchema.default('recommend'),
  daily_total: z.number().nonnegative(),
  period_budget: z.number().nonnegative().optional(),
  cpa_target: z.number().positive().optional(),
  velocity_cap_pct: z.number().min(0).max(5).optional(),
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
    mode: OptimizationModeSchema.optional(),
    apply_mode: ApplyModeSchema.optional(),
    daily_total: z.number().nonnegative().optional(),
    period_budget: z.number().nonnegative().nullable().optional(),
    cpa_target: z.number().positive().nullable().optional(),
    velocity_cap_pct: z.number().min(0).max(5).optional(),
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
 *  (campaign_id is expanded to its ad sets service-side). */
export const EnrollRequestSchema = z
  .object({
    portfolio_id: z.string().uuid(),
    adset_ids: z.array(z.string()).min(1).optional(),
    campaign_id: z.string().optional(),
  })
  .refine((d) => Boolean(d.adset_ids) !== Boolean(d.campaign_id), {
    message: 'Provide exactly one of adset_ids or campaign_id',
  });
export type EnrollRequest = z.infer<typeof EnrollRequestSchema>;

export const EnrollResultSchema = z.object({
  enrolled: z.number().int().nonnegative(),
  first_cycle: z.literal('queued'),
});
export type EnrollResult = z.infer<typeof EnrollResultSchema>;

/** POST /enroll response — canonical `*Response` name for the route/MCP phases
 *  (same shape as EnrollResultSchema, kept for back-compat). */
export const EnrollResponseSchema = EnrollResultSchema;
export type EnrollResponse = z.infer<typeof EnrollResponseSchema>;

/** Trigger a cycle: either an enrolled portfolio, or an ad-hoc set. */
export const RunCycleRequestSchema = z.union([
  z.object({ portfolio_id: z.string().uuid() }),
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

/** POST /cycle response — mirrors the optimizer service's CycleOutcome. One run's
 *  outcome: the persisted run id, how many ad-set snapshots it scored, the engine
 *  recommendations it raised, and (in autopilot) the platform apply results.
 *  `recommendations` / `applied` / `failed` stay loose arrays: recommendations are
 *  the engine `Recommendation` shape and apply rows carry platform response jsonb;
 *  the FE narrows what it renders (see the "wire DTOs stay loose" rule). */
export const RunCycleResponseSchema = z.object({
  portfolioId: z.string().uuid().nullable(),
  runId: z.string().uuid(),
  snapshotCount: z.number().int().nonnegative(),
  recommendations: z.array(z.record(z.string(), z.unknown())),
  applied: z.array(z.record(z.string(), z.unknown())),
  failed: z.array(z.record(z.string(), z.unknown())),
  skipped: z.array(z.record(z.string(), z.unknown())).optional(),
});
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
export const CycleItemRowSchema = z
  .object({
    adset_id: z.string(),
    current_budget: z.number().nullable(),
    final_budget: z.number().nullable(),
    change_abs: z.number().nullable(),
    change_pct: z.number().nullable(),
    composite_score: z.number().nullable().optional(),
    diagnostics: CycleItemDiagnosticsSchema.nullable().optional(),
  })
  .loose();
export type CycleItemRow = z.infer<typeof CycleItemRowSchema>;

/** One optimizer.recommendations row inside CycleRunReport.recommendations. */
export const RecommendationRowSchema = z
  .object({
    id: z.string().uuid(),
    adset_id: z.string(),
    kind: z.string(), // pause | creative_refresh | audience_expand
    trigger: z.string(),
    severity: z.string().nullable(),
    reason: z.string().nullable(),
    status: z.string(),
    created_at: z.string().optional(),
  })
  .loose();
export type RecommendationRow = z.infer<typeof RecommendationRowSchema>;

/** Cycle-level Confidence (optimizer.cycle_runs.confidence jsonb). Aligned with
 *  the engine `Confidence` shape (see @continuum/optimization-engine ConfidenceSchema)
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
    daily_total: z.number().nullable().optional(),
    period_budget: z.number().nullable().optional(),
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
  mode: z.string(),
  apply_mode: z.string(),
  daily_total: z.number().nullable(),
  period_budget: z.number().nullable(),
  status: z.string(),
  next_realloc_at: z.string().nullable(),
  adset_count: z.number().int().nonnegative(),
  pending_recommendations: z.number().int().nonnegative(),
});
export type PortfolioListItem = z.infer<typeof PortfolioListItemSchema>;

/** A renewal work item, opened when a fatigue recommendation is approved. */
export const RenewalTaskStatusSchema = z.enum(['open', 'done', 'dismissed']);
export type RenewalTaskStatus = z.infer<typeof RenewalTaskStatusSchema>;

export const RenewalTaskSchema = z.object({
  id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
  portfolio_name: z.string(),
  adset_id: z.string(),
  kind: z.string(), // creative_refresh | audience_expand
  reason: z.string().nullable(),
  status: z.string(),
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
  mode: OptimizationModeSchema,
  daily_total: z.number().nonnegative(),
  cpa_target: z.number().positive().optional(),
  adset_ids: z.array(z.string()),
  summary: z.object({
    adsets: z.number().int().nonnegative(),
    spend14: z.number(),
    conv14: z.number(),
  }),
  reason: z.string(),
});
export type PortfolioSuggestion = z.infer<typeof PortfolioSuggestionSchema>;

/** Ingest data-quality signal from paid-media-metrics (tracking gaps / empty account). */
export const IngestDiagnosticsSchema = z.object({
  adsets: z.number().int().nonnegative(),
  spending: z.number().int().nonnegative(),
  trackingGaps: z.number().int().nonnegative(),
  gapSamples: z.array(z.string()),
});
export type IngestDiagnostics = z.infer<typeof IngestDiagnosticsSchema>;

/** Onboarding suggestions plus ingest data-quality flags (partial data / tracking gaps). */
export const SuggestResultSchema = z.object({
  suggestions: z.array(PortfolioSuggestionSchema),
  truncated: z.boolean().optional(),
  diagnostics: IngestDiagnosticsSchema.nullable().optional(),
});
export type SuggestResult = z.infer<typeof SuggestResultSchema>;

/** One point of optimizer_get_cpa_series — portfolio spend/conversions per cycle,
 *  aggregated across ad sets for each trailing window. FE derives CPA = spend/conv. */
export const CpaSeriesPointSchema = z.object({
  cycle_ts: z.string(),
  spend_d3: z.number(),
  conv_d3: z.number(),
  spend_d7: z.number(),
  conv_d7: z.number(),
  spend_d14: z.number(),
  conv_d14: z.number(),
  adsets: z.number().int().nonnegative(),
});
export type CpaSeriesPoint = z.infer<typeof CpaSeriesPointSchema>;

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
