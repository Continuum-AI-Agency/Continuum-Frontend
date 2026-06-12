// Canonical organic AI-insight types shared by the get-organic-insights edge
// function (producer) and the Frontend OrganicInsightsPanel (consumer). Field
// names stay snake_case to match the wire payload the edge already emits — this
// is the boundary contract; do not rename without changing the edge function.

import { z } from "zod";
import { organicAwarenessReportPayloadSchema } from "./awareness";

export const organicInsightCategorySchema = z.enum([
  "growth",
  "content",
  "engagement",
  "audience",
]);
export type OrganicInsightCategory = z.infer<typeof organicInsightCategorySchema>;

export const organicInsightSeveritySchema = z.enum(["positive", "negative", "neutral"]);
export type OrganicInsightSeverity = z.infer<typeof organicInsightSeveritySchema>;

export const organicInsightSourceSchema = z.enum(["computed", "llm"]);
export type OrganicInsightSource = z.infer<typeof organicInsightSourceSchema>;

export const organicComputedInsightSchema = z.object({
  category: organicInsightCategorySchema,
  text: z.string(),
  severity: organicInsightSeveritySchema,
  source: organicInsightSourceSchema,
  metric: z.string().optional(),
  value: z.number().optional(),
  delta: z.number().optional(),
  recommendation: z.string().optional(),
  estimated_impact: z.string().optional(),
  // Per-post linkage: set when the insight is about a specific media object so
  // the UI can render it inline on that post's snapshot panel.
  post_id: z.string().optional(),
});
export type OrganicComputedInsight = z.infer<typeof organicComputedInsightSchema>;

export const organicInsightsResponseSchema = z.object({
  insights: z.array(organicComputedInsightSchema),
  generated_at: z.string(),
  expires_at: z.string().optional(),
  range: z.object({
    preset: z.string(),
    since: z.string().optional(),
    until: z.string().optional(),
  }),
  // The get-organic-insights edge function includes the assembled AI-Awareness
  // report alongside the inline insights (one round-trip). Optional so older
  // cached responses without it still validate.
  awareness: organicAwarenessReportPayloadSchema.optional(),
});
export type OrganicInsightsResponse = z.infer<typeof organicInsightsResponseSchema>;
