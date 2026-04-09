import { z } from "zod";

export const OrganicInsightCategorySchema = z.enum([
  "growth",
  "content",
  "engagement",
  "audience",
]);

export type OrganicInsightCategory = z.infer<typeof OrganicInsightCategorySchema>;

export const OrganicComputedInsightSchema = z.object({
  category: OrganicInsightCategorySchema,
  text: z.string(),
  severity: z.enum(["positive", "negative", "neutral"]),
  source: z.enum(["computed", "llm"]),
  metric: z.string().optional(),
  value: z.number().optional(),
  delta: z.number().optional(),
  recommendation: z.string().optional(),
  estimated_impact: z.string().optional(),
});

export type OrganicComputedInsight = z.infer<typeof OrganicComputedInsightSchema>;

export const OrganicInsightsResponseSchema = z.object({
  insights: z.array(OrganicComputedInsightSchema),
  generated_at: z.string(),
  expires_at: z.string().optional(),
  range: z.object({
    preset: z.string(),
    since: z.string().optional(),
    until: z.string().optional(),
  }),
});

export type OrganicInsightsResponse = z.infer<typeof OrganicInsightsResponseSchema>;
