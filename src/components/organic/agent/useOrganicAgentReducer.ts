import type { MediaSearchResultsFrame, OrganicGenerationSummary } from '@continuum/contracts';
import { prependUnseen } from '@/components/chat/useEarlierHistory';
import type { AgentMentionMetadata } from '@/lib/agent-references';
import type { ParsedPipelineStage, ParsedPlanStatus } from './streamEventParser';
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
} from './types';
import { PIPELINE_STAGES } from './types';

export type BulkRunRef = { runId: string; planId: string; total: number };

export type MediaResolutionFailure = {
  refId: string;
  type: string;
  reason: string;
};

export type MediaResolutionReport = {
  requested: number;
  resolvedImages: number;
  resolvedVideos: number;
  textOnly: number;
  failed: MediaResolutionFailure[];
};

export type PanelState = {
  sessionId: string | null;
  messages: ConversationMessage[];
  inputValue: string;
  isHydrated: boolean;
  jobs: Record<string, AgentJobState>;
  pipeline: Record<string, PipelineCardState>;
  pendingJobCancellations: Record<
    string,
    { job: AgentJobState; pipeline?: PipelineCardState }
  >;
  planItemStatus: Record<string, PlanItemStatus>;
  pendingToolApprovals: ToolApproval[];
  bulkRuns: Record<string, BulkRunRef>;
  streamingMessageId: string | null;
  /** Non-fatal grab misses for the latest turn (surfaced as a loud UI warning). */
  mediaResolution: MediaResolutionReport | null;
  /**
   * How many runs are ahead of this turn on the same session, or null when it is running.
   * One run at a time per session is fenced Backend-side; a queued turn is waiting, not
   * hung, and the UI must be able to say which.
   */
  queuedAheadOf: number | null;
};

export type PanelAction =
  | { type: 'SESSION_INIT'; sessionId: string }
  | { type: 'HYDRATE_JOBS'; jobs: AgentJobState[] }
  | { type: 'SET_INPUT'; value: string }
  | {
      type: 'SUBMIT_USER_MESSAGE';
      content: string;
      messageId: string;
      metadata?: AgentMentionMetadata;
    }
  | { type: 'BEGIN_STREAMING' }
  | { type: 'STREAM_DELTA'; delta: string }
  | { type: 'STREAM_TOOL_CALL'; event: ToolCallEvent }
  | {
      type: 'STREAM_TOOL_RESULT';
      toolCallId: string;
      result: unknown;
      ok?: boolean;
      reason?: string;
    }
  | { type: 'STREAM_COMPLETE' }
  | { type: 'STREAM_ERROR'; error: string }
  | { type: 'STREAM_QUEUED'; aheadOf: number }
  | { type: 'RESUME_STREAMING'; messageId: string }
  | { type: 'RETRY_FROM_ASSISTANT'; assistantMessageId: string }
  | { type: 'STREAM_UI_CARD'; card: UiCard }
  | { type: 'STREAM_MEDIA_SEARCH_RESULTS'; frame: MediaSearchResultsFrame }
  | { type: 'JOB_UPDATE'; job: Partial<AgentJobState> & { jobId: string } }
  | { type: 'JOB_CANCEL_START'; jobId: string }
  | { type: 'JOB_CANCEL_SUCCESS'; jobId: string }
  | { type: 'JOB_CANCEL_FAILURE'; jobId: string }
  | { type: 'DRAFT_BLUEPRINT'; draftId: string; previews: string[] }
  | { type: 'PIPELINE_STAGE'; event: ParsedPipelineStage }
  | { type: 'PIPELINE_CARD'; card: Partial<PipelineCardState> & { jobId: string } }
  | { type: 'PLAN_STATUS'; event: ParsedPlanStatus }
  | { type: 'TOOL_APPROVAL_ADD'; approval: ToolApproval }
  | { type: 'TOOL_APPROVAL_RESOLVE'; approvalId: string }
  | { type: 'BULK_RUN_START'; run: BulkRunRef }
  | { type: 'MEDIA_RESOLUTION'; report: MediaResolutionReport }
  | { type: 'CLEAR_MEDIA_RESOLUTION' }
  | { type: 'SESSION_SWITCH'; sessionId: string; messages: ConversationMessage[] }
  | { type: 'PREPEND_MESSAGES'; messages: ConversationMessage[] }
  | { type: 'LOAD_MESSAGES_START' }
  | { type: 'SYNC_GENERATION_SUMMARIES'; summaries: OrganicGenerationSummary[] };

const STAGE_ORDER: readonly PipelineStage[] = PIPELINE_STAGES;

// Unique per assistant turn. A random suffix avoids same-millisecond collisions
// (two turns opened in the same tick would otherwise share an id and a React key).
function newAssistantMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-assistant`;
}

function buildStages(
  currentStage: PipelineStage,
  currentStatus: PipelineStageNodeStatus,
  agentName?: string,
): PipelineStageNode[] {
  const idx = STAGE_ORDER.indexOf(currentStage);
  return STAGE_ORDER.map((stage, i) => {
    if (i < idx) return { stage, status: 'done' as const };
    if (i === idx) return { stage, status: currentStatus, agentName };
    return { stage, status: 'pending' as const };
  });
}

function applyPipelineStage(
  prev: PipelineCardState | undefined,
  ev: ParsedPipelineStage,
): PipelineCardState {
  const nodeStatus: PipelineStageNodeStatus =
    ev.status === 'done' ? 'done' : ev.status === 'failed' ? 'failed' : 'active';
  const terminal =
    prev?.status === 'completed' || prev?.status === 'failed' || prev?.status === 'cancelled';
  return {
    jobId: ev.jobId,
    brandId: ev.brandId ?? prev?.brandId,
    planId: ev.planId ?? prev?.planId ?? null,
    planItemId: ev.planItemId ?? prev?.planItemId ?? null,
    platform: prev?.platform,
    stages: terminal && prev ? prev.stages : buildStages(ev.stage, nodeStatus, ev.agentName),
    currentStage: ev.stage,
    pct: ev.pct ?? prev?.pct,
    status: terminal && prev ? prev.status : 'running',
    preview: prev?.preview,
    quality: prev?.quality,
    draftId: prev?.draftId,
    error: prev?.error,
  };
}

function applyPipelineCard(
  prev: PipelineCardState | undefined,
  card: Partial<PipelineCardState> & { jobId: string },
): PipelineCardState {
  const base: PipelineCardState = prev ?? {
    jobId: card.jobId,
    stages: STAGE_ORDER.map((stage) => ({ stage, status: 'pending' as const })),
    status: 'running',
  };

  let stages = base.stages;
  if (card.status === 'completed') {
    stages = STAGE_ORDER.map((stage) => ({ stage, status: 'done' as const }));
  } else if (card.status === 'failed') {
    const failStage = card.currentStage ?? base.currentStage;
    stages = base.stages.map((s) =>
      s.stage === failStage ? { ...s, status: 'failed' as const } : s,
    );
  }

  return {
    ...base,
    ...card,
    stages,
    pct: card.status === 'completed' ? 100 : (card.pct ?? base.pct),
    quality: card.quality ?? base.quality,
    preview: card.preview ?? base.preview,
    // Merge checkpoint fields so a later card update that omits checkpoint
    // doesn't wipe out textReady/blueprintReady received on an earlier frame.
    checkpoint: card.checkpoint ? { ...base.checkpoint, ...card.checkpoint } : base.checkpoint,
  };
}

const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled']);

// Durable job rows (session-jobs hydration) and generation summaries carry these
// fields beyond the streaming AgentJobState shape; both are read loosely here.
type DurableJobLike = {
  jobId: string;
  brandId?: string | null;
  status?: string | null;
  platform?: string | null;
  draftId?: string | null;
  toolCallId?: string | null;
  planId?: string | null;
  planItemId?: string | null;
  mediaStage?: string | null;
  stage?: string | null;
  pct?: number | null;
  error?: unknown;
};

const PIPELINE_CARD_STATUSES = new Set(['running', 'completed', 'failed', 'cancelled']);

// Map the draft's durable media-enrichment stage (plus the job status) onto the
// three-step checkpoint the pipeline card renders — the same semantics the live
// ui.pipeline_card checkpoint frames carry.
function checkpointFromDurableState(
  status: string | null | undefined,
  mediaStage: string | null | undefined,
): PipelineCardState['checkpoint'] {
  switch (mediaStage) {
    case 'text_only':
      return { textReady: true };
    case 'storyboard_ready':
      return { textReady: true, blueprintReady: true };
    case 'realizing':
      return { textReady: true, blueprintReady: true, mediaStatus: 'generating' };
    case 'realized':
      return { textReady: true, blueprintReady: true, mediaStatus: 'ready' };
    default:
      return status === 'completed' ? { textReady: true } : undefined;
  }
}

function normalizeDurableError(raw: unknown): PipelineCardState['error'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as { code?: unknown; message?: unknown };
  if (typeof record.message !== 'string' || record.message.length === 0) return undefined;
  return {
    ...(typeof record.code === 'string' ? { code: record.code } : {}),
    message: record.message,
  };
}

// Durable job row / generation summary -> the same partial-card shape the live
// ui.pipeline_card frames produce, so applyPipelineCard stays the ONE merge path.
// Only defined fields are emitted: the merge spreads this partial over the
// existing card and an explicit undefined would clobber a richer earlier frame.
function pipelineCardFromDurableJob(
  job: DurableJobLike,
): Partial<PipelineCardState> & { jobId: string } {
  const status = (
    job.status && PIPELINE_CARD_STATUSES.has(job.status) ? job.status : 'running'
  ) as PipelineCardState['status'];
  const checkpoint = checkpointFromDurableState(job.status, job.mediaStage);
  const error = normalizeDurableError(job.error);
  return {
    jobId: job.jobId,
    status,
    ...(job.brandId ? { brandId: job.brandId } : {}),
    ...(job.platform ? { platform: job.platform } : {}),
    ...(job.draftId ? { draftId: job.draftId } : {}),
    ...(job.toolCallId ? { toolCallId: job.toolCallId } : {}),
    ...(typeof job.planId === 'string' ? { planId: job.planId } : {}),
    ...(typeof job.planItemId === 'string' ? { planItemId: job.planItemId } : {}),
    ...(job.stage && (STAGE_ORDER as readonly string[]).includes(job.stage)
      ? { currentStage: job.stage as PipelineStage }
      : {}),
    ...(typeof job.pct === 'number' && Number.isFinite(job.pct) ? { pct: job.pct } : {}),
    ...(checkpoint ? { checkpoint } : {}),
    ...(error ? { error } : {}),
  };
}

// Keep the coarse job status (JobGrid) in lockstep with live pipeline progress so
// a card never reads "Queued" while its pipeline is actively advancing. Only
// touches an existing job and never regresses one that has already finished.
function reconcileJobFromPipeline(
  jobs: Record<string, AgentJobState>,
  jobId: string,
  patch: Partial<AgentJobState>,
): Record<string, AgentJobState> {
  const existing = jobs[jobId];
  if (!existing || TERMINAL_JOB_STATUSES.has(existing.status)) return jobs;
  return { ...jobs, [jobId]: { ...existing, ...patch } };
}

export function initialPanelState(): PanelState {
  return {
    sessionId: null,
    messages: [],
    inputValue: '',
    isHydrated: false,
    jobs: {},
    pipeline: {},
    pendingJobCancellations: {},
    planItemStatus: {},
    pendingToolApprovals: [],
    bulkRuns: {},
    streamingMessageId: null,
    mediaResolution: null,
    queuedAheadOf: null,
  };
}

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'SESSION_INIT':
      return { ...state, sessionId: action.sessionId };

    case 'HYDRATE_JOBS': {
      const merged = { ...state.jobs };
      let pipeline = state.pipeline;
      const jobs = Array.isArray(action.jobs) ? action.jobs : [];
      for (const job of jobs) {
        if (!job || typeof job.jobId !== 'string') continue;
        if (state.pendingJobCancellations[job.jobId]) continue;
        merged[job.jobId] = job;
        // Seed/refresh the inline pipeline card from the durable row. Persisted
        // message ui_cards only hold intra-turn frames — the worker's cards land
        // after the chat stream closes — so tool-dispatched jobs (toolCallId) get
        // their card here, and any restored card converges to the durable status.
        const durable = job as AgentJobState & DurableJobLike & { progress?: unknown };
        if (!durable.toolCallId && !pipeline[job.jobId]) continue;
        const progress =
          durable.progress && typeof durable.progress === 'object'
            ? (durable.progress as { stage?: unknown; pct?: unknown })
            : undefined;
        const card = pipelineCardFromDurableJob({
          ...durable,
          stage: durable.stage ?? (typeof progress?.stage === 'string' ? progress.stage : null),
          pct: durable.pct ?? (typeof progress?.pct === 'number' ? progress.pct : null),
        });
        pipeline = { ...pipeline, [job.jobId]: applyPipelineCard(pipeline[job.jobId], card) };
      }
      return { ...state, jobs: merged, pipeline, isHydrated: true };
    }

    case 'SET_INPUT':
      return { ...state, inputValue: action.value };

    case 'SUBMIT_USER_MESSAGE': {
      const streamingId = newAssistantMessageId();
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.messageId,
            role: 'user',
            content: action.content,
            metadata: action.metadata,
          },
          { id: streamingId, role: 'assistant', content: '' },
        ],
        streamingMessageId: streamingId,
        inputValue: '',
        mediaResolution: null,
        queuedAheadOf: null,
      };
    }

    case 'MEDIA_RESOLUTION':
      return { ...state, mediaResolution: action.report };

    case 'CLEAR_MEDIA_RESOLUTION':
      return { ...state, mediaResolution: null };

    case 'BEGIN_STREAMING': {
      const streamingId = newAssistantMessageId();
      return {
        ...state,
        messages: [...state.messages, { id: streamingId, role: 'assistant' as const, content: '' }],
        streamingMessageId: streamingId,
      };
    }

    case 'STREAM_DELTA':
      if (!state.streamingMessageId) return state;
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId ? { ...m, content: m.content + action.delta } : m,
        ),
      };

    case 'STREAM_TOOL_CALL':
      if (!state.streamingMessageId) return state;
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), action.event] }
            : m,
        ),
      };

    case 'STREAM_TOOL_RESULT':
      if (!state.streamingMessageId) return state;
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.toolCallId === action.toolCallId
                    ? { ...tc, result: action.result, ok: action.ok, reason: action.reason }
                    : tc,
                ),
              }
            : m,
        ),
      };

    case 'STREAM_UI_CARD':
      if (!state.streamingMessageId) return state;
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, uiCards: [...(m.uiCards ?? []), action.card] }
            : m,
        ),
      };

    case 'STREAM_MEDIA_SEARCH_RESULTS':
      if (!state.streamingMessageId) return state;
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, mediaSearchResults: [...(m.mediaSearchResults ?? []), action.frame] }
            : m,
        ),
      };

    case 'STREAM_QUEUED':
      return { ...state, queuedAheadOf: action.aheadOf };

    // Re-attaching to a run that is STILL GOING — you sent a turn, navigated away, and came
    // back. The user message was persisted before the run started, so history already has
    // it; what is missing is the assistant turn, which is only persisted when the run ends.
    // This opens an empty assistant message for the run's frames to stream into, exactly as
    // SEND_MESSAGE does for a turn you started here. Keyed by runId so re-projecting the
    // same run cannot open a second one.
    case 'RESUME_STREAMING': {
      if (state.messages.some((m) => m.id === action.messageId)) {
        return { ...state, streamingMessageId: action.messageId };
      }
      return {
        ...state,
        messages: [...state.messages, { id: action.messageId, role: 'assistant', content: '' }],
        streamingMessageId: action.messageId,
      };
    }

    case 'STREAM_COMPLETE':
      return { ...state, streamingMessageId: null, queuedAheadOf: null };

    case 'STREAM_ERROR':
      return {
        ...state,
        streamingMessageId: null,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId ? { ...m, error: action.error } : m,
        ),
      };

    case 'RETRY_FROM_ASSISTANT': {
      // Drop the failed/stale assistant turn (and anything after it) and re-open
      // a fresh empty assistant message; the caller re-runs the prior user turn.
      const idx = state.messages.findIndex((m) => m.id === action.assistantMessageId);
      if (idx === -1) return state;
      const streamingId = newAssistantMessageId();
      return {
        ...state,
        messages: [
          ...state.messages.slice(0, idx),
          { id: streamingId, role: 'assistant' as const, content: '' },
        ],
        streamingMessageId: streamingId,
      };
    }

    case 'JOB_UPDATE': {
      const pendingJobCancellations = { ...state.pendingJobCancellations };
      delete pendingJobCancellations[action.job.jobId];
      if (action.job.status === 'cancelled') {
        const jobs = { ...state.jobs };
        const pipeline = { ...state.pipeline };
        delete jobs[action.job.jobId];
        delete pipeline[action.job.jobId];
        return { ...state, jobs, pipeline, pendingJobCancellations };
      }
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.job.jobId]: {
            ...(state.jobs[action.job.jobId] ?? {}),
            ...action.job,
          } as AgentJobState,
        },
        pendingJobCancellations,
      };

    }

    case 'JOB_CANCEL_START': {
      const job = state.jobs[action.jobId];
      if (!job) return state;
      const jobs = { ...state.jobs };
      const pipeline = { ...state.pipeline };
      delete jobs[action.jobId];
      delete pipeline[action.jobId];
      return {
        ...state,
        jobs,
        pipeline,
        pendingJobCancellations: {
          ...state.pendingJobCancellations,
          [action.jobId]: { job, pipeline: state.pipeline[action.jobId] },
        },
      };
    }

    case 'JOB_CANCEL_SUCCESS': {
      if (!state.pendingJobCancellations[action.jobId]) return state;
      const pendingJobCancellations = { ...state.pendingJobCancellations };
      delete pendingJobCancellations[action.jobId];
      return { ...state, pendingJobCancellations };
    }

    case 'JOB_CANCEL_FAILURE': {
      const pending = state.pendingJobCancellations[action.jobId];
      if (!pending) return state;
      const pendingJobCancellations = { ...state.pendingJobCancellations };
      delete pendingJobCancellations[action.jobId];
      return {
        ...state,
        jobs: { ...state.jobs, [action.jobId]: pending.job },
        pipeline: pending.pipeline
          ? { ...state.pipeline, [action.jobId]: pending.pipeline }
          : state.pipeline,
        pendingJobCancellations,
      };
    }

    case 'PIPELINE_STAGE': {
      const pendingJobCancellations = { ...state.pendingJobCancellations };
      delete pendingJobCancellations[action.event.jobId];
      return {
        ...state,
        pipeline: {
          ...state.pipeline,
          [action.event.jobId]: applyPipelineStage(
            state.pipeline[action.event.jobId],
            action.event,
          ),
        },
        jobs: reconcileJobFromPipeline(state.jobs, action.event.jobId, {
          status: action.event.status === 'failed' ? 'failed' : 'running',
          stage: action.event.stage,
          agentName: action.event.agentName,
          ...(typeof action.event.pct === 'number' ? { pct: action.event.pct } : {}),
        }),
        pendingJobCancellations,
      };
    }

    case 'PIPELINE_CARD': {
      const pendingJobCancellations = { ...state.pendingJobCancellations };
      delete pendingJobCancellations[action.card.jobId];
      return {
        ...state,
        pipeline: {
          ...state.pipeline,
          [action.card.jobId]: applyPipelineCard(state.pipeline[action.card.jobId], action.card),
        },
        jobs:
          action.card.status === 'running'
            ? reconcileJobFromPipeline(state.jobs, action.card.jobId, {
                status: 'running',
                ...(action.card.currentStage ? { stage: action.card.currentStage } : {}),
                ...(typeof action.card.pct === 'number' ? { pct: action.card.pct } : {}),
              })
            : state.jobs,
        pendingJobCancellations,
      };
    }

    case 'DRAFT_BLUEPRINT': {
      const { draftId, previews } = action;
      if (!draftId || previews.length === 0) return state;
      // The blueprint job's own jobId differs from the post-generation card, so
      // match by draftId: stamp the storyboard onto that card's preview images and
      // the job's thumbnail, and confirm the blueprint checkpoint step.
      let pipelineChanged = false;
      const pipeline: Record<string, PipelineCardState> = {};
      for (const [jobId, card] of Object.entries(state.pipeline)) {
        if (card.draftId === draftId) {
          pipelineChanged = true;
          pipeline[jobId] = {
            ...card,
            preview: {
              caption: card.preview?.caption ?? null,
              imageUrl: card.preview?.imageUrl ?? previews[0] ?? null,
              images: previews,
              format: card.preview?.format ?? null,
            },
            checkpoint: { ...card.checkpoint, blueprintReady: true },
          };
        } else {
          pipeline[jobId] = card;
        }
      }

      let jobsChanged = false;
      const jobs: Record<string, AgentJobState> = {};
      for (const [jobId, job] of Object.entries(state.jobs)) {
        if (job.draftId === draftId) {
          jobsChanged = true;
          jobs[jobId] = { ...job, previewImages: previews };
        } else {
          jobs[jobId] = job;
        }
      }

      if (!pipelineChanged && !jobsChanged) return state;
      return {
        ...state,
        pipeline: pipelineChanged ? pipeline : state.pipeline,
        jobs: jobsChanged ? jobs : state.jobs,
      };
    }

    case 'PLAN_STATUS':
      return {
        ...state,
        planItemStatus: {
          ...state.planItemStatus,
          [action.event.itemId]: action.event.status,
        },
      };

    case 'TOOL_APPROVAL_ADD':
      if (state.pendingToolApprovals.some((a) => a.approvalId === action.approval.approvalId)) {
        return state;
      }
      return {
        ...state,
        pendingToolApprovals: [...state.pendingToolApprovals, action.approval],
      };

    case 'TOOL_APPROVAL_RESOLVE':
      return {
        ...state,
        pendingToolApprovals: state.pendingToolApprovals.filter(
          (a) => a.approvalId !== action.approvalId,
        ),
      };

    case 'BULK_RUN_START':
      return {
        ...state,
        bulkRuns: { ...state.bulkRuns, [action.run.runId]: action.run },
      };

    case 'LOAD_MESSAGES_START':
      return {
        ...state,
        messages: [],
        jobs: {},
        pipeline: {},
        pendingJobCancellations: {},
        planItemStatus: {},
        pendingToolApprovals: [],
        bulkRuns: {},
        streamingMessageId: null,
        isHydrated: false,
      };

    case 'SESSION_SWITCH':
      return {
        ...initialPanelState(),
        sessionId: action.sessionId,
        messages: action.messages,
        isHydrated: true,
      };

    case 'PREPEND_MESSAGES': {
      const messages = prependUnseen(state.messages, action.messages);
      return messages === state.messages ? state : { ...state, messages };
    }

    // Polled/Realtime-refreshed generation summaries (brand-wide) converge this
    // session's jobs + inline pipeline cards to the durable rows, so an OPEN chat
    // picks up worker progress emitted after the turn's stream closed. Summaries
    // for jobs unknown to this session are ignored; a stale non-terminal read
    // never regresses a locally terminal job/card.
    case 'SYNC_GENERATION_SUMMARIES': {
      let jobs = state.jobs;
      let pipeline = state.pipeline;
      for (const summary of action.summaries) {
        if (!summary || typeof summary.jobId !== 'string') continue;
        const existingJob = state.jobs[summary.jobId];
        const existingCard = pipeline[summary.jobId];
        if (!existingJob && !existingCard) continue;
        const incomingTerminal = TERMINAL_JOB_STATUSES.has(summary.status);
        if (existingJob && (incomingTerminal || !TERMINAL_JOB_STATUSES.has(existingJob.status))) {
          jobs = {
            ...jobs,
            [summary.jobId]: {
              ...jobs[summary.jobId],
              status: summary.status,
              ...(summary.platform ? { platform: summary.platform } : {}),
              ...(summary.scheduledAt ? { scheduledAt: summary.scheduledAt } : {}),
              ...(summary.stage ? { stage: summary.stage } : {}),
              ...(summary.agentName ? { agentName: summary.agentName } : {}),
              ...(typeof summary.pct === 'number' ? { pct: summary.pct } : {}),
              ...(summary.draftId ? { draftId: summary.draftId } : {}),
              ...(summary.toolCallId ? { toolCallId: summary.toolCallId } : {}),
              ...(summary.error?.message
                ? { error: { code: summary.error.code, message: summary.error.message } }
                : {}),
            },
          };
        }
        if (existingCard && existingCard.status !== 'running' && !incomingTerminal) continue;
        if (!existingCard && !summary.toolCallId) continue;
        pipeline = {
          ...pipeline,
          [summary.jobId]: applyPipelineCard(existingCard, pipelineCardFromDurableJob(summary)),
        };
      }
      if (jobs === state.jobs && pipeline === state.pipeline) return state;
      return { ...state, jobs, pipeline };
    }

    default:
      return state;
  }
}
