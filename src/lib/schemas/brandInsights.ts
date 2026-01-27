import { z } from "zod";

// Accept either ISO-8601 or Postgres-style timestamps and normalize to an ISO-like string.
function tolerantTimestampSchema(message: string) {
  return z
    .string()
    .transform((value, ctx) => {
      const withT = value.includes("T") ? value : value.replace(" ", "T");

      // Ensure timezone separator has a colon (e.g., +00 -> +00:00).
      const normalized = withT.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");

      const parsed = new Date(normalized);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        return z.NEVER;
      }
      return normalized;
    });
}

export const brandInsightsTrendSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  relevanceToBrand: z.string().optional(),
  source: z.string().optional(),
  isSelected: z.boolean().default(false),
  timesUsed: z.number().int().nonnegative().default(0),
});

export const brandInsightsEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().optional(),
  description: z.string().optional(),
  opportunity: z.string().optional(),
  isSelected: z.boolean().default(false),
  timesUsed: z.number().int().nonnegative().default(0),
});

export const brandInsightsQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  socialPlatform: z.string().optional(),
  contentTypeSuggestion: z.string().optional(),
  whyRelevant: z.string().optional(),
  isSelected: z.boolean().default(false),
  timesUsed: z.number().int().nonnegative().default(0),
});

export const brandInsightsNicheQuestionsSchema = z.union([
  z.object({
    questions: z.array(brandInsightsQuestionSchema).default([]),
    totalGenerated: z.number().int().nonnegative().optional(),
  }),
  // Handle cases where the backend might return a string (error/empty marker)
  z.string().transform(() => ({ questions: [], totalGenerated: 0 })),
]);

export const brandInsightsQuestionsByNicheSchema = z.object({
  status: z.string().optional(),
  questionsByNiche: z.record(z.string(), brandInsightsNicheQuestionsSchema).default({}),
  summary: z
    .object({
      totalNiches: z.number().int().nonnegative().optional(),
      totalQuestions: z.number().int().nonnegative().optional(),
      averagePerNiche: z.number().optional(),
    })
    .optional(),
  generatedAt: tolerantTimestampSchema("generatedAt must be an ISO timestamp").optional(),
});

export const brandInsightsTrendsAndEventsSchema = z.object({
  status: z.string().optional(),
  trends: z.array(brandInsightsTrendSchema).default([]),
  events: z.array(brandInsightsEventSchema).default([]),
  country: z.string().optional(),
  weekAnalyzed: z.string().optional(),
  generatedAt: tolerantTimestampSchema("generatedAt must be an ISO timestamp").optional(),
});

export const brandInsightsDataSchema = z.object({
  generationId: z.string(),
  trendsAndEvents: brandInsightsTrendsAndEventsSchema,
  questionsByNiche: brandInsightsQuestionsByNicheSchema,
  country: z.string().optional(),
  weekStartDate: z.string(),
  fromCache: z.boolean().default(false),
  selectedSocialPlatforms: z.array(z.string()).optional(),
});

export const brandInsightsSchema = z.object({
  status: z.string(),
  generatedAt: tolerantTimestampSchema("generatedAt must be an ISO timestamp").optional(),
  data: brandInsightsDataSchema,
});

export const brandInsightsCountsSchema = z.object({
  trends: z.number().int().nonnegative().optional(),
  events: z.number().int().nonnegative().optional(),
  questions: z.number().int().nonnegative().optional(),
});

export const brandInsightsGenerationQueuedSchema = z.object({
  status: z.literal("processing"),
  taskId: z.string(),
  brandId: z.string().optional(),
});

export const brandInsightsGenerationCachedSchema = z.object({
  status: z.literal("success"),
  fromCache: z.boolean().default(false),
  brandId: z.string().optional(),
  generationId: z.string().optional(),
  counts: brandInsightsCountsSchema.optional(),
});

export const brandInsightsGenerationResponseSchema = z.discriminatedUnion("status", [
  brandInsightsGenerationQueuedSchema,
  brandInsightsGenerationCachedSchema,
]);

export const brandInsightsTaskStatusSchema = z.enum(["pending", "running", "completed", "error", "not_found"]);

export const brandInsightsStatusResponseSchema = z.object({
  status: brandInsightsTaskStatusSchema,
  taskId: z.string().optional(),
  brandId: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const brandInsightsAudienceSegmentSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const brandInsightsAudienceSchema = z.object({
  summary: z.string().optional(),
  painsAndFears: z.array(z.string()).optional(),
  motivationsAndTriggers: z.array(z.string()).optional(),
  segments: z.array(brandInsightsAudienceSegmentSchema).optional(),
});

export const brandInsightsCompetitorSchema = z.object({
  name: z.string(),
  strategy: z.string().optional(),
  messaging: z.string().optional(),
  urls: z.array(z.string()).optional(),
});

export const brandInsightsBrandVoiceSchema = z.object({
  tone: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  emojiUsage: z.string().optional(),
  keyMessaging: z.array(z.string()).optional(),
});

export const brandInsightsProfileSchema = z.object({
  status: z.enum(["success", "onboarding_required"]),
  brandId: z.string().optional(),
  brandSummary: z.string().optional(),
  mission: z.string().optional(),
  vision: z.string().optional(),
  coreValues: z.array(z.string()).optional(),
  niches: z.array(z.string()).optional(),
  audience: brandInsightsAudienceSchema.optional(),
  competitors: z.array(brandInsightsCompetitorSchema).optional(),
  brandVoice: brandInsightsBrandVoiceSchema.optional(),
});

export const brandInsightsGenerateInputSchema = z.object({
  brandId: z.string().min(1, "brandId is required"),
  forceRegenerate: z.boolean().optional(),
  selectedSocialPlatforms: z.array(z.string()).optional(),
});

export type BrandInsightsTrend = z.infer<typeof brandInsightsTrendSchema>;
export type BrandInsightsEvent = z.infer<typeof brandInsightsEventSchema>;
export type BrandInsightsQuestion = z.infer<typeof brandInsightsQuestionSchema>;
export type BrandInsightsQuestionsByNiche = z.infer<typeof brandInsightsQuestionsByNicheSchema>;
export type BrandInsightsTrendsAndEvents = z.infer<typeof brandInsightsTrendsAndEventsSchema>;
export type BrandInsightsData = z.infer<typeof brandInsightsDataSchema>;
export type BrandInsights = z.infer<typeof brandInsightsSchema>;
export type BrandInsightsCounts = z.infer<typeof brandInsightsCountsSchema>;
export type BrandInsightsGenerationResponse = z.infer<typeof brandInsightsGenerationResponseSchema>;
export type BrandInsightsTaskStatus = z.infer<typeof brandInsightsTaskStatusSchema>;
export type BrandInsightsStatusResponse = z.infer<typeof brandInsightsStatusResponseSchema>;
export type BrandInsightsAudience = z.infer<typeof brandInsightsAudienceSchema>;
export type BrandInsightsAudienceSegment = z.infer<typeof brandInsightsAudienceSegmentSchema>;
export type BrandInsightsCompetitor = z.infer<typeof brandInsightsCompetitorSchema>;
export type BrandInsightsBrandVoice = z.infer<typeof brandInsightsBrandVoiceSchema>;
export type BrandInsightsProfile = z.infer<typeof brandInsightsProfileSchema>;
export type BrandInsightsGenerateInput = z.infer<typeof brandInsightsGenerateInputSchema>;
