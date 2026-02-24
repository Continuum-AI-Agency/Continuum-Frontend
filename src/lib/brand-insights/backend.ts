import { z } from "zod";

import {
  brandInsightsAudienceSchema,
  brandInsightsAudienceSegmentSchema,
  brandInsightsBrandVoiceSchema,
  brandInsightsCompetitorSchema,
  brandInsightsDataSchema,
  brandInsightsGenerationResponseSchema,
  brandInsightsJobStreamSchema,
  brandInsightsProfileSchema,
  brandInsightsQuestionSchema,
  brandInsightsQuestionsByNicheSchema,
  brandInsightsSchema,
  brandInsightsStatusMessageSchema,
  brandInsightsStatusResponseSchema,
  brandInsightsTaskStatusSchema,
  brandInsightsTrendSchema,
  brandInsightsEventSchema,
  brandInsightsTrendsAndEventsSchema,
} from "@/lib/schemas/brandInsights";

// Accept either ISO-8601 timestamps (with "T") or Postgres-style timestamps with a space.
const isoDateSchema = z
  .string()
  .transform((value, ctx) => {
    const normalized = value.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expected ISO timestamp" });
      return z.NEVER;
    }
    return normalized;
  });

const backendTrendSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  relevance_to_brand: z.string().nullish(),
  relevanceToBrand: z.string().nullish(),
  source: z.string().nullish(),
  is_selected: z.boolean().nullish(),
  isSelected: z.boolean().nullish(),
  times_used: z.number().int().nonnegative().nullish(),
  timesUsed: z.number().int().nonnegative().nullish(),
});

const backendEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().nullish(),
  event_date: z.string().nullish(),
  eventDate: z.string().nullish(),
  description: z.string().nullish(),
  opportunity: z.string().nullish(),
  is_selected: z.boolean().nullish(),
  isSelected: z.boolean().nullish(),
  times_used: z.number().int().nonnegative().nullish(),
  timesUsed: z.number().int().nonnegative().nullish(),
});

const backendQuestionSchema = z.object({
  id: z.string(),
  question: z.string().nullish(),
  question_text: z.string().nullish(),
  questionText: z.string().nullish(),
  social_platform: z.string().nullish(),
  socialPlatform: z.string().nullish(),
  platform: z.string().nullish(),
  content_type_suggestion: z.string().nullish(),
  contentTypeSuggestion: z.string().nullish(),
  why_relevant: z.string().nullish(),
  whyRelevant: z.string().nullish(),
  is_selected: z.boolean().nullish(),
  isSelected: z.boolean().nullish(),
  times_used: z.number().int().nonnegative().nullish(),
  timesUsed: z.number().int().nonnegative().nullish(),
  niche: z.string().nullish(),
  audience_niche: z.string().nullish(),
  audienceNiche: z.string().nullish(),
});

const backendNicheQuestionsSchema = z.union([
  z.object({
    questions: z.array(backendQuestionSchema).default([]),
    total_generated: z.number().int().nonnegative().nullish(),
    totalGenerated: z.number().int().nonnegative().nullish(),
    stats: z
      .object({
        count: z.number().int().nonnegative().nullish(),
      })
      .nullish(),
  }),
  z.string().transform(() => ({ questions: [], total_generated: 0 })),
]);

const backendQuestionsByNicheSchema = z.object({
  status: z.string().nullish(),
  questions_by_niche: z.record(z.string(), backendNicheQuestionsSchema).default({}),
  questionsByNiche: z.record(z.string(), backendNicheQuestionsSchema).nullish(),
  summary: z
    .object({
      total_niches: z.number().int().nonnegative().nullish(),
      total_questions: z.number().int().nonnegative().nullish(),
      average_per_niche: z.number().nullish(),
      totalNiches: z.number().int().nonnegative().nullish(),
      totalQuestions: z.number().int().nonnegative().nullish(),
      averagePerNiche: z.number().nullish(),
    })
    .nullish(),
  generated_at: isoDateSchema.nullish(),
  generatedAt: isoDateSchema.nullish(),
});

const backendTrendsAndEventsSchema = z.object({
  status: z.string().nullish(),
  trends: z.array(backendTrendSchema).default([]),
  events: z.array(backendEventSchema).default([]),
  country: z.string().nullish(),
  week_analyzed: z.string().nullish(),
  weekAnalyzed: z.string().nullish(),
  generated_at: isoDateSchema.nullish(),
  generatedAt: isoDateSchema.nullish(),
});

const backendInsightsDataSchema = z.object({
  generation_id: z.string().nullish(),
  generationId: z.string().nullish(),
  trends_and_events: backendTrendsAndEventsSchema.nullish(),
  trendsAndEvents: backendTrendsAndEventsSchema.nullish(),
  questions_by_niche: backendQuestionsByNicheSchema.nullish(),
  questionsByNiche: backendQuestionsByNicheSchema.nullish(),
  country: z.string().nullish(),
  week_start_date: z.string().nullish(),
  weekStartDate: z.string().nullish(),
  from_cache: z.boolean().nullish(),
  fromCache: z.boolean().nullish(),
  selected_social_platforms: z.array(z.string()).nullish(),
  selectedSocialPlatforms: z.array(z.string()).nullish(),
});

const backendInsightsResponseSchema = z.object({
  status: z.string(),
  message: z.string().nullish(),
  generated_at: isoDateSchema.nullish(),
  generatedAt: isoDateSchema.nullish(),
  data: backendInsightsDataSchema.nullable(),
});

const backendTotalsSchema = z.object({
  trends: z.number().int().nonnegative().nullish(),
  events: z.number().int().nonnegative().nullish(),
  questions: z.number().int().nonnegative().nullish(),
});

const backendReadGenerationSchema = z
  .object({
    id: z.string().nullish(),
    generation_id: z.string().nullish(),
    generationId: z.string().nullish(),
  })
  .passthrough();

const backendReadCountsSchema = backendTotalsSchema
  .extend({
    generations: z.number().int().nonnegative().nullish(),
  })
  .passthrough();

const backendReadWindowSchema = z
  .object({
    days: z.number().int().positive().nullish(),
    window_start: isoDateSchema.nullish(),
    windowStart: isoDateSchema.nullish(),
    window_end: isoDateSchema.nullish(),
    windowEnd: isoDateSchema.nullish(),
    counts: backendReadCountsSchema.nullish(),
    trends: z.array(backendTrendSchema).default([]),
    events: z.array(backendEventSchema).default([]),
    questions: z.array(backendQuestionSchema).default([]),
    generations: z.array(backendReadGenerationSchema).default([]),
  })
  .passthrough();

const backendReadDataSchema = z
  .object({
    status: z.string().nullish(),
    brand_id: z.string().nullish(),
    brandId: z.string().nullish(),
    generation_id: z.string().nullish(),
    generationId: z.string().nullish(),
    anchor_ts: isoDateSchema.nullish(),
    anchorTs: isoDateSchema.nullish(),
    windows_days: z.array(z.number().int().positive()).nullish(),
    windowsDays: z.array(z.number().int().positive()).nullish(),
    windows: z.array(backendReadWindowSchema).default([]),
    generation: backendReadGenerationSchema.nullish(),
    generation_insights: z.unknown().nullish(),
    generationInsights: z.unknown().nullish(),
  })
  .passthrough()
  .refine(
    (data) =>
      Boolean(data.anchor_ts ?? data.anchorTs) ||
      Boolean(data.windows_days ?? data.windowsDays) ||
      Boolean(data.generation_insights ?? data.generationInsights) ||
      data.windows.length > 0,
    { message: "Payload is not a trends read envelope" }
  );

const backendReadResponseSchema = z.object({
  status: z.string(),
  message: z.string().nullish(),
  generated_at: isoDateSchema.nullish(),
  generatedAt: isoDateSchema.nullish(),
  data: backendReadDataSchema.nullable(),
});

const backendStreamSchema = z
  .object({
    transport: z.string().nullish(),
    channel: z.string().nullish(),
    queue_name: z.string().nullish(),
    queueName: z.string().nullish(),
    latest_message_id: z.number().int().nonnegative().nullish(),
    latestMessageId: z.number().int().nonnegative().nullish(),
  })
  .passthrough();

const backendWarningsSchema = z
  .object({
    scrape_failures: z.array(z.unknown()).nullish(),
    scrapeFailures: z.array(z.unknown()).nullish(),
    warning_count: z.number().int().nonnegative().nullish(),
    warningCount: z.number().int().nonnegative().nullish(),
  })
  .passthrough();

const backendCompetitorJobSchema = z
  .object({
    status: z.string().nullish(),
    source_run_id: z.string().nullish(),
    sourceRunId: z.string().nullish(),
    competitor_count: z.number().int().nonnegative().nullish(),
    competitorCount: z.number().int().nonnegative().nullish(),
    total_ingested: z.number().int().nonnegative().nullish(),
    totalIngested: z.number().int().nonnegative().nullish(),
    reason: z.string().nullish(),
  })
  .passthrough();

const backendGenerationResponseSchema = z.object({
  status: z.string(),
  message: z.string().nullish(),
  dependency: z
    .object({
      strategic_analysis: z
        .object({
          required: z.boolean().nullish(),
          status: z.string().nullish(),
          run_id: z.string().nullish(),
          runId: z.string().nullish(),
        })
        .nullish(),
      strategicAnalysis: z
        .object({
          required: z.boolean().nullish(),
          status: z.string().nullish(),
          run_id: z.string().nullish(),
          runId: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  data: z
    .object({
      job_id: z.string().nullish(),
      jobId: z.string().nullish(),
      generation_id: z.string().nullish(),
      generationId: z.string().nullish(),
      task_id: z.string().nullish(),
      taskId: z.string().nullish(),
      brand_id: z.string().nullish(),
      brandId: z.string().nullish(),
      platform_account_id: z.string().nullish(),
      from_cache: z.boolean().nullish(),
      fromCache: z.boolean().nullish(),
      status: z.string().nullish(),
      counts: backendTotalsSchema.nullish(),
      persisted: backendTotalsSchema.nullish(),
      dependency: z
        .object({
          strategic_analysis: z
            .object({
              required: z.boolean().nullish(),
              status: z.string().nullish(),
              run_id: z.string().nullish(),
              runId: z.string().nullish(),
            })
            .nullish(),
          strategicAnalysis: z
            .object({
              required: z.boolean().nullish(),
              status: z.string().nullish(),
              run_id: z.string().nullish(),
              runId: z.string().nullish(),
            })
            .nullish(),
        })
        .nullish(),
      stream: backendStreamSchema.nullish(),
      fallback_poll_url: z.string().nullish(),
      fallbackPollUrl: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
});

const backendStatusResponseSchema = z.object({
  status: z.string(),
  message: z.string().nullish(),
  data: z
    .object({
      job_id: z.string().nullish(),
      jobId: z.string().nullish(),
      generation_id: z.string().nullish(),
      generationId: z.string().nullish(),
      task_id: z.string().nullish(),
      taskId: z.string().nullish(),
      brand_id: z.string().nullish(),
      brandId: z.string().nullish(),
      platform_account_id: z.string().nullish(),
      status: z.string().nullish(),
      progress_percent: z.number().nullish(),
      progressPercent: z.number().nullish(),
      stage: z.string().nullish(),
      stage_message: z.string().nullish(),
      stageMessage: z.string().nullish(),
      totals: backendTotalsSchema.nullish(),
      started_at: isoDateSchema.nullish(),
      startedAt: isoDateSchema.nullish(),
      completed_at: isoDateSchema.nullish(),
      completedAt: isoDateSchema.nullish(),
      week_start_date: z.string().nullish(),
      weekStartDate: z.string().nullish(),
      error_code: z.string().nullish(),
      errorCode: z.string().nullish(),
      error_detail: z.unknown().nullish(),
      errorDetail: z.unknown().nullish(),
      warnings: backendWarningsSchema.nullish(),
      competitor: backendCompetitorJobSchema.nullish(),
      stream: backendStreamSchema.nullish(),
      latest_message_id: z.number().int().nonnegative().nullish(),
      latestMessageId: z.number().int().nonnegative().nullish(),
      error: z.unknown().nullish(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
    })
    .passthrough()
    .nullish(),
  task_id: z.string().nullish(),
  taskId: z.string().nullish(),
  brand_id: z.string().nullish(),
  brandId: z.string().nullish(),
  platform_account_id: z.string().nullish(),
  generation_id: z.string().nullish(),
  generationId: z.string().nullish(),
  job_id: z.string().nullish(),
  jobId: z.string().nullish(),
  progress_percent: z.number().nullish(),
  progressPercent: z.number().nullish(),
  stage: z.string().nullish(),
  stage_message: z.string().nullish(),
  stageMessage: z.string().nullish(),
  totals: backendTotalsSchema.nullish(),
  started_at: isoDateSchema.nullish(),
  startedAt: isoDateSchema.nullish(),
  completed_at: isoDateSchema.nullish(),
  completedAt: isoDateSchema.nullish(),
  week_start_date: z.string().nullish(),
  weekStartDate: z.string().nullish(),
  error_code: z.string().nullish(),
  errorCode: z.string().nullish(),
  error_detail: z.unknown().nullish(),
  errorDetail: z.unknown().nullish(),
  warnings: backendWarningsSchema.nullish(),
  competitor: backendCompetitorJobSchema.nullish(),
  stream: backendStreamSchema.nullish(),
  latest_message_id: z.number().int().nonnegative().nullish(),
  latestMessageId: z.number().int().nonnegative().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  error: z.unknown().nullish(),
});

const backendStatusMessageSchema = z
  .object({
    message_id: z.number().int().nonnegative().nullish(),
    messageId: z.number().int().nonnegative().nullish(),
    stage: z.string().nullish(),
    progress_percent: z.number().nullish(),
    progressPercent: z.number().nullish(),
    stage_message: z.string().nullish(),
    stageMessage: z.string().nullish(),
    payload: z.record(z.string(), z.unknown()).nullish(),
    created_at: isoDateSchema.nullish(),
    createdAt: isoDateSchema.nullish(),
  })
  .passthrough();

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
    keywords: z.array(z.string().nullish()).nullish(),
    emoji_usage: z.string().nullish(),
    key_messaging: z.array(z.string().nullish()).nullish(),
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

function normalizeTimestamp(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return normalized;
}

function normalizeUnknownMessage(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const pieces = value.map((entry) => normalizeUnknownMessage(entry)).filter((entry): entry is string => Boolean(entry));
    if (pieces.length > 0) return pieces.join("; ");
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  if (typeof value === "object") {
    const asRecord = value as Record<string, unknown>;
    const message = normalizeUnknownMessage(asRecord.message);
    if (message) return message;
    const detail = normalizeUnknownMessage(asRecord.detail);
    if (detail) return detail;
    const error = normalizeUnknownMessage(asRecord.error);
    if (error) return error;
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function mapCounts(payload?: z.infer<typeof backendTotalsSchema> | null) {
  if (!payload) return undefined;
  const hasCounts = [payload.trends, payload.events, payload.questions].some((value) => typeof value === "number");
  if (!hasCounts) return undefined;

  return {
    trends: payload.trends ?? undefined,
    events: payload.events ?? undefined,
    questions: payload.questions ?? undefined,
  };
}

function mapStream(payload?: z.infer<typeof backendStreamSchema> | null) {
  if (!payload) return undefined;
  const channel = payload.channel?.trim();
  if (!channel) return undefined;
  const latestMessageId = payload.latest_message_id ?? payload.latestMessageId ?? null;

  return brandInsightsJobStreamSchema.parse({
    transport: payload.transport === "sse" ? "sse" : "sse",
    channel,
    queueName: payload.queue_name ?? payload.queueName ?? undefined,
    latestMessageId,
  });
}

function normalizeJobStatus(value?: string | null) {
  if (!value) return "error";
  const normalized = value.toLowerCase();
  const parsed = brandInsightsTaskStatusSchema.safeParse(normalized);
  return parsed.success ? parsed.data : "error";
}

function mapTrend(trend: z.infer<typeof backendTrendSchema>) {
  return brandInsightsTrendSchema.parse({
    id: trend.id,
    title: trend.title,
    description: trend.description ?? undefined,
    relevanceToBrand: trend.relevance_to_brand ?? trend.relevanceToBrand ?? undefined,
    source: trend.source ?? undefined,
    isSelected: trend.is_selected ?? trend.isSelected ?? false,
    timesUsed: trend.times_used ?? trend.timesUsed ?? 0,
  });
}

function mapEvent(event: z.infer<typeof backendEventSchema>) {
  const date = event.date ?? event.event_date ?? event.eventDate ?? undefined;
  return brandInsightsEventSchema.parse({
    id: event.id,
    title: event.title,
    date: date ?? undefined,
    description: event.description ?? undefined,
    opportunity: event.opportunity ?? undefined,
    isSelected: event.is_selected ?? event.isSelected ?? false,
    timesUsed: event.times_used ?? event.timesUsed ?? 0,
  });
}

function mapQuestion(question: z.infer<typeof backendQuestionSchema>) {
  const questionText = question.question ?? question.question_text ?? question.questionText;
  return brandInsightsQuestionSchema.parse({
    id: question.id,
    question: questionText ?? "",
    socialPlatform: question.social_platform ?? question.socialPlatform ?? question.platform ?? undefined,
    contentTypeSuggestion: question.content_type_suggestion ?? question.contentTypeSuggestion ?? undefined,
    whyRelevant: question.why_relevant ?? question.whyRelevant ?? undefined,
    isSelected: question.is_selected ?? question.isSelected ?? false,
    timesUsed: question.times_used ?? question.timesUsed ?? 0,
  });
}

function mapQuestionsByNiche(payload: z.infer<typeof backendQuestionsByNicheSchema>) {
  const questionsByNiche: Record<string, z.infer<typeof brandInsightsQuestionsByNicheSchema>["questionsByNiche"][string]> =
    {};
  let totalQuestions = 0;

  const sourceMap = payload.questions_by_niche ?? payload.questionsByNiche ?? {};
  Object.entries(sourceMap).forEach(([niche, value]) => {
    if (typeof value === "string") {
      questionsByNiche[niche] = {
        questions: [],
        totalGenerated: 0,
      };
      return;
    }

    const parsed = backendNicheQuestionsSchema.parse(value);
    const stats = "stats" in parsed ? parsed.stats : undefined;
    const totalGenerated =
      parsed.total_generated ??
      ("totalGenerated" in parsed ? parsed.totalGenerated : undefined) ??
      stats?.count ??
      undefined;
    const questions = parsed.questions.map(mapQuestion);
    totalQuestions += totalGenerated ?? questions.length;
    questionsByNiche[niche] = {
      questions,
      totalGenerated,
    };
  });

  const nichesCount = Object.keys(questionsByNiche).length;

  return brandInsightsQuestionsByNicheSchema.parse({
    status: payload.status ?? undefined,
    questionsByNiche,
    summary:
      payload.summary || nichesCount > 0
        ? {
            totalNiches: payload.summary?.total_niches ?? payload.summary?.totalNiches ?? nichesCount,
            totalQuestions: payload.summary?.total_questions ?? payload.summary?.totalQuestions ?? totalQuestions,
            averagePerNiche:
              payload.summary?.average_per_niche ??
              payload.summary?.averagePerNiche ??
              (nichesCount > 0 ? totalQuestions / nichesCount : undefined),
          }
        : undefined,
    generatedAt: normalizeTimestamp(payload.generated_at ?? payload.generatedAt),
  });
}

function mapTrendsAndEvents(payload: z.infer<typeof backendTrendsAndEventsSchema>) {
  return brandInsightsTrendsAndEventsSchema.parse({
    status: payload.status ?? undefined,
    trends: (payload.trends ?? []).map(mapTrend),
    events: (payload.events ?? []).map(mapEvent),
    country: payload.country ?? undefined,
    weekAnalyzed: payload.week_analyzed ?? payload.weekAnalyzed ?? undefined,
    generatedAt: normalizeTimestamp(payload.generated_at ?? payload.generatedAt),
  });
}

function mapQuestionsByNicheFromWindow(
  payload: z.infer<typeof backendReadWindowSchema>,
  generatedAt?: string
) {
  const grouped = new Map<string, Array<z.infer<typeof backendQuestionSchema>>>();

  payload.questions.forEach((question) => {
    const niche =
      question.niche?.trim() ??
      question.audience_niche?.trim() ??
      question.audienceNiche?.trim() ??
      "General";
    const questions = grouped.get(niche) ?? [];
    questions.push(question);
    grouped.set(niche, questions);
  });

  const questionsByNiche: Record<string, z.infer<typeof brandInsightsQuestionsByNicheSchema>["questionsByNiche"][string]> =
    {};

  grouped.forEach((questions, niche) => {
    questionsByNiche[niche] = {
      questions: questions.map(mapQuestion),
      totalGenerated: questions.length,
    };
  });

  const totalQuestions = Array.from(grouped.values()).reduce((total, questions) => total + questions.length, 0);
  const totalNiches = grouped.size;

  return brandInsightsQuestionsByNicheSchema.parse({
    status: undefined,
    questionsByNiche,
    summary:
      totalNiches > 0
        ? {
            totalNiches,
            totalQuestions,
            averagePerNiche: totalQuestions / totalNiches,
          }
        : undefined,
    generatedAt,
  });
}

function mapTrendsAndEventsFromWindow(payload: z.infer<typeof backendReadWindowSchema>, generatedAt?: string) {
  return brandInsightsTrendsAndEventsSchema.parse({
    status: undefined,
    trends: payload.trends.map(mapTrend),
    events: payload.events.map(mapEvent),
    country: undefined,
    weekAnalyzed: typeof payload.days === "number" ? `${payload.days}d` : undefined,
    generatedAt,
  });
}

function extractDateOnly(value?: string | null) {
  const normalized = normalizeTimestamp(value);
  return normalized ? normalized.slice(0, 10) : undefined;
}

function parseLegacyInsightsData(payload: unknown) {
  const direct = backendInsightsDataSchema.safeParse(payload);
  if (direct.success) {
    return direct.data;
  }

  const nested = z
    .object({
      data: backendInsightsDataSchema,
    })
    .safeParse(payload);
  return nested.success ? nested.data.data : undefined;
}

function selectReadWindow(windows: Array<z.infer<typeof backendReadWindowSchema>>) {
  if (windows.length === 0) return undefined;
  const exactWeek = windows.find((window) => window.days === 7);
  if (exactWeek) return exactWeek;

  const nonEmpty = windows.find(
    (window) =>
      window.trends.length > 0 ||
      window.events.length > 0 ||
      window.questions.length > 0
  );
  if (nonEmpty) return nonEmpty;

  const sortable = windows.filter((window) => typeof window.days === "number");
  if (sortable.length === 0) return windows[0];
  return sortable.sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER))[0];
}

function mapLegacyInsightsResponse(payload: z.infer<typeof backendInsightsResponseSchema>) {
  if (!payload.data) {
    const reason = payload.message ?? `Brand insights unavailable (status: ${payload.status})`;
    throw new Error(reason);
  }

  const data = backendInsightsDataSchema.parse(payload.data);
  const generationId = data.generation_id ?? data.generationId;
  const weekStartDate = data.week_start_date ?? data.weekStartDate;

  if (!generationId || !weekStartDate) {
    throw new Error("Brand insights payload missing required generation metadata");
  }

  const trendsPayload = data.trends_and_events ?? data.trendsAndEvents;
  const questionsPayload = data.questions_by_niche ?? data.questionsByNiche;
  if (!trendsPayload || !questionsPayload) {
    throw new Error("Brand insights payload missing trends or questions");
  }

  return brandInsightsSchema.parse({
    status: payload.status,
    generatedAt: normalizeTimestamp(payload.generated_at ?? payload.generatedAt),
    data: brandInsightsDataSchema.parse({
      generationId,
      trendsAndEvents: mapTrendsAndEvents(trendsPayload),
      questionsByNiche: mapQuestionsByNiche(questionsPayload),
      country: data.country ?? undefined,
      weekStartDate,
      fromCache: data.from_cache ?? data.fromCache ?? false,
      selectedSocialPlatforms: data.selected_social_platforms ?? data.selectedSocialPlatforms ?? undefined,
    }),
  });
}

function mapReadInsightsResponse(payload: z.infer<typeof backendReadResponseSchema>) {
  if (!payload.data) {
    const reason = payload.message ?? `Brand insights unavailable (status: ${payload.status})`;
    throw new Error(reason);
  }

  const data = payload.data;
  const anchorTimestamp = normalizeTimestamp(data.anchor_ts ?? data.anchorTs);
  const selectedWindow = selectReadWindow(data.windows);
  const generationInsights = parseLegacyInsightsData(data.generation_insights ?? data.generationInsights);

  const generationId =
    data.generation_id ??
    data.generationId ??
    data.generation?.generation_id ??
    data.generation?.generationId ??
    data.generation?.id ??
    selectedWindow?.generations[0]?.generation_id ??
    selectedWindow?.generations[0]?.generationId ??
    selectedWindow?.generations[0]?.id ??
    generationInsights?.generation_id ??
    generationInsights?.generationId;

  const weekStartDate =
    generationInsights?.week_start_date ??
    generationInsights?.weekStartDate ??
    extractDateOnly(selectedWindow?.window_start ?? selectedWindow?.windowStart) ??
    extractDateOnly(anchorTimestamp);

  if (!generationId || !weekStartDate) {
    throw new Error("Brand insights payload missing required generation metadata");
  }

  const generatedAt = normalizeTimestamp(payload.generated_at ?? payload.generatedAt ?? anchorTimestamp);
  const legacyTrendsPayload = generationInsights?.trends_and_events ?? generationInsights?.trendsAndEvents;
  const legacyQuestionsPayload = generationInsights?.questions_by_niche ?? generationInsights?.questionsByNiche;

  const trendsAndEvents = selectedWindow
    ? mapTrendsAndEventsFromWindow(selectedWindow, generatedAt)
    : legacyTrendsPayload
      ? mapTrendsAndEvents(legacyTrendsPayload)
      : brandInsightsTrendsAndEventsSchema.parse({
          trends: [],
          events: [],
        });

  const questionsByNiche = selectedWindow
    ? mapQuestionsByNicheFromWindow(selectedWindow, generatedAt)
    : legacyQuestionsPayload
      ? mapQuestionsByNiche(legacyQuestionsPayload)
      : brandInsightsQuestionsByNicheSchema.parse({
          questionsByNiche: {},
        });

  return brandInsightsSchema.parse({
    status: payload.status,
    generatedAt,
    data: brandInsightsDataSchema.parse({
      generationId,
      trendsAndEvents,
      questionsByNiche,
      country: generationInsights?.country ?? undefined,
      weekStartDate,
      fromCache: generationInsights?.from_cache ?? generationInsights?.fromCache ?? false,
      selectedSocialPlatforms:
        generationInsights?.selected_social_platforms ?? generationInsights?.selectedSocialPlatforms ?? undefined,
    }),
  });
}

export function mapBackendInsightsResponse(payload: unknown) {
  const readPayload = backendReadResponseSchema.safeParse(payload);
  if (readPayload.success) {
    return mapReadInsightsResponse(readPayload.data);
  }

  const parsed = backendInsightsResponseSchema.parse(payload);
  return mapLegacyInsightsResponse(parsed);
}

export function mapBackendGenerationResponse(payload: unknown) {
  const parsed = backendGenerationResponseSchema.parse(payload);
  const data = parsed.data;
  const strategicDependency =
    data?.dependency?.strategic_analysis ??
    data?.dependency?.strategicAnalysis ??
    parsed.dependency?.strategic_analysis ??
    parsed.dependency?.strategicAnalysis ??
    undefined;

  if (parsed.status === "processing" || parsed.status === "running" || parsed.status === "pending") {
    return brandInsightsGenerationResponseSchema.parse({
      status: "processing",
      generationId: data?.generation_id ?? data?.generationId ?? data?.task_id ?? data?.taskId ?? undefined,
      jobId: data?.job_id ?? data?.jobId ?? undefined,
      jobStatus:
        data?.status === "pending" ||
        data?.status === "running" ||
        data?.status === "completed" ||
        data?.status === "failed"
          ? data.status
          : parsed.status === "pending" || parsed.status === "running"
            ? parsed.status
            : undefined,
      brandId: data?.brand_id ?? data?.brandId ?? data?.platform_account_id ?? undefined,
      dependencyStrategicAnalysis: strategicDependency
        ? {
            required: strategicDependency.required ?? undefined,
            status: strategicDependency.status ?? undefined,
            runId: strategicDependency.run_id ?? strategicDependency.runId ?? null,
          }
        : undefined,
      stream: mapStream(data?.stream),
      fallbackPollUrl: data?.fallback_poll_url ?? data?.fallbackPollUrl ?? undefined,
      message: parsed.message ?? undefined,
    });
  }

  if (parsed.status !== "success") {
    throw new Error(parsed.message ?? `Unexpected generation response status: ${parsed.status}`);
  }

  return brandInsightsGenerationResponseSchema.parse({
    status: "success",
    brandId: data?.brand_id ?? data?.brandId ?? data?.platform_account_id ?? undefined,
    generationId: data?.generation_id ?? data?.generationId ?? undefined,
    fromCache: data?.from_cache ?? data?.fromCache ?? false,
    counts: mapCounts(data?.counts ?? data?.persisted),
    message: parsed.message ?? undefined,
  });
}

export function mapBackendStatusResponse(payload: unknown) {
  const parsed = backendStatusResponseSchema.parse(payload);
  const data = parsed.data;

  const statusSource =
    data?.status ??
    (parsed.status === "success" ? undefined : parsed.status);
  const status = normalizeJobStatus(statusSource);

  const progress = data?.progress_percent ?? data?.progressPercent ?? parsed.progress_percent ?? parsed.progressPercent;
  const stage = data?.stage ?? parsed.stage ?? undefined;
  const stageMessage = data?.stage_message ?? data?.stageMessage ?? parsed.stage_message ?? parsed.stageMessage ?? undefined;
  const totals = data?.totals ?? parsed.totals;
  const startedAt = data?.started_at ?? data?.startedAt ?? parsed.started_at ?? parsed.startedAt;
  const completedAt = data?.completed_at ?? data?.completedAt ?? parsed.completed_at ?? parsed.completedAt;
  const weekStartDate = data?.week_start_date ?? data?.weekStartDate ?? parsed.week_start_date ?? parsed.weekStartDate;
  const errorCode = data?.error_code ?? data?.errorCode ?? parsed.error_code ?? parsed.errorCode;
  const errorDetail = data?.error_detail ?? data?.errorDetail ?? parsed.error_detail ?? parsed.errorDetail;
  const warningPayload = data?.warnings ?? parsed.warnings;
  const competitorPayload = data?.competitor ?? parsed.competitor;
  const latestMessageId =
    data?.latest_message_id ??
    data?.latestMessageId ??
    parsed.latest_message_id ??
    parsed.latestMessageId ??
    undefined;
  const stream = mapStream(data?.stream ?? parsed.stream);
  const normalizedErrorDetail = normalizeUnknownMessage(errorDetail);
  const message = parsed.message ?? stageMessage ?? normalizedErrorDetail ?? undefined;
  const error = normalizeUnknownMessage(data?.error ?? parsed.error);

  return brandInsightsStatusResponseSchema.parse({
    status,
    generationId:
      data?.generation_id ??
      data?.generationId ??
      parsed.generation_id ??
      parsed.generationId ??
      data?.task_id ??
      data?.taskId ??
      parsed.task_id ??
      parsed.taskId ??
      undefined,
    jobId: data?.job_id ?? data?.jobId ?? parsed.job_id ?? parsed.jobId ?? undefined,
    brandId:
      data?.brand_id ??
      data?.brandId ??
      parsed.brand_id ??
      parsed.brandId ??
      data?.platform_account_id ??
      parsed.platform_account_id ??
      undefined,
    progressPercent: typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : undefined,
    stage,
    stageMessage,
    weekStartDate: weekStartDate ?? undefined,
    totals: mapCounts(totals),
    startedAt: normalizeTimestamp(startedAt),
    completedAt: normalizeTimestamp(completedAt),
    errorCode: errorCode ?? undefined,
    errorDetail: normalizedErrorDetail,
    warnings: warningPayload
      ? {
          scrapeFailures: warningPayload.scrape_failures ?? warningPayload.scrapeFailures ?? [],
          warningCount: warningPayload.warning_count ?? warningPayload.warningCount ?? undefined,
        }
      : undefined,
    competitor: competitorPayload
      ? {
          status:
            competitorPayload.status === "success" ||
            competitorPayload.status === "skipped" ||
            competitorPayload.status === "error"
              ? competitorPayload.status
              : null,
          sourceRunId: competitorPayload.source_run_id ?? competitorPayload.sourceRunId ?? null,
          competitorCount: competitorPayload.competitor_count ?? competitorPayload.competitorCount ?? undefined,
          totalIngested: competitorPayload.total_ingested ?? competitorPayload.totalIngested ?? undefined,
          reason: competitorPayload.reason ?? null,
        }
      : undefined,
    stream: stream
      ? {
          ...stream,
          latestMessageId:
            typeof latestMessageId === "number" && Number.isFinite(latestMessageId)
              ? latestMessageId
              : stream.latestMessageId ?? null,
        }
      : undefined,
    metadata: data?.metadata ?? parsed.metadata ?? undefined,
    error,
    message,
  });
}

export function mapBackendStatusMessage(payload: unknown) {
  const envelope = z
    .object({
      message: z.unknown().optional(),
    })
    .passthrough()
    .safeParse(payload);

  const candidate = envelope.success && envelope.data.message ? envelope.data.message : payload;
  const parsed = backendStatusMessageSchema.parse(candidate);
  const progress = parsed.progress_percent ?? parsed.progressPercent;

  return brandInsightsStatusMessageSchema.parse({
    messageId: parsed.message_id ?? parsed.messageId ?? undefined,
    stage: parsed.stage ?? undefined,
    progressPercent: typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : undefined,
    stageMessage: parsed.stage_message ?? parsed.stageMessage ?? undefined,
    payload: parsed.payload ?? undefined,
    createdAt: normalizeTimestamp(parsed.created_at ?? parsed.createdAt),
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
