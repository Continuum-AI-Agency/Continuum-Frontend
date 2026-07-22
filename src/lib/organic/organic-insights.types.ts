// Canonical organic AI-insight schemas live in @continuum/contracts. Re-exported
// here under the existing PascalCase names so current import sites keep working.
import {
  organicComputedInsightSchema,
  organicInsightCategorySchema,
  organicInsightsResponseSchema,
} from '@continuum/contracts';

export const OrganicInsightCategorySchema = organicInsightCategorySchema;
export const OrganicComputedInsightSchema = organicComputedInsightSchema;
export const OrganicInsightsResponseSchema = organicInsightsResponseSchema;

export type {
  OrganicComputedInsight,
  OrganicInsightCategory,
  OrganicInsightsResponse,
} from '@continuum/contracts';
