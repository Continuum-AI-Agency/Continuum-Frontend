// Canonical paid-media ranked-entity shape shared by the paid-media-metrics edge
// function ranking scopes (top_campaigns / top_adsets / top_ads — producer) and
// the Frontend leaderboards (consumer). Field names stay snake_case where the
// wire payload is snake_case (kpi_value / kpi_unit). The edge RankedEntity in
// supabase/functions/paid-media-metrics/{meta,google}/compute.ts mirrors this —
// do not rename without changing both compute modules.

import { z } from "zod";

import { parsedAdNameSchema } from "./adNaming";
import { entityHierarchySchema, paidEntityLevelSchema } from "./hierarchy";

export const paidEntityKpiSchema = z.enum([
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "conversions",
  "conversions_value",
  "cost_per_conversion",
  "roas",
]);
export type PaidEntityKpi = z.infer<typeof paidEntityKpiSchema>;

export const paidEntityKpiUnitSchema = z.enum(["currency", "number", "percent", "multiplier"]);
export type PaidEntityKpiUnit = z.infer<typeof paidEntityKpiUnitSchema>;

export const paidRankingScopeSchema = z.enum(["top_campaigns", "top_adsets", "top_ads"]);
export type PaidRankingScope = z.infer<typeof paidRankingScopeSchema>;

export const paidRankingDirectionSchema = z.enum(["top", "bottom"]);
export type PaidRankingDirection = z.infer<typeof paidRankingDirectionSchema>;

// Known numeric metrics the edge emits; lenient (optional keys + numeric
// catchall) so Meta/Google divergence and future metrics still validate.
// Consumers read the ranked KPI via kpi_value / kpi_unit and only dip into
// specific keys (spend, roas).
export const paidEntityMetricsSchema = z
  .object({
    spend: z.number().optional(),
    impressions: z.number().optional(),
    clicks: z.number().optional(),
    conversions: z.number().optional(),
    conversionValue: z.number().optional(),
    roas: z.number().optional(),
    cpa: z.number().optional(),
    costPerConversion: z.number().optional(),
    ctr: z.number().optional(),
    cpc: z.number().optional(),
    cpm: z.number().optional(),
  })
  .catchall(z.number());
export type PaidEntityMetrics = z.infer<typeof paidEntityMetricsSchema>;

export const paidRankedEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  // Explicit aggregation level of this row (campaign | adset | ad). Consumers
  // no longer infer it from the parent `scope`.
  level: paidEntityLevelSchema.optional(),
  // Full identity chain: id + name of every level at or above this row.
  hierarchy: entityHierarchySchema.optional(),
  // Composite "Campaign › Ad set › Ad" label built from the hierarchy names.
  path_label: z.string().optional(),
  // Structured decomposition of the ad name when the brand has a naming schema.
  parsed_name: parsedAdNameSchema.optional(),
  // adset rows carry { campaign }; ad rows carry { campaign, adset }. Retained
  // for back-compat alongside the structured `hierarchy`.
  labels: z.record(z.string(), z.string()).optional(),
  metrics: paidEntityMetricsSchema,
  rank: z.number(),
  kpi: paidEntityKpiSchema,
  kpi_value: z.number(),
  kpi_unit: paidEntityKpiUnitSchema,
});
export type PaidRankedEntity = z.infer<typeof paidRankedEntitySchema>;

export const paidRankingResponseSchema = z.object({
  scope: paidRankingScopeSchema.optional(),
  kpi: paidEntityKpiSchema.optional(),
  direction: paidRankingDirectionSchema.optional(),
  limit: z.number().optional(),
  rows: z.array(paidRankedEntitySchema),
  total_rows_considered: z.number().optional(),
  range: z
    .object({
      preset: z.string().optional(),
      since: z.string().optional(),
      until: z.string().optional(),
    })
    .optional(),
});
export type PaidRankingResponse = z.infer<typeof paidRankingResponseSchema>;
