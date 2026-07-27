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
 *  Approving a fatigue recommendation opens a renewal task server-side.
 *
 *  NO preview/confirm ceremony, deliberately (plan 054 Optimizer item 3): the
 *  PENDING RECOMMENDATION ROW *is* the durable preview — it is readable through
 *  `optimizer_query action='pending_recs'` / `'insight'` and survives restarts —
 *  and approval is itself the human confirmation act. Wrapping a human approval
 *  in a second machine-minted confirmation would add a round trip and prove
 *  nothing new.
 *
 *  What it carries instead:
 *   - `portfolio_id`: the row's home. Required so the tool can READ the row back
 *     (via the portfolio's performance report) before writing — that read is what
 *     makes the precondition and the receipt possible at all.
 *   - `expected_status`: the state the caller believes the row is in. The write is
 *     refused with a stale-state conflict when the row has already moved, so an
 *     agent acting on a minutes-old `pending_recs` read cannot silently re-decide
 *     something a human just decided in the dashboard. An exact replay — the row
 *     already carries the requested status — returns the same receipt, no error. */
/** How an approved CREATIVE recommendation is fulfilled: `task` opens a request a
 *  human makes, `generate` enqueues a headless job. Absent = follow the portfolio's
 *  autogen config server-side. Ignored for non-creative kinds. */
export const RecommendationRouteSchema = z.enum(['task', 'generate']);
export type RecommendationRoute = z.infer<typeof RecommendationRouteSchema>;

export const SetRecommendationStatusRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  recommendation_id: z.string().uuid(),
  status: RecommendationStatusSchema,
  expected_status: RecommendationStatusSchema.default('pending'),
  route: RecommendationRouteSchema.optional(),
});
export type SetRecommendationStatusRequest = z.infer<typeof SetRecommendationStatusRequestSchema>;

/** Approve / reject MANY recommendations in one call. Same portfolio, same target
 *  status, same stale-state precondition — applied PER ID, so one bad id skips
 *  instead of aborting the batch. */
export const SetRecommendationStatusesRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  recommendation_ids: z.array(z.string().uuid()).min(1).max(100),
  status: RecommendationStatusSchema,
  expected_status: RecommendationStatusSchema.default('pending'),
});
export type SetRecommendationStatusesRequest = z.infer<
  typeof SetRecommendationStatusesRequestSchema
>;

/** Close out a renewal work item (creative_refresh / audience_expand). Carries the
 *  same stale-state precondition as `set_recommendation_status`, for symmetry: a
 *  task another operator already closed is a conflict, not a silent re-close. */
export const SetRenewalTaskStatusRequestSchema = z.object({
  brand_id: z.string().uuid(),
  task_id: z.string().uuid(),
  status: RenewalTaskStatusSchema,
  expected_status: RenewalTaskStatusSchema.default('open'),
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

/** Whitelisted portfolio update — reuses the FE settings patch.
 *
 *  PAUSE FENCE NOTE (plan 054 Optimizer item 1): `UpdatePortfolioPatchSchema`
 *  admits no pause-equivalent AD field. Its `status` is the PORTFOLIO's lifecycle
 *  (active | paused | archived) and `optimizer_update_portfolio` writes only
 *  `optimizer.portfolios` columns — pausing a portfolio stops optimization cycles
 *  and never touches Meta ad delivery. Ad pause stays HUMAN-ONLY and is exposed
 *  nowhere on the MCP surface. The one escalation the patch DOES admit is
 *  `apply_mode:'autopilot'` (arming autonomous budget writes); the MCP tool
 *  refuses that value — arming autonomy is a dashboard act. */
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

/** The ONLY run_now shape the MCP surface accepts.
 *
 *  `RunCycleRequestSchema` (service.ts) is a union whose second arm runs an ad-hoc
 *  cycle from a bare list of ad-set ids. The `optimizer-run` EDGE — the single path
 *  `optimizerClient.run` takes — parses only `{ portfolio_id }` and 400s on that arm,
 *  so advertising it here would be an action the agent can select and never complete.
 *  Narrowed rather than left as a dead branch. The service and cron keep the full
 *  union; this is the agent-facing subset. */
export const RunCycleMcpRequestSchema = z.object({
  portfolio_id: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  accountId: z.string().optional(),
});
export type RunCycleMcpRequest = z.infer<typeof RunCycleMcpRequestSchema>;

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
    payload: RunCycleMcpRequestSchema,
  }),
]);
export type OptimizerManageInput = z.infer<typeof OptimizerManageInputSchema>;

/** What the RPC layer can say on its own: the id and the status it was asked to set
 *  (`optimizer_set_recommendation_status` returns void). This is the CLIENT return
 *  type — the agent-facing umbrella returns the richer receipt below, which needs a
 *  read the client does not do. */
export const SetRecommendationStatusResponseSchema = z.object({
  recommendation_id: z.string().uuid(),
  status: RecommendationStatusSchema,
});
export type SetRecommendationStatusResponse = z.infer<typeof SetRecommendationStatusResponseSchema>;

/** Bulk RPC echo — the changed-row count `optimizer_set_recommendation_statuses`
 *  returns. Retained for the non-MCP callers that still drive that RPC directly;
 *  the MCP umbrella returns the itemized receipt below instead. */
export const SetRecommendationStatusesResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
  status: RecommendationStatusSchema,
});
export type SetRecommendationStatusesResponse = z.infer<
  typeof SetRecommendationStatusesResponseSchema
>;

/** Renewal-task RPC echo. */
export const SetRenewalTaskStatusResponseSchema = z.object({
  task_id: z.string().uuid(),
  status: RenewalTaskStatusSchema,
});
export type SetRenewalTaskStatusResponse = z.infer<typeof SetRenewalTaskStatusResponseSchema>;

/** A real approval RECEIPT, not an echo of the request (plan 054 Optimizer item 3).
 *  The umbrella used to return exactly what the caller sent, which proves nothing:
 *  it could not distinguish "approved" from "was already approved", named no ad set,
 *  named no actor, and hid the renewal task the approval opened. */
export const SetRecommendationStatusReceiptSchema = z.object({
  recommendation_id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
  /** The ad set this recommendation is about (and the ad, on creative-level kinds). */
  adset_ids: z.array(z.string()),
  ad_id: z.string().nullable().optional(),
  kind: z.string(),
  before_status: RecommendationStatusSchema,
  status: RecommendationStatusSchema,
  /** MCP caller identity. NOTE: the RPC stamps `decided_by` from auth.uid(), which is
   *  null under the service-role client — this field is the honest attribution. */
  actor: z.string(),
  decided_at: z.string(),
  /** The renewal work item approval opened, when the kind opens one. */
  opened_renewal_task_id: z.string().uuid().nullable(),
  /** true when the row was already in the requested status — replay, not a re-write. */
  replayed: z.boolean(),
});
export type SetRecommendationStatusReceipt = z.infer<typeof SetRecommendationStatusReceiptSchema>;

/** Result of a bulk approve/reject — ITEMIZED, never a bare count.
 *
 *  `{updated: n}` hid partial failure twice over: the caller could not tell WHICH
 *  ids landed, and the underlying RPC loops `optimizer_set_recommendation_status`
 *  in one transaction, so a single unknown id aborted the whole batch while the
 *  count implied a clean partial. Every id now reports its own outcome. */
export const SetRecommendationStatusesReceiptSchema = z.object({
  applied: z.array(z.string().uuid()),
  skipped: z.array(
    z.object({
      id: z.string(),
      reason: z.string(),
    }),
  ),
  status: RecommendationStatusSchema,
});
export type SetRecommendationStatusesReceipt = z.infer<
  typeof SetRecommendationStatusesReceiptSchema
>;

/** Receipt for closing a renewal work item. */
export const SetRenewalTaskStatusReceiptSchema = z.object({
  task_id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
  adset_id: z.string(),
  before_status: z.string(),
  status: RenewalTaskStatusSchema,
  actor: z.string(),
  decided_at: z.string(),
  replayed: z.boolean(),
});
export type SetRenewalTaskStatusReceipt = z.infer<typeof SetRenewalTaskStatusReceiptSchema>;

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
    result: SetRecommendationStatusReceiptSchema,
  }),
  z.object({
    action: z.literal('set_recommendation_statuses'),
    result: SetRecommendationStatusesReceiptSchema,
  }),
  z.object({
    action: z.literal('set_renewal_task_status'),
    result: SetRenewalTaskStatusReceiptSchema,
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
