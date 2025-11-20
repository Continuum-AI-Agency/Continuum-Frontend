import { z } from "zod";

import {
  brandInsightsAudienceSchema,
  brandInsightsAudienceSegmentSchema,
  brandInsightsBrandVoiceSchema,
  brandInsightsCompetitorSchema,
  brandInsightsDataSchema,
  brandInsightsGenerationResponseSchema,
  brandInsightsProfileSchema,
  brandInsightsQuestionSchema,
  brandInsightsQuestionsByNicheSchema,
  brandInsightsSchema,
  brandInsightsStatusResponseSchema,
  brandInsightsTaskStatusSchema,
  brandInsightsTrendSchema,
  brandInsightsEventSchema,
} from "@/lib/schemas/brandInsights";

const isoDateSchema = z.string().datetime({ message: "Expected ISO timestamp" });

const backendTrendSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  relevance_to_brand: z.string().nullish(),
  source: z.string().nullish(),
  is_selected: z.boolean().nullish(),
  times_used: z.number().int().nonnegative().nullish(),
});

const backendEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().nullish(),
  event_date: z.string().nullish(),
  description: z.string().nullish(),
  opportunity: z.string().nullish(),
  is_selected: z.boolean().nullish(),
  times_used: z.number().int().nonnegative().nullish(),
});

const backendQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  social_platform: z.string().nullish(),
  platform: z.string().nullish(),
  content_type_suggestion: z.string().nullish(),
  why_relevant: z.string().nullish(),
  is_selected: z.boolean().nullish(),
  times_used: z.number().int().nonnegative().nullish(),
});

const backendNicheQuestionsSchema = z.object({
  questions: z.array(backendQuestionSchema).default([]),
  total_generated: z.number().int().nonnegative().nullish(),
});

const backendQuestionsByNicheSchema = z.object({
  status: z.string().nullish(),
  questions_by_niche: z.record(backendNicheQuestionsSchema).default({}),
  summary: z
    .object({
      total_niches: z.number().int().nonnegative().nullish(),
      total_questions: z.number().int().nonnegative().nullish(),
      average_per_niche: z.number().nullish(),
    })
    .nullish(),
  generated_at: isoDateSchema.nullish(),
});

const backendTrendsAndEventsSchema = z.object({
  status: z.string().nullish(),
  trends: z.array(backendTrendSchema).default([]),
  events: z.array(backendEventSchema).default([]),
  country: z.string().nullish(),
  week_analyzed: z.string().nullish(),
  generated_at: isoDateSchema.nullish(),
});

const backendInsightsDataSchema = z.object({
  generation_id: z.string(),
  trends_and_events: backendTrendsAndEventsSchema,
  questions_by_niche: backendQuestionsByNicheSchema,
  country: z.string().nullish(),
  week_start_date: z.string(),
  from_cache: z.boolean().nullish(),
  selected_social_platforms: z.array(z.string()).nullish(),
});

const backendInsightsResponseSchema = z.object({
  status: z.string(),
  generated_at: isoDateSchema.nullish(),
  data: backendInsightsDataSchema,
});

const backendGenerationProcessingSchema = z.object({
  status: z.literal("processing"),
  data: z
    .object({
      task_id: z.string(),
      brand_id: z.string().nullish(),
      platform_account_id: z.string().nullish(),
    })
    .default({} as unknown as { task_id: string }),
});

const backendGenerationSuccessSchema = z.object({
  status: z.literal("success"),
  data: z
    .object({
      brand_id: z.string().nullish(),
      platform_account_id: z.string().nullish(),
      generation_id: z.string().nullish(),
      from_cache: z.boolean().nullish(),
      counts: z
        .object({
          trends: z.number().int().nonnegative().nullish(),
          events: z.number().int().nonnegative().nullish(),
          questions: z.number().int().nonnegative().nullish(),
        })
        .nullish(),
    })
    .default({}),
});

const backendGenerationResponseSchema = z.discriminatedUnion("status", [
  backendGenerationProcessingSchema,
  backendGenerationSuccessSchema,
]);

const backendStatusResponseSchema = z.object({
  status: z.string(),
  task_id: z.string().nullish(),
  brand_id: z.string().nullish(),
  platform_account_id: z.string().nullish(),
  error: z.string().nullish(),
  message: z.string().nullish(),
});

const backendAudienceSegmentSchema = z
  .object({
    name: z.string().nullish(),
    segment_name: z.string().nullish(),
    description: z.string().nullish(),
    summary: z.string().nullish(),
    details: z.string().nullish(),
  })
  .passthrough();

const backendAudienceSchema = z.object({
  summary: z.string().nullish(),
  ideal_customer_persona_summary: z.string().nullish(),
  pain_points: z.array(z.string()).nullish(),
  challenges: z.array(z.string()).nullish(),
  barriers: z.array(z.string()).nullish(),
  pains_and_fears: z.array(z.string()).nullish(),
  motivations_and_triggers: z.array(z.string()).nullish(),
  motivations: z.array(z.string()).nullish(),
  emotional_drivers: z.array(z.string()).nullish(),
  segments: z.array(backendAudienceSegmentSchema).nullish(),
});

const backendCompetitorSchema = z
  .object({
    name: z.string().nullish(),
    strategy: z.string().nullish(),
    messaging: z.string().nullish(),
    urls: z.array(z.string()).nullish(),
    primary_url: z.string().nullish(),
  })
  .passthrough();

const backendBrandVoiceSchema = z
  .object({
    tone: z.string().nullish(),
    keywords: z.array(z.string()).nullish(),
    emoji_usage: z.string().nullish(),
    key_messaging: z.array(z.string()).nullish(),
  })
  .passthrough();

const backendBrandFoundationSchema = z
  .object({
    mission: z.string().nullish(),
    vision: z.string().nullish(),
    core_values: z.array(z.string()).nullish(),
    niches: z.array(z.string()).nullish(),
  })
  .passthrough();

const backendProfileDataSchema = z.object({
  brand_id: z.string(),
  brand_summary: z.string().nullish(),
  brand_foundation: backendBrandFoundationSchema.nullish(),
  niches: z.array(z.string()).nullish(),
  audience_profile: backendAudienceSchema.nullish(),
  competitive_landscape: z
    .object({
      top_competitors: z.array(backendCompetitorSchema).nullish(),
    })
    .nullish(),
  brand_voice: backendBrandVoiceSchema.nullish(),
});

const backendProfileResponseSchema = z.object({
  status: z.enum(["success", "onboarding_required"]).or(z.string()),
  data: backendProfileDataSchema.nullish(),
});

function normalizeStrings(values?: Array<string | null | undefined>) {
  const result = (values ?? [])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return result.length > 0 ? result : undefined;
}

function mapTrend(trend: z.infer<typeof backendTrendSchema>) {
  return brandInsightsTrendSchema.parse({
    id: trend.id,
    title: trend.title,
    description: trend.description ?? undefined,
    relevanceToBrand: trend.relevance_to_brand ?? undefined,
    source: trend.source ?? undefined,
    isSelected: trend.is_selected ?? false,
    timesUsed: trend.times_used ?? 0,
  });
}

function mapEvent(event: z.infer<typeof backendEventSchema>) {
  const date = event.date ?? event.event_date ?? undefined;
  return brandInsightsEventSchema.parse({
    id: event.id,
    title: event.title,
    date: date ?? undefined,
    description: event.description ?? undefined,
    opportunity: event.opportunity ?? undefined,
    isSelected: event.is_selected ?? false,
    timesUsed: event.times_used ?? 0,
  });
}

function mapQuestion(question: z.infer<typeof backendQuestionSchema>) {
  return brandInsightsQuestionSchema.parse({
    id: question.id,
    question: question.question,
    socialPlatform: question.social_platform ?? question.platform ?? undefined,
    contentTypeSuggestion: question.content_type_suggestion ?? undefined,
    whyRelevant: question.why_relevant ?? undefined,
    isSelected: question.is_selected ?? false,
    timesUsed: question.times_used ?? 0,
  });
}

function mapQuestionsByNiche(payload: z.infer<typeof backendQuestionsByNicheSchema>) {
  const questionsByNiche: Record<string, z.infer<typeof brandInsightsQuestionsByNicheSchema>["questionsByNiche"][string]> =
    {};

  Object.entries(payload.questions_by_niche ?? {}).forEach(([niche, value]) => {
    const parsed = backendNicheQuestionsSchema.parse(value);
    questionsByNiche[niche] = {
      questions: parsed.questions.map(mapQuestion),
      totalGenerated: parsed.total_generated ?? undefined,
    };
  });

  return brandInsightsQuestionsByNicheSchema.parse({
    status: payload.status ?? undefined,
    questionsByNiche,
    summary: payload.summary
      ? {
          totalNiches: payload.summary.total_niches ?? undefined,
          totalQuestions: payload.summary.total_questions ?? undefined,
          averagePerNiche: payload.summary.average_per_niche ?? undefined,
        }
      : undefined,
    generatedAt: payload.generated_at ?? undefined,
  });
}

function mapTrendsAndEvents(payload: z.infer<typeof backendTrendsAndEventsSchema>) {
  return brandInsightsTrendsAndEventsSchema.parse({
    status: payload.status ?? undefined,
    trends: (payload.trends ?? []).map(mapTrend),
    events: (payload.events ?? []).map(mapEvent),
    country: payload.country ?? undefined,
    weekAnalyzed: payload.week_analyzed ?? undefined,
    generatedAt: payload.generated_at ?? undefined,
  });
}

export function mapBackendInsightsResponse(payload: unknown) {
  const parsed = backendInsightsResponseSchema.parse(payload);
  const data = backendInsightsDataSchema.parse(parsed.data);

  return brandInsightsSchema.parse({
    status: parsed.status,
    generatedAt: parsed.generated_at ?? undefined,
    data: brandInsightsDataSchema.parse({
      generationId: data.generation_id,
      trendsAndEvents: mapTrendsAndEvents(data.trends_and_events),
      questionsByNiche: mapQuestionsByNiche(data.questions_by_niche),
      country: data.country ?? undefined,
      weekStartDate: data.week_start_date,
      fromCache: data.from_cache ?? false,
      selectedSocialPlatforms: data.selected_social_platforms ?? undefined,
    }),
  });
}

export function mapBackendGenerationResponse(payload: unknown) {
  const parsed = backendGenerationResponseSchema.parse(payload);

  if (parsed.status === "processing") {
    return brandInsightsGenerationResponseSchema.parse({
      status: "processing",
      taskId: parsed.data.task_id,
      brandId: parsed.data.brand_id ?? parsed.data.platform_account_id ?? undefined,
    });
  }

  const brandId = parsed.data?.brand_id ?? parsed.data?.platform_account_id ?? undefined;
  const counts = parsed.data?.counts;
  const hasCounts =
    counts &&
    [counts.trends, counts.events, counts.questions].some((value) => typeof value === "number");

  return brandInsightsGenerationResponseSchema.parse({
    status: "success",
    brandId,
    generationId: parsed.data?.generation_id ?? undefined,
    fromCache: parsed.data?.from_cache ?? false,
    counts: hasCounts
      ? {
          trends: counts?.trends ?? undefined,
          events: counts?.events ?? undefined,
          questions: counts?.questions ?? undefined,
        }
      : undefined,
  });
}

export function mapBackendStatusResponse(payload: unknown) {
  const parsed = backendStatusResponseSchema.parse(payload);
  const normalizedStatus = brandInsightsTaskStatusSchema.safeParse(parsed.status);
  const status = normalizedStatus.success ? normalizedStatus.data : "error";

  return brandInsightsStatusResponseSchema.parse({
    status,
    taskId: parsed.task_id ?? undefined,
    brandId: parsed.brand_id ?? parsed.platform_account_id ?? undefined,
    error: parsed.error ?? undefined,
    message: parsed.message ?? undefined,
  });
}

function mapAudienceSegment(segment: z.infer<typeof backendAudienceSegmentSchema>) {
  const name = segment.name ?? segment.segment_name ?? undefined;
  if (!name) {
    return null;
  }

  return brandInsightsAudienceSegmentSchema.parse({
    name,
    description: segment.description ?? segment.summary ?? segment.details ?? undefined,
  });
}

function mapAudience(payload?: z.infer<typeof backendAudienceSchema> | null) {
  if (!payload) return undefined;

  const pains = normalizeStrings([
    ...(payload.pains_and_fears ?? []),
    ...(payload.pain_points ?? []),
    ...(payload.challenges ?? []),
    ...(payload.barriers ?? []),
  ]);

  const motivations = normalizeStrings([
    ...(payload.motivations_and_triggers ?? []),
    ...(payload.motivations ?? []),
    ...(payload.emotional_drivers ?? []),
  ]);

  const segments =
    payload.segments
      ?.map(mapAudienceSegment)
      .filter((segment): segment is NonNullable<ReturnType<typeof mapAudienceSegment>> => Boolean(segment)) ?? undefined;

  return brandInsightsAudienceSchema.parse({
    summary: payload.summary ?? payload.ideal_customer_persona_summary ?? undefined,
    painsAndFears: pains,
    motivationsAndTriggers: motivations,
    segments,
  });
}

function mapCompetitors(payload?: z.infer<typeof backendProfileDataSchema>["competitive_landscape"] | null) {
  const competitors = payload?.top_competitors ?? [];
  if (!competitors || competitors.length === 0) return undefined;

  const mapped = competitors
    .map((competitor) => backendCompetitorSchema.parse(competitor))
    .map((competitor) =>
      brandInsightsCompetitorSchema.parse({
        name: competitor.name ?? "",
        strategy: competitor.strategy ?? undefined,
        messaging: competitor.messaging ?? undefined,
        urls: normalizeStrings([
          ...(competitor.urls ?? []),
          competitor.primary_url ?? undefined,
        ]),
      })
    )
    .filter((competitor) => competitor.name.trim().length > 0);

  return mapped.length > 0 ? mapped : undefined;
}

function mapBrandVoice(payload?: z.infer<typeof backendBrandVoiceSchema> | null) {
  if (!payload) return undefined;

  return brandInsightsBrandVoiceSchema.parse({
    tone: payload.tone ?? undefined,
    keywords: normalizeStrings(payload.keywords ?? undefined),
    emojiUsage: payload.emoji_usage ?? undefined,
    keyMessaging: normalizeStrings(payload.key_messaging ?? undefined),
  });
}

export function mapBackendProfileResponse(payload: unknown) {
  const parsed = backendProfileResponseSchema.parse(payload);
  if (parsed.status === "onboarding_required") {
    return brandInsightsProfileSchema.parse({ status: "onboarding_required" });
  }

  const data = backendProfileDataSchema.parse(parsed.data);
  const foundation = data.brand_foundation ?? undefined;
  const coreValues = normalizeStrings(foundation?.core_values ?? undefined);
  const niches = normalizeStrings(data.niches ?? foundation?.niches ?? undefined);

  return brandInsightsProfileSchema.parse({
    status: "success",
    brandId: data.brand_id,
    brandSummary: data.brand_summary ?? undefined,
    mission: foundation?.mission ?? undefined,
    vision: foundation?.vision ?? undefined,
    coreValues,
    niches,
    audience: mapAudience(data.audience_profile ?? undefined),
    competitors: mapCompetitors(data.competitive_landscape ?? undefined),
    brandVoice: mapBrandVoice(data.brand_voice ?? undefined),
  });
}
