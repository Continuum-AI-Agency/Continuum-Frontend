import type {
  AgentJobState,
  ConversationMessage,
  PipelineCardState,
  PipelineStage,
  PipelineStageNode,
  PipelineStageNodeStatus,
  PlanItemStatus,
  ToolApproval,
  ToolCallEvent,
  UiCard,
} from "./types"
import { PIPELINE_STAGES } from "./types"
import type { ParsedPipelineStage, ParsedPlanStatus } from "./streamEventParser"
import type { AgentMentionMetadata } from "@/lib/agent-references"
import type { MediaSearchResultsFrame } from "@continuum/contracts"

export type BulkRunRef = { runId: string; planId: string; total: number }

export type PanelState = {
  sessionId: string | null
  messages: ConversationMessage[]
  inputValue: string
  isHydrated: boolean
  jobs: Record<string, AgentJobState>
  pipeline: Record<string, PipelineCardState>
  planItemStatus: Record<string, PlanItemStatus>
  pendingToolApprovals: ToolApproval[]
  bulkRuns: Record<string, BulkRunRef>
  streamingMessageId: string | null
}

export type PanelAction =
  | { type: "SESSION_INIT"; sessionId: string }
  | { type: "HYDRATE_JOBS"; jobs: AgentJobState[] }
  | { type: "SET_INPUT"; value: string }
  | { type: "SUBMIT_USER_MESSAGE"; content: string; messageId: string; metadata?: AgentMentionMetadata }
  | { type: "BEGIN_STREAMING" }
  | { type: "STREAM_DELTA"; delta: string }
  | { type: "STREAM_TOOL_CALL"; event: ToolCallEvent }
  | { type: "STREAM_TOOL_RESULT"; toolCallId: string; result: unknown; ok?: boolean; reason?: string }
  | { type: "STREAM_COMPLETE" }
  | { type: "STREAM_ERROR"; error: string }
  | { type: "RETRY_FROM_ASSISTANT"; assistantMessageId: string }
  | { type: "STREAM_UI_CARD"; card: UiCard }
  | { type: "STREAM_MEDIA_SEARCH_RESULTS"; frame: MediaSearchResultsFrame }
  | { type: "JOB_UPDATE"; job: Partial<AgentJobState> & { jobId: string } }
  | { type: "DRAFT_BLUEPRINT"; draftId: string; previews: string[] }
  | { type: "PIPELINE_STAGE"; event: ParsedPipelineStage }
  | { type: "PIPELINE_CARD"; card: Partial<PipelineCardState> & { jobId: string } }
  | { type: "PLAN_STATUS"; event: ParsedPlanStatus }
  | { type: "TOOL_APPROVAL_ADD"; approval: ToolApproval }
  | { type: "TOOL_APPROVAL_RESOLVE"; approvalId: string }
  | { type: "BULK_RUN_START"; run: BulkRunRef }
  | { type: "SESSION_SWITCH"; sessionId: string; messages: ConversationMessage[] }
  | { type: "LOAD_MESSAGES_START" }

const STAGE_ORDER: readonly PipelineStage[] = PIPELINE_STAGES

// Unique per assistant turn. A random suffix avoids same-millisecond collisions
// (two turns opened in the same tick would otherwise share an id and a React key).
function newAssistantMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-assistant`
}

function buildStages(
  currentStage: PipelineStage,
  currentStatus: PipelineStageNodeStatus,
  agentName?: string,
): PipelineStageNode[] {
  const idx = STAGE_ORDER.indexOf(currentStage)
  return STAGE_ORDER.map((stage, i) => {
    if (i < idx) return { stage, status: "done" as const }
    if (i === idx) return { stage, status: currentStatus, agentName }
    return { stage, status: "pending" as const }
  })
}

function applyPipelineStage(
  prev: PipelineCardState | undefined,
  ev: ParsedPipelineStage,
): PipelineCardState {
  const nodeStatus: PipelineStageNodeStatus =
    ev.status === "done" ? "done" : ev.status === "failed" ? "failed" : "active"
  const terminal =
    prev?.status === "completed" || prev?.status === "failed" || prev?.status === "cancelled"
  return {
    jobId: ev.jobId,
    brandId: ev.brandId ?? prev?.brandId,
    planId: ev.planId ?? prev?.planId ?? null,
    planItemId: ev.planItemId ?? prev?.planItemId ?? null,
    platform: prev?.platform,
    stages: terminal && prev ? prev.stages : buildStages(ev.stage, nodeStatus, ev.agentName),
    currentStage: ev.stage,
    pct: ev.pct ?? prev?.pct,
    status: terminal && prev ? prev.status : "running",
    preview: prev?.preview,
    quality: prev?.quality,
    draftId: prev?.draftId,
    error: prev?.error,
  }
}

function applyPipelineCard(
  prev: PipelineCardState | undefined,
  card: Partial<PipelineCardState> & { jobId: string },
): PipelineCardState {
  const base: PipelineCardState =
    prev ?? {
      jobId: card.jobId,
      stages: STAGE_ORDER.map((stage) => ({ stage, status: "pending" as const })),
      status: "running",
    }

  let stages = base.stages
  if (card.status === "completed") {
    stages = STAGE_ORDER.map((stage) => ({ stage, status: "done" as const }))
  } else if (card.status === "failed") {
    const failStage = card.currentStage ?? base.currentStage
    stages = base.stages.map((s) =>
      s.stage === failStage ? { ...s, status: "failed" as const } : s,
    )
  }

  return {
    ...base,
    ...card,
    stages,
    pct: card.status === "completed" ? 100 : base.pct,
    quality: card.quality ?? base.quality,
    preview: card.preview ?? base.preview,
    // Merge checkpoint fields so a later card update that omits checkpoint
    // doesn't wipe out textReady/blueprintReady received on an earlier frame.
    checkpoint: card.checkpoint
      ? { ...base.checkpoint, ...card.checkpoint }
      : base.checkpoint,
  }
}

const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "cancelled"])

// Keep the coarse job status (JobGrid) in lockstep with live pipeline progress so
// a card never reads "Queued" while its pipeline is actively advancing. Only
// touches an existing job and never regresses one that has already finished.
function reconcileJobFromPipeline(
  jobs: Record<string, AgentJobState>,
  jobId: string,
  patch: Partial<AgentJobState>,
): Record<string, AgentJobState> {
  const existing = jobs[jobId]
  if (!existing || TERMINAL_JOB_STATUSES.has(existing.status)) return jobs
  return { ...jobs, [jobId]: { ...existing, ...patch } }
}

export function initialPanelState(): PanelState {
  return {
    sessionId: null,
    messages: [],
    inputValue: "",
    isHydrated: false,
    jobs: {},
    pipeline: {},
    planItemStatus: {},
    pendingToolApprovals: [],
    bulkRuns: {},
    streamingMessageId: null,
  }
}

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "SESSION_INIT":
      return { ...state, sessionId: action.sessionId }

    case "HYDRATE_JOBS": {
      const merged = { ...state.jobs }
      const jobs = Array.isArray(action.jobs) ? action.jobs : []
      for (const job of jobs) {
        if (!job || typeof job.jobId !== "string") continue
        merged[job.jobId] = job
      }
      return { ...state, jobs: merged, isHydrated: true }
    }

    case "SET_INPUT":
      return { ...state, inputValue: action.value }

    case "SUBMIT_USER_MESSAGE": {
      const streamingId = newAssistantMessageId()
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.messageId, role: "user", content: action.content, metadata: action.metadata },
          { id: streamingId, role: "assistant", content: "" },
        ],
        streamingMessageId: streamingId,
        inputValue: "",
      }
    }

    case "BEGIN_STREAMING": {
      const streamingId = newAssistantMessageId()
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: streamingId, role: "assistant" as const, content: "" },
        ],
        streamingMessageId: streamingId,
      }
    }

    case "STREAM_DELTA":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, content: m.content + action.delta }
            : m
        ),
      }

    case "STREAM_TOOL_CALL":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), action.event] }
            : m
        ),
      }

    case "STREAM_TOOL_RESULT":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.toolCallId === action.toolCallId
                    ? { ...tc, result: action.result, ok: action.ok, reason: action.reason }
                    : tc
                ),
              }
            : m
        ),
      }

    case "STREAM_UI_CARD":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, uiCards: [...(m.uiCards ?? []), action.card] }
            : m
        ),
      }

    case "STREAM_MEDIA_SEARCH_RESULTS":
      if (!state.streamingMessageId) return state
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, mediaSearchResults: [...(m.mediaSearchResults ?? []), action.frame] }
            : m
        ),
      }

    case "STREAM_COMPLETE":
      return { ...state, streamingMessageId: null }

    case "STREAM_ERROR":
      return {
        ...state,
        streamingMessageId: null,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId ? { ...m, error: action.error } : m
        ),
      }

    case "RETRY_FROM_ASSISTANT": {
      // Drop the failed/stale assistant turn (and anything after it) and re-open
      // a fresh empty assistant message; the caller re-runs the prior user turn.
      const idx = state.messages.findIndex((m) => m.id === action.assistantMessageId)
      if (idx === -1) return state
      const streamingId = newAssistantMessageId()
      return {
        ...state,
        messages: [
          ...state.messages.slice(0, idx),
          { id: streamingId, role: "assistant" as const, content: "" },
        ],
        streamingMessageId: streamingId,
      }
    }

    case "JOB_UPDATE":
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.job.jobId]: {
            ...(state.jobs[action.job.jobId] ?? {}),
            ...action.job,
          } as AgentJobState,
        },
      }

    case "PIPELINE_STAGE":
      return {
        ...state,
        pipeline: {
          ...state.pipeline,
          [action.event.jobId]: applyPipelineStage(state.pipeline[action.event.jobId], action.event),
        },
        jobs: reconcileJobFromPipeline(state.jobs, action.event.jobId, {
          status: action.event.status === "failed" ? "failed" : "running",
          stage: action.event.stage,
          agentName: action.event.agentName,
          ...(typeof action.event.pct === "number" ? { pct: action.event.pct } : {}),
        }),
      }

    case "PIPELINE_CARD":
      return {
        ...state,
        pipeline: {
          ...state.pipeline,
          [action.card.jobId]: applyPipelineCard(state.pipeline[action.card.jobId], action.card),
        },
        jobs:
          action.card.status === "running"
            ? reconcileJobFromPipeline(state.jobs, action.card.jobId, {
                status: "running",
                ...(action.card.currentStage ? { stage: action.card.currentStage } : {}),
                ...(typeof action.card.pct === "number" ? { pct: action.card.pct } : {}),
              })
            : state.jobs,
      }

    case "DRAFT_BLUEPRINT": {
      const { draftId, previews } = action
      if (!draftId || previews.length === 0) return state
      // The blueprint job's own jobId differs from the post-generation card, so
      // match by draftId: stamp the storyboard onto that card's preview images and
      // the job's thumbnail, and confirm the blueprint checkpoint step.
      let pipelineChanged = false
      const pipeline: Record<string, PipelineCardState> = {}
      for (const [jobId, card] of Object.entries(state.pipeline)) {
        if (card.draftId === draftId) {
          pipelineChanged = true
          pipeline[jobId] = {
            ...card,
            preview: {
              caption: card.preview?.caption ?? null,
              imageUrl: card.preview?.imageUrl ?? previews[0] ?? null,
              images: previews,
              format: card.preview?.format ?? null,
            },
            checkpoint: { ...card.checkpoint, blueprintReady: true },
          }
        } else {
          pipeline[jobId] = card
        }
      }

      let jobsChanged = false
      const jobs: Record<string, AgentJobState> = {}
      for (const [jobId, job] of Object.entries(state.jobs)) {
        if (job.draftId === draftId) {
          jobsChanged = true
          jobs[jobId] = { ...job, previewImages: previews }
        } else {
          jobs[jobId] = job
        }
      }

      if (!pipelineChanged && !jobsChanged) return state
      return {
        ...state,
        pipeline: pipelineChanged ? pipeline : state.pipeline,
        jobs: jobsChanged ? jobs : state.jobs,
      }
    }

    case "PLAN_STATUS":
      return {
        ...state,
        planItemStatus: {
          ...state.planItemStatus,
          [action.event.itemId]: action.event.status,
        },
      }

    case "TOOL_APPROVAL_ADD":
      if (state.pendingToolApprovals.some((a) => a.approvalId === action.approval.approvalId)) {
        return state
      }
      return {
        ...state,
        pendingToolApprovals: [...state.pendingToolApprovals, action.approval],
      }

    case "TOOL_APPROVAL_RESOLVE":
      return {
        ...state,
        pendingToolApprovals: state.pendingToolApprovals.filter(
          (a) => a.approvalId !== action.approvalId,
        ),
      }

    case "BULK_RUN_START":
      return {
        ...state,
        bulkRuns: { ...state.bulkRuns, [action.run.runId]: action.run },
      }

    case "LOAD_MESSAGES_START":
      return {
        ...state,
        messages: [],
        jobs: {},
        pipeline: {},
        planItemStatus: {},
        pendingToolApprovals: [],
        bulkRuns: {},
        streamingMessageId: null,
        isHydrated: false,
      }

    case "SESSION_SWITCH":
      return {
        ...initialPanelState(),
        sessionId: action.sessionId,
        messages: action.messages,
        isHydrated: true,
      }

    default:
      return state
  }
}
