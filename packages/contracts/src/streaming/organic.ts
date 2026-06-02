import { z } from "zod";
import { mediaSearchResultsFrameSchema } from "./media";

const jobEventDataSchema = z.object({
  jobId: z.string().min(1),
  brandId: z.string().min(1),
}).loose();

const uiCardDataSchema = z.record(z.string(), z.unknown());

/**
 * Canonical ordered content-creation pipeline timeline. The backend content
 * runner's raw stages collapse onto these six steps; the Frontend renders one
 * timeline node per member, in this order.
 */
export const pipelineStageEnum = z.enum([
  "strategist",
  "concept",
  "draft",
  "assets",
  "quality",
  "merge",
]);

/**
 * Per-plan-item creative brief the planner attaches so a content job can skip
 * the strategist stage. Mirrors the Backend content runner's CreativeBrief.
 */
export const organicCreativeBriefSchema = z.object({
  contentObjective: z.string(),
  targetAudience: z.string(),
  angle: z.string(),
  trendIntegration: z.string().nullable(),
  toneAndVoice: z.string(),
  formatSuggestion: z.enum(["reel", "post", "carousel", "story", "hyperframe"]),
  productionNotes: z.array(z.string()),
}).strict();

const responseCreatedSchema = z.object({
  type: z.literal("response.created"),
  data: z.object({ responseId: z.string().optional() }).loose(),
});

const responseOutputTextDeltaSchema = z.object({
  type: z.literal("response.output_text.delta"),
  data: z.object({ delta: z.string() }).loose(),
});

const responseOutputTextDoneSchema = z.object({
  type: z.literal("response.output_text.done"),
  data: z.record(z.string(), z.unknown()),
});

const responseDoneSchema = z.object({
  type: z.literal("response.done"),
  data: z.record(z.string(), z.unknown()).optional(),
});

const responseErrorSchema = z.object({
  type: z.literal("response.error"),
  data: z.object({ message: z.string() }).loose(),
});

const responseSourceSchema = z.object({
  type: z.literal("response.source"),
  data: z.record(z.string(), z.unknown()).optional(),
});

const toolCallSchema = z.object({
  type: z.literal("tool.call"),
  data: z.object({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    args: z.unknown(),
  }).loose(),
});

const toolResultSchema = z.object({
  type: z.literal("tool.result"),
  data: z.object({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
  }).loose(),
});

const toolApprovalRequiredSchema = z.object({
  type: z.literal("tool.approval_required"),
  data: z.object({
    approvalId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    input: z.unknown(),
  }).loose(),
});

const toolErrorSchema = z.object({
  type: z.literal("tool.error"),
  data: z.object({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    error: z.string(),
  }).loose(),
});

const toolOutputDeniedSchema = z.object({
  type: z.literal("tool.output_denied"),
  data: z.object({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
  }).loose(),
});

const uiTrendChartSchema = z.object({
  type: z.literal("ui.trend_chart"),
  data: uiCardDataSchema,
});

const uiPlanCardSchema = z.object({
  type: z.literal("ui.plan_card"),
  data: uiCardDataSchema,
});

const uiPostCardSchema = z.object({
  type: z.literal("ui.post_card"),
  data: uiCardDataSchema,
});

const uiPostEnqueuedSchema = z.object({
  type: z.literal("ui.post_enqueued"),
  data: uiCardDataSchema,
});

const uiPlanStatusSchema = z.object({
  type: z.literal("ui.plan_status"),
  data: uiCardDataSchema,
});

/**
 * Emitted when an approved BULK plan kicks off its single background `runV2`
 * batch run. Carries the runId the FE BulkRunPanel uses to stream aggregate
 * progress from the batch run-events replay endpoint (the bulk run does NOT
 * pipe its v2 envelopes through this chat stream). `total` is the placement
 * count for the run.
 */
const uiBulkRunSchema = z.object({
  type: z.literal("ui.bulk_run"),
  data: z.object({
    runId: z.string().min(1),
    planId: z.string().min(1),
    brandId: z.string().min(1),
    total: z.number().int().min(0),
  }).loose(),
});

const agentRunStartedSchema = z.object({
  type: z.literal("agent.run_started"),
  data: z.object({
    runId: z.string().min(1),
    jobId: z.string().optional(),
  }).loose(),
});

/**
 * Emitted as the first frame of an Organic chat stream. Carries the runId
 * the FE needs to reconnect via GET /api/organic/agent/runs/:runId/events
 * after a transport interruption. Distinct from agent.run_started, which
 * carries a per-tool jobId mid-stream.
 */
const agentChatStartedSchema = z.object({
  type: z.literal("agent.chat_started"),
  data: z.object({
    runId: z.string().min(1),
    sessionId: z.string().min(1),
  }).loose(),
});

const jobEnqueuedSchema = z.object({
  type: z.literal("job.enqueued"),
  data: jobEventDataSchema,
});

const jobProgressSchema = z.object({
  type: z.literal("job.progress"),
  data: jobEventDataSchema,
});

const jobCompletedSchema = z.object({
  type: z.literal("job.completed"),
  data: jobEventDataSchema,
});

const jobFailedSchema = z.object({
  type: z.literal("job.failed"),
  data: jobEventDataSchema,
});

const jobCancelledSchema = z.object({
  type: z.literal("job.cancelled"),
  data: jobEventDataSchema,
});

const draftReadySchema = z.object({
  type: z.literal("draft.ready"),
  data: jobEventDataSchema,
});

const pipelineStageSchema = z.object({
  type: z.literal("pipeline.stage"),
  data: z.object({
    jobId: z.string().min(1),
    brandId: z.string().min(1),
    planId: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
    stage: pipelineStageEnum,
    agentName: z.string().optional(),
    pct: z.number().min(0).max(100).optional(),
    status: z.enum(["active", "done", "failed"]).optional(),
  }).loose(),
});

const pipelineQualitySchema = z.object({
  passed: z.boolean(),
  overallScore: z.number(),
  brandFitScore: z.number().optional(),
  platformFitScore: z.number().optional(),
  noveltyScore: z.number().optional(),
  complianceScore: z.number().optional(),
  summary: z.string().optional(),
}).loose();

const uiPipelineCardSchema = z.object({
  type: z.literal("ui.pipeline_card"),
  data: z.object({
    jobId: z.string().min(1),
    brandId: z.string().min(1),
    planId: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
    platform: z.string().optional(),
    status: z.enum(["running", "completed", "failed", "cancelled"]),
    currentStage: pipelineStageEnum.optional(),
    preview: z.object({
      caption: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      images: z.array(z.string()).optional(),
      format: z.string().nullable().optional(),
    }).loose().optional(),
    quality: pipelineQualitySchema.nullable().optional(),
    draftId: z.string().nullable().optional(),
  }).loose(),
});

export const organicStreamFrameSchema = z.discriminatedUnion("type", [
  responseCreatedSchema,
  responseOutputTextDeltaSchema,
  responseOutputTextDoneSchema,
  responseDoneSchema,
  responseErrorSchema,
  responseSourceSchema,
  toolCallSchema,
  toolResultSchema,
  toolApprovalRequiredSchema,
  toolErrorSchema,
  toolOutputDeniedSchema,
  uiTrendChartSchema,
  uiPlanCardSchema,
  uiPostCardSchema,
  uiPostEnqueuedSchema,
  uiPlanStatusSchema,
  uiBulkRunSchema,
  agentRunStartedSchema,
  agentChatStartedSchema,
  jobEnqueuedSchema,
  jobProgressSchema,
  jobCompletedSchema,
  jobFailedSchema,
  jobCancelledSchema,
  draftReadySchema,
  pipelineStageSchema,
  uiPipelineCardSchema,
  mediaSearchResultsFrameSchema,
]);

export type OrganicStreamFrame = z.infer<typeof organicStreamFrameSchema>;

export type OrganicJobEventData = z.infer<typeof jobEventDataSchema>;

export type OrganicFrameType = OrganicStreamFrame["type"];

export type OrganicPipelineStage = z.infer<typeof pipelineStageEnum>;

export type OrganicPipelineStageFrame = z.infer<typeof pipelineStageSchema>;

export type OrganicUiPipelineCardFrame = z.infer<typeof uiPipelineCardSchema>;

export type OrganicCreativeBrief = z.infer<typeof organicCreativeBriefSchema>;

export type OrganicUiBulkRunFrame = z.infer<typeof uiBulkRunSchema>;
