// Canonical result shapes for the MCP analytics "diagnostics" tier — the async
// jobs behind analytics_cross_platform_spend / analytics_pacing_diagnostic /
// analytics_creative_insights. The Backend job handlers
// (App/jobs/handlers/{cross_platform_spend,pacing,creative_insights}.ts) are the
// producers; jobs_status is the consumer that validates a completed job's
// `result` against the matching schema here (drift detector). Field names are
// snake_case to match the wire payload. Objects are intentionally non-strict so
// additive handler changes don't trip the validator — required known fields are
// what we assert on.

import { z } from "zod";

import { parsedAdNameSchema } from "../paid/adNaming";
import { entityHierarchySchema, paidEntityLevelSchema } from "../paid/hierarchy";

// Paid platforms the diagnostics tier accepts on the wire. Only meta_ads is
// implemented end-to-end today; google_ads/tiktok_ads appear as `unsupported`
// rows (cross_platform_spend) and are rejected at the tool input boundary for
// the single-platform tools. Mirror of the Backend PlatformPaidEnum.
export const paidDiagnosticsPlatformSchema = z.enum(["meta_ads", "google_ads", "tiktok_ads"]);
export type PaidDiagnosticsPlatform = z.infer<typeof paidDiagnosticsPlatformSchema>;

// Shared cache/freshness envelope every diagnostics result carries. Matches
// App/mcp/shared/cacheMeta.ts ToolMeta (source ∪ {db} for the paid db-read path).
export const diagnosticsMetaSchema = z.object({
  source: z.enum(["live", "cache", "db", "miss"]),
  cached_at: z.string().nullable(),
  cache_age_seconds: z.number().int().nullable(),
  stale: z.boolean(),
  warnings: z.array(z.string()).optional(),
});
export type DiagnosticsMeta = z.infer<typeof diagnosticsMetaSchema>;

// Error envelope a handler returns on NOT_IMPLEMENTED / UPSTREAM_ERROR. The
// worker stores this as a COMPLETED job whose `result` is this shape (it only
// marks a job `failed` when the handler throws), so every diagnostics result is
// a union of the success payload and this error envelope.
export const jobErrorResultSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type JobErrorResult = z.infer<typeof jobErrorResultSchema>;

// ---- cross_platform_spend (App/jobs/handlers/cross_platform_spend.ts) ----

export const crossPlatformSpendRowSchema = z.object({
  date: z.string().nullable(),
  platform: paidDiagnosticsPlatformSchema,
  // "account" for account-wide rollups; "campaign" when broken down by campaign.
  level: paidEntityLevelSchema.optional(),
  hierarchy: entityHierarchySchema.optional(),
  path_label: z.string().optional(),
  spend: z.number(),
  currency: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  cpa: z.number().nullable(),
  roas: z.number().nullable(),
});
export type CrossPlatformSpendRow = z.infer<typeof crossPlatformSpendRowSchema>;

export const crossPlatformSpendTotalsSchema = z.object({
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
});
export type CrossPlatformSpendTotals = z.infer<typeof crossPlatformSpendTotalsSchema>;

export const crossPlatformSpendUnsupportedRowSchema = z.object({
  platform: paidDiagnosticsPlatformSchema,
  status: z.literal("not_implemented"),
  hint: z.string(),
});
export type CrossPlatformSpendUnsupportedRow = z.infer<
  typeof crossPlatformSpendUnsupportedRowSchema
>;

export const crossPlatformSpendDataSchema = z.object({
  rows: z.array(crossPlatformSpendRowSchema),
  totals: crossPlatformSpendTotalsSchema,
  unsupported: z.array(crossPlatformSpendUnsupportedRowSchema),
  truncated: z.boolean().optional(),
  total_rows: z.number().int().optional(),
});
export type CrossPlatformSpendData = z.infer<typeof crossPlatformSpendDataSchema>;

export const crossPlatformSpendSuccessSchema = z.object({
  data: crossPlatformSpendDataSchema,
  meta: diagnosticsMetaSchema,
});
export const crossPlatformSpendResultSchema = z.union([
  crossPlatformSpendSuccessSchema,
  jobErrorResultSchema,
]);
export type CrossPlatformSpendResult = z.infer<typeof crossPlatformSpendResultSchema>;

// ---- pacing_diagnostic (App/jobs/handlers/pacing.ts) ----

export const campaignPaceRowSchema = z.object({
  campaign_id: z.string(),
  name: z.string().nullable(),
  // Always "campaign" — pacing is a campaign-level diagnostic.
  level: paidEntityLevelSchema.optional(),
  hierarchy: entityHierarchySchema.optional(),
  path_label: z.string().optional(),
  budget_type: z.enum(["daily", "lifetime", "unknown"]),
  budget: z.number(),
  spent: z.number(),
  days_elapsed: z.number(),
  days_total: z.number(),
  pace_ratio: z.number().nullable(),
  frequency: z.number().nullable(),
  anomalies: z.array(z.string()),
  health_score: z.number(),
});
export type CampaignPaceRow = z.infer<typeof campaignPaceRowSchema>;

export const pacingDataSchema = z.object({
  campaigns: z.array(campaignPaceRowSchema),
  truncated: z.boolean().optional(),
  total_campaigns: z.number().int().optional(),
});
export type PacingData = z.infer<typeof pacingDataSchema>;

export const pacingSuccessSchema = z.object({
  data: pacingDataSchema,
  meta: diagnosticsMetaSchema,
});
export const pacingResultSchema = z.union([pacingSuccessSchema, jobErrorResultSchema]);
export type PacingResult = z.infer<typeof pacingResultSchema>;

// ---- creative_insights (App/jobs/handlers/creative_insights.ts) ----

export const creativeInsightRowSchema = z.object({
  ad_id: z.string(),
  ad_name: z.string().nullable(),
  campaign_id: z.string().nullable(),
  // Always "ad" — creative insights are ad-level.
  level: paidEntityLevelSchema.optional(),
  hierarchy: entityHierarchySchema.optional(),
  path_label: z.string().optional(),
  parsed_name: parsedAdNameSchema.nullable().optional(),
  impressions: z.number(),
  spend: z.number(),
  three_second_views: z.number(),
  video_p25: z.number(),
  video_p50: z.number(),
  hook_rate: z.number().nullable(),
  hold_rate: z.number().nullable(),
});
export type CreativeInsightRow = z.infer<typeof creativeInsightRowSchema>;

export const creativeInsightsDataSchema = z.object({
  creatives: z.array(creativeInsightRowSchema),
});
export type CreativeInsightsData = z.infer<typeof creativeInsightsDataSchema>;

export const creativeInsightsSuccessSchema = z.object({
  data: creativeInsightsDataSchema,
  meta: diagnosticsMetaSchema,
});
export const creativeInsightsResultSchema = z.union([
  creativeInsightsSuccessSchema,
  jobErrorResultSchema,
]);
export type CreativeInsightsResult = z.infer<typeof creativeInsightsResultSchema>;

// ---- registry: tool/job name → result schema ----

// Keyed by the tool name used as the job `tool` (the enqueue discriminator).
// jobs_status consults this to validate a completed result for these job types.
export const DIAGNOSTICS_RESULT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  analytics_cross_platform_spend: crossPlatformSpendResultSchema,
  analytics_pacing_diagnostic: pacingResultSchema,
  analytics_creative_insights: creativeInsightsResultSchema,
};
