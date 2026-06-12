// Canonical organic AI-insight schemas live in @continuum/contracts. Re-exported
// here under the existing PascalCase names so current import sites keep working.
import {
  organicInsightCategorySchema,
  organicComputedInsightSchema,
  organicInsightsResponseSchema,
} from "@continuum/contracts";

export const OrganicInsightCategorySchema = organicInsightCategorySchema;
export const OrganicComputedInsightSchema = organicComputedInsightSchema;
export const OrganicInsightsResponseSchema = organicInsightsResponseSchema;

export type {
  OrganicInsightCategory,
  OrganicComputedInsight,
  OrganicInsightsResponse,
} from "@continuum/contracts";
