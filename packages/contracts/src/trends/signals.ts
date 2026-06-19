// Canonical brand "trend signal" shapes — the weekly trends, events, and
// audience questions surfaced on the dashboard (TrendSignalsTable) and the
// brand-insights panels. The data is real per-brand (brand_trends.* tables, read
// via the backend /api/trends/read) but previously had no shared contract: the
// Frontend hand-rolled these schemas while the edge function relied on column
// selects. This is the single source of truth both sides converge on.
//
// Field names are camelCase — the brand-insights domain shape the Frontend
// consumes after the backend maps the snake_case rows.

import { z } from "zod";

export const signalPlatformRecommendationSchema = z.object({
  platform: z.string(),
  reason: z.string(),
});
export type SignalPlatformRecommendation = z.infer<typeof signalPlatformRecommendationSchema>;

export const trendSignalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  relevanceToBrand: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  analysisTags: z.array(z.string()).optional(),
  sourceSignalCount: z.number().int().nonnegative().optional(),
  signalWindowStart: z.string().optional(),
  signalWindowEnd: z.string().optional(),
  recommendedPlatforms: z.array(z.string()).optional(),
  platformRecommendations: z.array(signalPlatformRecommendationSchema).optional(),
  isSelected: z.boolean().default(false),
  timesUsed: z.number().int().nonnegative().default(0),
});
export type TrendSignal = z.infer<typeof trendSignalSchema>;

export const eventSignalSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().optional(),
  description: z.string().optional(),
  opportunity: z.string().optional(),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  relevanceToBrand: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  analysisTags: z.array(z.string()).optional(),
  sourceSignalCount: z.number().int().nonnegative().optional(),
  signalWindowStart: z.string().optional(),
  signalWindowEnd: z.string().optional(),
  recommendedPlatforms: z.array(z.string()).optional(),
  platformRecommendations: z.array(signalPlatformRecommendationSchema).optional(),
  platforms: z.array(z.string()).optional(),
  isSelected: z.boolean().default(false),
  timesUsed: z.number().int().nonnegative().default(0),
});
export type EventSignal = z.infer<typeof eventSignalSchema>;

export const questionSignalSchema = z.object({
  id: z.string(),
  question: z.string(),
  socialPlatform: z.string().optional(),
  socialPlatforms: z.array(z.string()).optional(),
  contentTypeSuggestion: z.string().optional(),
  whyRelevant: z.string().optional(),
  niche: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  analysisTags: z.array(z.string()).optional(),
  sourceSignalCount: z.number().int().nonnegative().optional(),
  recommendedPlatforms: z.array(z.string()).optional(),
  platformRecommendations: z.array(signalPlatformRecommendationSchema).optional(),
  platformDistribution: z.record(z.string(), z.number()).optional(),
  isSelected: z.boolean().default(false),
  timesUsed: z.number().int().nonnegative().default(0),
});
export type QuestionSignal = z.infer<typeof questionSignalSchema>;
