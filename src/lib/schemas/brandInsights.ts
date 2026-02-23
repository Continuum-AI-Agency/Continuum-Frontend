import { z } from "zod";

export const BRAND_TRENDS_SCHEMA = "brand_trends" as const;

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

export const brandInsightsPlatformSchema = z.enum([
  "instagram",
  "facebook",
  "x",
  "linkedin",
  "youtube",
  "tiktok",
  "reddit_basic",
]);

export const brandInsightsTrendSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  relevanceToBrand: z.string().optional(),
  platforms: z.array(z.string()).optional(),
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
  platforms: z.array(z.string()).optional(),
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

export const brandInsightsJobStreamSchema = z.object({
  transport: z.literal("sse"),
  channel: z.string().min(1),
  queueName: z.string().optional(),
  latestMessageId: z.number().int().nonnegative().nullable().optional(),
});

export const brandInsightsStrategicDependencySchema = z.object({
  required: z.boolean().optional(),
  status: z.string().optional(),
  runId: z.string().nullable().optional(),
});

export const brandInsightsGenerationQueuedSchema = z.object({
  status: z.literal("processing"),
  generationId: z.string().optional(),
  jobId: z.string().optional(),
  jobStatus: z.enum(["pending", "running", "completed", "failed"]).optional(),
  brandId: z.string().optional(),
  dependencyStrategicAnalysis: brandInsightsStrategicDependencySchema.optional(),
  stream: brandInsightsJobStreamSchema.optional(),
  fallbackPollUrl: z.string().optional(),
  message: z.string().optional(),
});

export const brandInsightsGenerationCachedSchema = z.object({
  status: z.literal("success"),
  fromCache: z.boolean().default(false),
  brandId: z.string().optional(),
  generationId: z.string().optional(),
  counts: brandInsightsCountsSchema.optional(),
  message: z.string().optional(),
});

export const brandInsightsGenerationResponseSchema = z.discriminatedUnion("status", [
  brandInsightsGenerationQueuedSchema,
  brandInsightsGenerationCachedSchema,
]);

export const brandInsightsTaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "error", "not_found"]);

export const brandInsightsJobStageSchema = z.string().optional();

export const brandInsightsWarningsSchema = z
  .object({
    scrapeFailures: z.array(z.unknown()).default([]),
    warningCount: z.number().int().nonnegative().optional(),
  })
  .optional();

export const brandInsightsCompetitorJobSchema = z
  .object({
    status: z.enum(["success", "skipped", "error"]).nullable().optional(),
    sourceRunId: z.string().nullable().optional(),
    competitorCount: z.number().int().nonnegative().optional(),
    totalIngested: z.number().int().nonnegative().optional(),
    reason: z.string().nullable().optional(),
  })
  .optional();

export const brandInsightsStatusResponseSchema = z.object({
  status: brandInsightsTaskStatusSchema,
  generationId: z.string().optional(),
  jobId: z.string().optional(),
  brandId: z.string().optional(),
  weekStartDate: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  stage: brandInsightsJobStageSchema,
  stageMessage: z.string().optional(),
  totals: brandInsightsCountsSchema.optional(),
  startedAt: tolerantTimestampSchema("startedAt must be an ISO timestamp").optional(),
  completedAt: tolerantTimestampSchema("completedAt must be an ISO timestamp").optional(),
  errorCode: z.string().optional(),
  errorDetail: z.string().optional(),
  warnings: brandInsightsWarningsSchema,
  competitor: brandInsightsCompetitorJobSchema,
  stream: brandInsightsJobStreamSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const brandInsightsStatusMessageSchema = z.object({
  messageId: z.number().int().nonnegative().optional(),
  stage: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  stageMessage: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  createdAt: tolerantTimestampSchema("createdAt must be an ISO timestamp").optional(),
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

const isoDateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "weekStartDate must be a YYYY-MM-DD date");

export const brandInsightsGenerationWindowSchema = z.object({
  weekStartDate: isoDateOnlySchema,
  windowStart: tolerantTimestampSchema("windowStart must be an ISO timestamp"),
  windowEnd: tolerantTimestampSchema("windowEnd must be an ISO timestamp"),
});

export const brandInsightsGenerateInputSchema = z.object({
  brandId: z.string().min(1, "brandId is required"),
  forceRegenerate: z.boolean().optional(),
  selectedSocialPlatforms: z.array(brandInsightsPlatformSchema).min(1).optional(),
  weekStartDate: z.string().optional(),
  windowStart: tolerantTimestampSchema("windowStart must be an ISO timestamp").optional(),
  windowEnd: tolerantTimestampSchema("windowEnd must be an ISO timestamp").optional(),
  maxItemsPerPlatform: z.number().int().positive().optional(),
});

export type BrandInsightsTrend = z.infer<typeof brandInsightsTrendSchema>;
export type BrandInsightsEvent = z.infer<typeof brandInsightsEventSchema>;
export type BrandInsightsQuestion = z.infer<typeof brandInsightsQuestionSchema>;
export type BrandInsightsQuestionsByNiche = z.infer<typeof brandInsightsQuestionsByNicheSchema>;
export type BrandInsightsTrendsAndEvents = z.infer<typeof brandInsightsTrendsAndEventsSchema>;
export type BrandInsightsData = z.infer<typeof brandInsightsDataSchema>;
export type BrandInsights = z.infer<typeof brandInsightsSchema>;
export type BrandInsightsPlatform = z.infer<typeof brandInsightsPlatformSchema>;
export type BrandInsightsCounts = z.infer<typeof brandInsightsCountsSchema>;
export type BrandInsightsJobStream = z.infer<typeof brandInsightsJobStreamSchema>;
export type BrandInsightsStrategicDependency = z.infer<typeof brandInsightsStrategicDependencySchema>;
export type BrandInsightsGenerationResponse = z.infer<typeof brandInsightsGenerationResponseSchema>;
export type BrandInsightsTaskStatus = z.infer<typeof brandInsightsTaskStatusSchema>;
export type BrandInsightsStatusResponse = z.infer<typeof brandInsightsStatusResponseSchema>;
export type BrandInsightsStatusMessage = z.infer<typeof brandInsightsStatusMessageSchema>;
export type BrandInsightsAudience = z.infer<typeof brandInsightsAudienceSchema>;
export type BrandInsightsAudienceSegment = z.infer<typeof brandInsightsAudienceSegmentSchema>;
export type BrandInsightsCompetitor = z.infer<typeof brandInsightsCompetitorSchema>;
export type BrandInsightsBrandVoice = z.infer<typeof brandInsightsBrandVoiceSchema>;
export type BrandInsightsProfile = z.infer<typeof brandInsightsProfileSchema>;
export type BrandInsightsGenerationWindow = z.infer<typeof brandInsightsGenerationWindowSchema>;
export type BrandInsightsGenerateInput = z.infer<typeof brandInsightsGenerateInputSchema>;
