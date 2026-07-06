// MCP umbrella IO contracts for the paid-media optimizer — the two capability
// umbrellas the Backend mounts on the MCP surface. `optimizer_query` is the
// read entry point (portfolios list, performance report, CPA series, angle
// matrix, pending recommendations); `optimizer_manage` is the write entry point
// (create a portfolio, enroll ad sets, set a recommendation's status, run a
// cycle now). Both dispatch on an `action` enum and reuse the canonical service
// request schemas so the MCP surface never drifts from the HTTP boundary.

import { z } from 'zod';
import {
  AngleMatrixCellSchema,
  CpaSeriesPointSchema,
  CreatePortfolioRequestSchema,
  CreatePortfolioResponseSchema,
  CycleRunReportSchema,
  EnrollRequestSchema,
  EnrollResponseSchema,
  PortfolioListItemSchema,
  RecommendationRowSchema,
  RecommendationStatusSchema,
  RunCycleRequestSchema,
  RunCycleResponseSchema,
} from './service';

// ── optimizer_query (read) ───────────────────────────────────────────────────

/** Read actions the umbrella dispatches on. */
export const OptimizerQueryActionSchema = z.enum([
  'portfolios', // list the brand's portfolios (Overview)
  'performance', // one portfolio's cycle-run report (performance tab)
  'cpa_series', // one portfolio's spend/conversions per cycle
  'angle_matrix', // one portfolio's audience × angle heat map
  'pending_recs', // one portfolio's pending recommendations
]);
export type OptimizerQueryAction = z.infer<typeof OptimizerQueryActionSchema>;

/** optimizer_query input. `portfolio_id` is required for every action except
 *  `portfolios` (which lists all of the brand's portfolios). */
export const OptimizerQueryInputSchema = z.object({
  action: OptimizerQueryActionSchema,
  brand_id: z.string().uuid(),
  portfolio_id: z.string().uuid().optional(),
});
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
]);
export type OptimizerQueryOutput = z.infer<typeof OptimizerQueryOutputSchema>;

// ── optimizer_manage (write) ─────────────────────────────────────────────────

/** Whitelisted write actions — each carries the matching service request. */
export const OptimizerManageActionSchema = z.enum([
  'create_portfolio',
  'enroll_adsets',
  'set_recommendation_status',
  'run_now',
]);
export type OptimizerManageAction = z.infer<typeof OptimizerManageActionSchema>;

/** Set a recommendation's status (approve / reject an engine recommendation). */
export const SetRecommendationStatusRequestSchema = z.object({
  recommendation_id: z.string().uuid(),
  status: RecommendationStatusSchema,
});
export type SetRecommendationStatusRequest = z.infer<typeof SetRecommendationStatusRequestSchema>;

/** optimizer_manage input — a discriminated union keyed on `action`, each arm
 *  reusing the canonical service request schema for its payload. */
export const OptimizerManageInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_portfolio'),
    payload: CreatePortfolioRequestSchema,
  }),
  z.object({
    action: z.literal('enroll_adsets'),
    payload: EnrollRequestSchema,
  }),
  z.object({
    action: z.literal('set_recommendation_status'),
    payload: SetRecommendationStatusRequestSchema,
  }),
  z.object({
    action: z.literal('run_now'),
    payload: RunCycleRequestSchema,
  }),
]);
export type OptimizerManageInput = z.infer<typeof OptimizerManageInputSchema>;

/** Result of setting a recommendation's status. */
export const SetRecommendationStatusResponseSchema = z.object({
  recommendation: RecommendationRowSchema,
});
export type SetRecommendationStatusResponse = z.infer<typeof SetRecommendationStatusResponseSchema>;

/** optimizer_manage output — a discriminated union keyed on `action`, each arm
 *  carrying the matching service response. */
export const OptimizerManageOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_portfolio'),
    result: CreatePortfolioResponseSchema,
  }),
  z.object({
    action: z.literal('enroll_adsets'),
    result: EnrollResponseSchema,
  }),
  z.object({
    action: z.literal('set_recommendation_status'),
    result: SetRecommendationStatusResponseSchema,
  }),
  z.object({
    action: z.literal('run_now'),
    result: RunCycleResponseSchema,
  }),
]);
export type OptimizerManageOutput = z.infer<typeof OptimizerManageOutputSchema>;
