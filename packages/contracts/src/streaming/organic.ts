import { z } from "zod";

const jobEventDataSchema = z.object({
  jobId: z.string().min(1),
  brandId: z.string().min(1),
}).loose();

const uiCardDataSchema = z.record(z.string(), z.unknown());

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
  agentRunStartedSchema,
  agentChatStartedSchema,
  jobEnqueuedSchema,
  jobProgressSchema,
  jobCompletedSchema,
  jobFailedSchema,
  jobCancelledSchema,
  draftReadySchema,
]);

export type OrganicStreamFrame = z.infer<typeof organicStreamFrameSchema>;

export type OrganicJobEventData = z.infer<typeof jobEventDataSchema>;

export type OrganicFrameType = OrganicStreamFrame["type"];
