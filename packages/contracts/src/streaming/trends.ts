import { z } from 'zod';

// Canonical Trends V2 contract. Both the Backend emit side
// (App/trends/events/generationEvents.ts + workflow setProgress) and the
// Frontend consumer (brandInsights.client subscribe + progress UI) import from
// here, so the stage vocabulary, runtime telemetry, and event shapes cannot
// drift independently. See root AGENTS.md section 4 (Shared contracts).

export const trendsStageSchema = z.enum([
  'awaiting_strategic_analysis',
  'queued',
  'scraping',
  'raw_search',
  'synthesis',
  'web_enrichment',
  'questions',
  'secondary_platform_eval',
  'persisting',
  'completed',
  'failed',
]);
export type TrendsStage = z.infer<typeof trendsStageSchema>;

// Pipeline order for rendering step lists. Mirrors trendsStageSchema options.
export const TRENDS_STAGE_ORDER = trendsStageSchema.options;

export const TRENDS_STAGE_LABELS: Record<TrendsStage, string> = {
  awaiting_strategic_analysis: 'Awaiting Strategic Analysis',
  queued: 'Queued',
  scraping: 'Scraping',
  raw_search: 'Raw Search',
  synthesis: 'Synthesis',
  web_enrichment: 'Web Enrichment',
  questions: 'Questions',
  secondary_platform_eval: 'Secondary Platform Eval',
  persisting: 'Persisting',
  completed: 'Completed',
  failed: 'Failed',
};

// Nominal progress anchor (percent) the Backend emits at each stage boundary.
// The Frontend interpolates a smooth bar between consecutive anchors. Keep in
// sync with setProgress(...) calls in metaHarvesterWorkflow.ts.
export const TRENDS_STAGE_PROGRESS: Record<TrendsStage, number> = {
  awaiting_strategic_analysis: 1,
  queued: 1,
  scraping: 8,
  raw_search: 34,
  synthesis: 58,
  web_enrichment: 67,
  questions: 76,
  secondary_platform_eval: 84,
  persisting: 90,
  completed: 100,
  failed: 100,
};

export function trendsStageLabel(stage: string | null | undefined): string {
  if (stage && stage in TRENDS_STAGE_LABELS) {
    return TRENDS_STAGE_LABELS[stage as TrendsStage];
  }
  return 'Working';
}

export const trendsGenerationStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type TrendsGenerationStatus = z.infer<typeof trendsGenerationStatusSchema>;

export const trendsGenerationEventTypeSchema = z.enum([
  'job_started',
  'status_update',
  'job_completed',
  'job_failed',
]);
export type TrendsGenerationEventType = z.infer<typeof trendsGenerationEventTypeSchema>;

// Runtime telemetry attached to status_update / terminal event payloads. Drives
// the Frontend "~Xs remaining" estimate.
export const trendsRuntimeSchema = z.object({
  elapsed_ms: z.number().nonnegative(),
  remaining_ms: z.number().nonnegative(),
  max_duration_ms: z.number().positive(),
});
export type TrendsRuntime = z.infer<typeof trendsRuntimeSchema>;

/**
 * Durable, terminal-only timing data for a server-authoritative Trends run.
 * It deliberately records lane/tool activity as observations, not client
 * controlled progress, so benchmarks can attribute latency after completion.
 */
export const trendsGenerationTelemetrySchema = z.object({
  version: z.literal(1),
  total_duration_ms: z.number().nonnegative(),
  stages: z.array(
    z.object({
      name: z.string().min(1),
      attempt: z.number().int().positive(),
      duration_ms: z.number().nonnegative(),
      ok: z.boolean(),
    }),
  ),
  lanes: z.record(z.string(), z.record(z.string(), z.unknown())),
  evidence: z.object({
    mode: z.enum(['social', 'shared_web', 'heuristic']),
    quality_gate: z.enum(['social_sufficient', 'social_insufficient']),
    cache_status: z.enum(['not_applicable', 'hit', 'miss']),
    /** Total cited evidence available to the generation. */
    item_count: z.number().int().nonnegative(),
    /** Cited web research shards available to the generation. */
    web_item_count: z.number().int().nonnegative(),
    /** Cited, curated social evidence available to the generation. */
    social_item_count: z.number().int().nonnegative(),
    /** Raw social signals considered by the server-side curator. */
    social_signal_count: z.number().int().nonnegative(),
    queries: z.array(z.string()),
    provider_outcomes: z.array(z.unknown()),
    warnings: z.array(z.string()),
  }),
});
export type TrendsGenerationTelemetry = z.infer<typeof trendsGenerationTelemetrySchema>;

// Canonical in-process generation event (camelCase). The Backend's
// TrendsGenerationEvent IS this type; publish/subscribe and Redis relay use it.
export const trendsGenerationEventSchema = z.object({
  generationId: z.string().min(1),
  brandId: z.string().min(1),
  messageId: z.number().int().nullable(),
  queueMessageId: z.number().int().nullable(),
  eventType: trendsGenerationEventTypeSchema,
  status: trendsGenerationStatusSchema,
  stage: z.string().nullable(),
  progressPercent: z.number().nullable(),
  stageMessage: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type TrendsGenerationEvent = z.infer<typeof trendsGenerationEventSchema>;

// SSE `message` event payload as it crosses the wire (snake_case). The Frontend
// safeParses against this at the boundary before mapping into UI state.
export const trendsSseMessageDataSchema = z
  .object({
    generation_id: z.string().min(1),
    message_id: z.number().int().nullable().optional(),
    queue_message_id: z.number().int().nullable().optional(),
    event_type: trendsGenerationEventTypeSchema,
    status: trendsGenerationStatusSchema,
    stage: z.string().nullable().optional(),
    progress_percent: z.number().nullable().optional(),
    stage_message: z.string().nullable().optional(),
    payload: z
      .object({
        runtime: trendsRuntimeSchema.optional(),
        generation_telemetry: trendsGenerationTelemetrySchema.optional(),
      })
      .loose()
      .optional(),
    created_at: z.string().optional(),
  })
  .loose();
export type TrendsSseMessageData = z.infer<typeof trendsSseMessageDataSchema>;

// SSE `snapshot` event payload (from toGenerationResponseData). Loose because it
// carries many optional observability fields the UI ignores.
export const trendsSseSnapshotDataSchema = z
  .object({
    generation_id: z.string().min(1),
    brand_id: z.string().optional(),
    status: z.string(),
    stage: z.string().nullable().optional(),
    progress_percent: z.number().nullable().optional(),
    stage_message: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
  })
  .loose();
export type TrendsSseSnapshotData = z.infer<typeof trendsSseSnapshotDataSchema>;

/**
 * Immutable, completed-generation read frames. Unlike the job SSE stream these
 * frames never expose in-flight synthesis: the server resolves a completed
 * generation before it writes the snapshot frame, then shards the independent
 * persisted sections so the UI can render whichever query completes first.
 */
export const trendsReadSectionSchema = z.enum(['trends', 'events', 'questions']);
export type TrendsReadSection = z.infer<typeof trendsReadSectionSchema>;

const trendsReadFrameBaseSchema = z.object({
  eventId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
});

export const trendsReadFrameSchema = z.discriminatedUnion('type', [
  trendsReadFrameBaseSchema.extend({
    type: z.literal('trends.read.snapshot'),
    data: z.object({
      brandId: z.string().uuid(),
      generationId: z.string().uuid(),
      anchorTs: z.string().min(1),
    }),
  }),
  trendsReadFrameBaseSchema.extend({
    type: z.literal('trends.read.section'),
    data: z.object({
      section: trendsReadSectionSchema,
      items: z.array(z.unknown()),
      count: z.number().int().nonnegative(),
    }),
  }),
  trendsReadFrameBaseSchema.extend({
    type: z.literal('trends.read.section_error'),
    data: z.object({
      section: trendsReadSectionSchema,
      code: z.string().min(1),
    }),
  }),
  trendsReadFrameBaseSchema.extend({
    type: z.literal('trends.read.done'),
    data: z.object({
      complete: z.boolean(),
      failedSections: z.array(trendsReadSectionSchema),
    }),
  }),
]);
export type TrendsReadFrame = z.infer<typeof trendsReadFrameSchema>;

// POST /api/trends/jobs/start response envelope. Loose union of the "processing"
// (new job + stream channel) and "reused_generation" (fresh <5d cache) variants.
export const trendsJobStartResponseSchema = z
  .object({
    status: z.string(),
    message: z.string().optional(),
    data: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .loose();
export type TrendsJobStartResponse = z.infer<typeof trendsJobStartResponseSchema>;
