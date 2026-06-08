// Creative-sentiment analysis for competitor paid ads. Produced Backend-side by
// a Vertex Gemini `generateObject` call over the ad copy + (when available) the
// extracted creative image, and persisted to competitor_ad_spy.ad_snapshots.analysis.
// Parallel to — not a mutation of — the media library's adCreativeAnalysisSchema
// (media/asset.ts): the media library indexes the brand's OWN creatives; this
// indexes competitors', and adds the sentiment/hook/theme fields that schema lacks.
// Plain objects (not .strict()) so an LLM adding an extra key does not fail parse.

import { z } from "zod";

export const competitorAdSentimentLabelSchema = z.enum([
  "positive",
  "neutral",
  "negative",
  "aspirational",
  "urgent",
]);
export type CompetitorAdSentimentLabel = z.infer<typeof competitorAdSentimentLabelSchema>;

export const competitorAdHookArchetypeSchema = z.enum([
  "problem_agitation",
  "social_proof",
  "scarcity",
  "curiosity_gap",
  "authority",
  "transformation",
  "value_stack",
  "comparison",
  "unknown",
]);
export type CompetitorAdHookArchetype = z.infer<typeof competitorAdHookArchetypeSchema>;

export const competitorAdSentimentSchema = z.object({
  sentiment: competitorAdSentimentLabelSchema,
  sentimentScore: z.number().min(-1).max(1),
  hook: z.string().nullable(),
  hookArchetype: competitorAdHookArchetypeSchema.nullable(),
  primaryTheme: z.string().nullable(),
  themes: z.array(z.string()).max(8).default([]),
  brandElements: z.array(z.string()).default([]),
  valueProps: z.array(z.string()).default([]),
  copyTone: z.array(z.string()).max(6).default([]),
  visualStyle: z.string().nullable(),
  targetAudienceSignal: z.string().nullable(),
});
export type CompetitorAdSentiment = z.infer<typeof competitorAdSentimentSchema>;

export const competitorAdAnalysisSchema = competitorAdSentimentSchema.extend({
  isAd: z.boolean().default(true),
  format: z.string().nullable(),
  headline: z.string().nullable(),
  primaryText: z.string().nullable(),
  callToAction: z.string().nullable(),
  textOverlay: z.string().nullable(),
  // Whether the analysis saw the actual creative image (true) or degraded to
  // copy-only because media extraction failed/was skipped (false).
  analyzedFromImage: z.boolean().default(false),
});
export type CompetitorAdAnalysis = z.infer<typeof competitorAdAnalysisSchema>;
