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

export type PipelineStage = z.infer<typeof pipelineStageEnum>;

/**
 * Per-plan-item creative brief the planner attaches so a content job can skip
 * the strategist stage. Canonical shape shared by the Backend content runner and
 * the Frontend response interpreter. Not strict: unknown keys are stripped (not
 * rejected) so a rolling deploy that adds a field never breaks an older peer.
 */
export const creativeBriefSchema = z.object({
  contentObjective: z.string(),
  targetAudience: z.string(),
  angle: z.string(),
  trendIntegration: z.string().nullable(),
  toneAndVoice: z.string(),
  // Optional funnel stage the upstream agent can delegate. When present the
  // generation engine builds the placement brief deterministically (and skips
  // platform_strategist); when absent it defaults. Kept optional so older peers
  // and plan items without it keep parsing under a rolling deploy.
  funnelStage: z.enum(["top", "middle", "bottom", "retention"]).optional(),
  formatSuggestion: z.enum(["reel", "post", "carousel", "story", "hyperframe"]),
  productionNotes: z.array(z.string()),
});
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;

// --- Canonical agent plan schemas ------------------------------------------
// Moved here from Backend App/organic/agent/src/agents/planSchema.ts so the
// Frontend response interpreter validates plan cards against the same source
// instead of hand-parsing. The Backend re-exports these (PascalCase aliases).
export const planItemStatusSchema = z.enum([
  "pending",
  "executing",
  "completed",
  "failed",
  "cancelled",
]);
export type PlanItemStatus = z.infer<typeof planItemStatusSchema>;

export const planItemSchema = z.object({
  itemId: z.string().describe("uuid; agent-generated"),
  kind: z.enum(["create_post", "create_draft", "edit_draft", "publish_draft"]),
  platform: z.enum(["instagram", "facebook", "linkedin", "tiktok", "youtube"]),
  scheduledAt: z.string().describe("ISO datetime"),
  format: z.enum(["reel", "post", "carousel", "story", "hyperframe"]).nullable(),
  // trend_id is a uuid FK column. The planner sometimes emits a slug derived
  // from the trend title; coerce anything that isn't a real uuid to null.
  trendId: z.string().uuid().nullable().catch(null),
  trendTitle: z.string().nullable(),
  angle: z.string().describe("1-line creative direction"),
  objective: z.enum(["follow", "save", "click", "comment", "dm", "share"]),
  audienceSegment: z.string(),
  rationale: z.string().describe("Why this item, evidence-cited"),
  guidancePrompt: z.string().nullable(),
  draftId: z.string().nullable().describe("For edit_draft / publish_draft, or once executed"),
  jobId: z.string().nullable().default(null).describe("Filled after createPost fires"),
  dependsOn: z.array(z.string()).default([]).describe("itemId references"),
  status: planItemStatusSchema.default("pending"),
  creativeBrief: creativeBriefSchema.nullable().default(null).describe(
    "Pre-resolved creative brief for this item. When present, the content job skips the strategist stage.",
  ),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const planEvidenceSchema = z.object({
  kind: z.enum(["trend", "metric", "competitor", "past_draft", "brand_doc"]),
  refId: z.string().nullable(),
  summary: z.string(),
});
export type PlanEvidence = z.infer<typeof planEvidenceSchema>;

export const planStatusSchema = z.enum([
  "proposed",
  "approved",
  "edited",
  "rejected",
  "executing",
  "completed",
  "failed",
  "cancelled",
]);
export type PlanStatus = z.infer<typeof planStatusSchema>;

export const proposedPlanSchema = z.object({
  planId: z.string().describe("uuid"),
  sessionId: z.string(),
  brandId: z.string(),
  userId: z.string(),
  weekStart: z.string().describe("YYYY-MM-DD"),
  title: z.string().describe('e.g. "Back-to-school week — IG focus"'),
  summary: z.string().describe("2-3 line overview"),
  items: z.array(planItemSchema).min(1).max(12).describe("Soft cap 12 items per plan"),
  evidence: z.array(planEvidenceSchema).default([]),
  estimatedDurationSeconds: z.number().int().nonnegative(),
  status: planStatusSchema.default("proposed"),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type ProposedPlan = z.infer<typeof proposedPlanSchema>;

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
 * Emitted when the agent proposes saving a reusable brand skill (propose_skill
 * tool). The FE renders a confirm/edit card; persistence is user-gated (Save ->
 * POST /api/organic/skills). The agent does not persist.
 */
const uiSkillProposalSchema = z.object({
  type: z.literal("ui.skill_proposal"),
  data: z.object({
    proposalId: z.string().min(1),
    brandId: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["creative_direction", "analytic"]),
    description: z.string().nullable().optional(),
    directives: z.string().min(1),
    tags: z.array(z.string()).default([]),
  }).loose(),
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

// Step-1 checkpoint of the three-step pipeline: the post's caption/text is
// persisted as a draft (status placeholder) BEFORE the creative director
// (blueprint) and the opt-in headless media generation. Carries the draftId so
// the FE can surface a real, placeable draft mid-run.
const draftTextReadySchema = z.object({
  type: z.literal("draft.text_ready"),
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
    // Three-step checkpoint state for the run-progress steppers: step 1 (text) =
    // textReady, step 2 (creative director / blueprint) = blueprintReady, step 3
    // (headless media generation) = mediaStatus. `awaitingMediaChoice` is true
    // once text+blueprint are done and the token-heavy generation is opt-in.
    checkpoint: z.object({
      textReady: z.boolean().optional(),
      blueprintReady: z.boolean().optional(),
      mediaStatus: z.enum(["pending", "generating", "ready", "user_supplied", "skipped"]).optional(),
      awaitingMediaChoice: z.boolean().optional(),
    }).loose().optional(),
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
  uiSkillProposalSchema,
  uiBulkRunSchema,
  agentRunStartedSchema,
  agentChatStartedSchema,
  jobEnqueuedSchema,
  jobProgressSchema,
  jobCompletedSchema,
  jobFailedSchema,
  jobCancelledSchema,
  draftReadySchema,
  draftTextReadySchema,
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

export type OrganicCreativeBrief = z.infer<typeof creativeBriefSchema>;

export type OrganicUiBulkRunFrame = z.infer<typeof uiBulkRunSchema>;

/**
 * Normalized display shape for a post fetched by any of the organic agent's
 * content-retrieval tools (listDrafts, getTopPosts, listOwnInstagramMedia,
 * getCalendarPostedContent, rankPostPerformers). Consumed by PostContentCard.
 */
export type UiFetchedPost = {
  postId: string
  source: "draft" | "instagram" | "facebook" | "tiktok"
  platform: string | null
  caption: string | null
  mediaUrl: string | null
  permalink: string | null
  postedAt: string | null
  scheduledAt: string | null
  format: string | null
  status: string | null
  topic: string | null
  metrics: Record<string, number | null> | null
  rank: number | null
  quality: { passed: boolean; score?: number } | null
}

export const POST_FETCHING_TOOL_NAMES = [
  "listDrafts",
  "getTopPosts",
  "listOwnInstagramMedia",
  "getCalendarPostedContent",
  "rankPostPerformers",
  "getCompetitorInstagramTopPosts",
] as const

export type PostFetchingToolName = (typeof POST_FETCHING_TOOL_NAMES)[number]
