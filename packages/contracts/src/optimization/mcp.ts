// MCP umbrella IO contracts for the paid-media optimizer — the two capability
// umbrellas the Backend mounts on the MCP surface. `optimizer_query` is the read
// entry point (portfolios, performance, CPA series, angle matrix, pending
// recommendations, onboarding suggestions, activity logs, ad-set membership,
// compact status, per-recommendation insight); `optimizer_manage` is the write
// entry point (create a portfolio, create-and-enroll from a suggestion, enroll ad
// sets or a whole campaign, convert a CBO campaign to ABO — preview only —, act on
// a recommendation, update / archive / unenroll, run a cycle now). Both dispatch on
// an `action` enum and reuse the canonical service request/response schemas so the
// MCP surface never drifts from the HTTP boundary the dashboard uses.

import { z } from 'zod';
import {
  AdsetBudgetSchema,
  AngleMatrixCellSchema,
  CpaSeriesPointSchema,
  CreatePortfolioRequestSchema,
  CreatePortfolioResponseSchema,
  CycleRunReportSchema,
  EnrollRequestSchema,
  EnrollResponseSchema,
  OptimizerInsightRequestSchema,
  OptimizerInsightResponseSchema,
  OptimizerLogRowSchema,
  OptimizerStatusSchema,
  PortfolioAdsetSchema,
  PortfolioLevelSchema,
  PortfolioListItemSchema,
  PortfolioSuggestionSchema,
  RecommendationRowSchema,
  RecommendationStatusSchema,
  RenewalTaskSchema,
  RenewalTaskStatusSchema,
  RunCycleRequestSchema,
  RunCycleResponseSchema,
  SuggestResultSchema,
  UpdatePortfolioPatchSchema,
  UpdatePortfolioResponseSchema,
} from './service';

// ── optimizer_query (read) ───────────────────────────────────────────────────

/** Read actions the umbrella dispatches on. */
export const OptimizerQueryActionSchema = z.enum([
  'portfolios', // list the brand's portfolios (Overview)
  'performance', // one portfolio's cycle-run report (performance tab)
  'cpa_series', // one portfolio's spend/conversions per cycle
  'angle_matrix', // one portfolio's audience × angle heat map
  'pending_recs', // one portfolio's pending recommendations
  'suggestions', // onboarding: suggested portfolios for an ad account
  'logs', // the brand's optimizer activity log
  'adsets', // the ad sets enrolled in one portfolio
  'status', // compact agent status for one portfolio
  'insight', // plain-language rephrasing of one recommendation's reason
  'renewal_tasks', // the brand's open renewal work items (opened when a rec is approved)
]);
export type OptimizerQueryAction = z.infer<typeof OptimizerQueryActionSchema>;

/** optimizer_query input — a discriminated union keyed on `action`. `portfolios` /
 *  `logs` need only the brand; `suggestions` targets an ad account; the rest target
 *  one `portfolio_id`; `insight` carries the recommendation grounding payload. */
export const OptimizerQueryInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('portfolios'), brand_id: z.string().uuid() }),
  z.object({ action: z.literal('logs'), brand_id: z.string().uuid() }),
  z.object({
    action: z.literal('suggestions'),
    brand_id: z.string().uuid(),
    ad_account_id: z.string().min(1).optional(),
    level: PortfolioLevelSchema.optional(),
  }),
  z.object({
    action: z.literal('performance'),
    brand_id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('cpa_series'),
    brand_id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('angle_matrix'),
    brand_id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('pending_recs'),
    brand_id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('adsets'),
    brand_id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('status'),
    brand_id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('insight'),
    brand_id: z.string().uuid(),
    payload: OptimizerInsightRequestSchema,
  }),
  z.object({
    action: z.literal('renewal_tasks'),
    brand_id: z.string().uuid(),
    status: RenewalTaskStatusSchema.optional(), // defaults to 'open' server-side
  }),
]);
export type OptimizerQueryInput = z.infer<typeof OptimizerQueryInputSchema>;

/** optimizer_query output — a discriminated union keyed on the requested action
 *  so the agent (and the Backend emit side) share one exhaustive shape. */
export const OptimizerQueryOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('portfolios'),
    portfolios: z.array(PortfolioListItemSchema),
  }),
  z.object({
    action: z.literal('performance'),
    portfolio_id: z.string().uuid(),
    report: CycleRunReportSchema,
  }),
  z.object({
    action: z.literal('cpa_series'),
    portfolio_id: z.string().uuid(),
    series: z.array(CpaSeriesPointSchema),
  }),
  z.object({
    action: z.literal('angle_matrix'),
    portfolio_id: z.string().uuid(),
    cells: z.array(AngleMatrixCellSchema),
  }),
  z.object({
    action: z.literal('pending_recs'),
    portfolio_id: z.string().uuid(),
    recommendations: z.array(RecommendationRowSchema),
  }),
  z.object({
    action: z.literal('suggestions'),
    result: SuggestResultSchema,
  }),
  z.object({
    action: z.literal('logs'),
    logs: z.array(OptimizerLogRowSchema),
  }),
  z.object({
    action: z.literal('adsets'),
    portfolio_id: z.string().uuid(),
    adsets: z.array(PortfolioAdsetSchema),
  }),
  z.object({
    action: z.literal('status'),
    portfolio_id: z.string().uuid(),
    status: OptimizerStatusSchema,
  }),
  z.object({
    action: z.literal('insight'),
    result: OptimizerInsightResponseSchema,
  }),
  z.object({
    action: z.literal('renewal_tasks'),
    tasks: z.array(RenewalTaskSchema),
  }),
]);
export type OptimizerQueryOutput = z.infer<typeof OptimizerQueryOutputSchema>;

// ── optimizer_manage (write) ─────────────────────────────────────────────────

/** Whitelisted write actions — each carries the matching service request. */
export const OptimizerManageActionSchema = z.enum([
  'create_portfolio',
  'create_from_suggestion',
  'enroll_adsets',
  'convert_cbo',
  'set_recommendation_status',
  'set_recommendation_statuses',
  'set_renewal_task_status',
  'update_portfolio',
  'archive_portfolio',
  'unenroll_adsets',
  'run_now',
]);
export type OptimizerManageAction = z.infer<typeof OptimizerManageActionSchema>;

/** Set a recommendation's status (approve / reject an engine recommendation).
 *  Approving a fatigue recommendation opens a renewal task server-side. */
export const SetRecommendationStatusRequestSchema = z.object({
  recommendation_id: z.string().uuid(),
  status: RecommendationStatusSchema,
});
export type SetRecommendationStatusRequest = z.infer<typeof SetRecommendationStatusRequestSchema>;

/** Approve / reject MANY recommendations in one call (optimizer_set_recommendation_statuses). */
export const SetRecommendationStatusesRequestSchema = z.object({
  recommendation_ids: z.array(z.string().uuid()).min(1),
  status: RecommendationStatusSchema,
});
export type SetRecommendationStatusesRequest = z.infer<
  typeof SetRecommendationStatusesRequestSchema
>;

/** Close out a renewal work item (creative_refresh / audience_expand). */
export const SetRenewalTaskStatusRequestSchema = z.object({
  task_id: z.string().uuid(),
  status: RenewalTaskStatusSchema,
});
export type SetRenewalTaskStatusRequest = z.infer<typeof SetRenewalTaskStatusRequestSchema>;

/** Agent-facing CBO→ABO convert request. Two-phase, mirroring post_create_instagram:
 *  `mode:'preview'` (default) computes the per-ad-set budgets WITHOUT writing to Meta and
 *  returns a `confirm_token` bound to those exact budgets; `mode:'apply'` requires that
 *  token and performs the real Meta write. The token cannot be replayed against a
 *  different payload — the budgets are recomputed and re-hashed on apply. */
export const ConvertCboToolRequestSchema = z.object({
  brandId: z.string().uuid(),
  accountId: z.string().min(1),
  campaignId: z.string().min(1),
  mode: z.enum(['preview', 'apply']).default('preview'),
  confirm_token: z.string().optional(),
});
export type ConvertCboToolRequest = z.infer<typeof ConvertCboToolRequestSchema>;

/** Preview result: the computed budgets + a confirm token to apply them. */
export const ConvertCboPreviewResultSchema = z.object({
  mode: z.literal('preview'),
  ok: z.boolean(),
  campaignId: z.string().optional(),
  currency: z.string().optional(),
  adset_budgets: z.array(AdsetBudgetSchema).default([]),
  reason: z.string().optional(),
  confirm_token: z.string().optional(),
  expires_at: z.string().optional(),
});

/** Apply result: the real conversion outcome, or a structured refusal. */
export const ConvertCboApplyResultSchema = z.object({
  mode: z.literal('apply'),
  ok: z.boolean(),
  campaignId: z.string().optional(),
  currency: z.string().optional(),
  converted: z.number().int().nonnegative().optional(),
  adset_budgets: z.array(AdsetBudgetSchema).default([]),
  reason: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export const ConvertCboToolResponseSchema = z.discriminatedUnion('mode', [
  ConvertCboPreviewResultSchema,
  ConvertCboApplyResultSchema,
]);
export type ConvertCboToolResponse = z.infer<typeof ConvertCboToolResponseSchema>;

/** Create a portfolio and enroll it from an onboarding suggestion in one call — the
 *  agent-facing shape of the dashboard's discover→suggest→create→enroll flow. */
export const CreateFromSuggestionRequestSchema = z.object({
  brand_id: z.string().uuid(),
  ad_account_id: z.string().min(1),
  suggestion: PortfolioSuggestionSchema,
});
export type CreateFromSuggestionRequest = z.infer<typeof CreateFromSuggestionRequestSchema>;

/** Whitelisted portfolio update — reuses the FE settings patch. */
export const UpdatePortfolioRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  patch: UpdatePortfolioPatchSchema,
});
export type UpdatePortfolioRequest = z.infer<typeof UpdatePortfolioRequestSchema>;

/** Archive a portfolio (soft — stops future cycles, keeps history). */
export const ArchivePortfolioRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
});
export type ArchivePortfolioRequest = z.infer<typeof ArchivePortfolioRequestSchema>;

/** Remove ad sets from a portfolio. */
export const UnenrollAdsetsRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  adset_ids: z.array(z.string()).min(1),
});
export type UnenrollAdsetsRequest = z.infer<typeof UnenrollAdsetsRequestSchema>;

/** optimizer_manage input — a discriminated union keyed on `action`, each arm
 *  reusing the canonical service request schema for its payload. */
export const OptimizerManageInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_portfolio'),
    payload: CreatePortfolioRequestSchema,
  }),
  z.object({
    action: z.literal('create_from_suggestion'),
    payload: CreateFromSuggestionRequestSchema,
  }),
  z.object({
    action: z.literal('enroll_adsets'),
    payload: EnrollRequestSchema,
  }),
  z.object({
    action: z.literal('convert_cbo'),
    payload: ConvertCboToolRequestSchema,
  }),
  z.object({
    action: z.literal('set_recommendation_status'),
    payload: SetRecommendationStatusRequestSchema,
  }),
  z.object({
    action: z.literal('set_recommendation_statuses'),
    payload: SetRecommendationStatusesRequestSchema,
  }),
  z.object({
    action: z.literal('set_renewal_task_status'),
    payload: SetRenewalTaskStatusRequestSchema,
  }),
  z.object({
    action: z.literal('update_portfolio'),
    payload: UpdatePortfolioRequestSchema,
  }),
  z.object({
    action: z.literal('archive_portfolio'),
    payload: ArchivePortfolioRequestSchema,
  }),
  z.object({
    action: z.literal('unenroll_adsets'),
    payload: UnenrollAdsetsRequestSchema,
  }),
  z.object({
    action: z.literal('run_now'),
    payload: RunCycleRequestSchema,
  }),
]);
export type OptimizerManageInput = z.infer<typeof OptimizerManageInputSchema>;

/** Result of setting a recommendation's status. The RPC returns void, so the tool echoes
 *  the id + new status (approving a fatigue rec also opens a renewal task — read it with
 *  optimizer_query action='renewal_tasks'). */
export const SetRecommendationStatusResponseSchema = z.object({
  recommendation_id: z.string().uuid(),
  status: RecommendationStatusSchema,
});
export type SetRecommendationStatusResponse = z.infer<typeof SetRecommendationStatusResponseSchema>;

/** Result of a bulk approve/reject — how many rows changed. */
export const SetRecommendationStatusesResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
  status: RecommendationStatusSchema,
});
export type SetRecommendationStatusesResponse = z.infer<
  typeof SetRecommendationStatusesResponseSchema
>;

/** Result of closing a renewal work item. */
export const SetRenewalTaskStatusResponseSchema = z.object({
  task_id: z.string().uuid(),
  status: RenewalTaskStatusSchema,
});
export type SetRenewalTaskStatusResponse = z.infer<typeof SetRenewalTaskStatusResponseSchema>;

/** Result of create_from_suggestion — the new portfolio id + how many entities enrolled. */
export const CreateFromSuggestionResponseSchema = z.object({
  portfolio_id: z.string().uuid(),
  enrolled: z.number().int().nonnegative(),
});
export type CreateFromSuggestionResponse = z.infer<typeof CreateFromSuggestionResponseSchema>;

/** Result of archive_portfolio. */
export const ArchivePortfolioResponseSchema = z.object({
  portfolio_id: z.string().uuid(),
});
export type ArchivePortfolioResponse = z.infer<typeof ArchivePortfolioResponseSchema>;

/** Result of unenroll_adsets. */
export const UnenrollAdsetsResponseSchema = z.object({
  unenrolled: z.number().int().nonnegative(),
});
export type UnenrollAdsetsResponse = z.infer<typeof UnenrollAdsetsResponseSchema>;

/** optimizer_manage output — a discriminated union keyed on `action`, each arm
 *  carrying the matching service response. */
export const OptimizerManageOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_portfolio'),
    result: CreatePortfolioResponseSchema,
  }),
  z.object({
    action: z.literal('create_from_suggestion'),
    result: CreateFromSuggestionResponseSchema,
  }),
  z.object({
    action: z.literal('enroll_adsets'),
    result: EnrollResponseSchema,
  }),
  z.object({
    action: z.literal('convert_cbo'),
    result: ConvertCboToolResponseSchema,
  }),
  z.object({
    action: z.literal('set_recommendation_status'),
    result: SetRecommendationStatusResponseSchema,
  }),
  z.object({
    action: z.literal('set_recommendation_statuses'),
    result: SetRecommendationStatusesResponseSchema,
  }),
  z.object({
    action: z.literal('set_renewal_task_status'),
    result: SetRenewalTaskStatusResponseSchema,
  }),
  z.object({
    action: z.literal('update_portfolio'),
    result: UpdatePortfolioResponseSchema,
  }),
  z.object({
    action: z.literal('archive_portfolio'),
    result: ArchivePortfolioResponseSchema,
  }),
  z.object({
    action: z.literal('unenroll_adsets'),
    result: UnenrollAdsetsResponseSchema,
  }),
  z.object({
    action: z.literal('run_now'),
    result: RunCycleResponseSchema,
  }),
]);
export type OptimizerManageOutput = z.infer<typeof OptimizerManageOutputSchema>;
