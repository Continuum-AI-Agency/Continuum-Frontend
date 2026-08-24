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
  pendingJobCancellations: Record<string, { job: AgentJobState; pipeline?: PipelineCardState }>;
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
  /**
   * Assistant message a SILENT auto-retry is queued for. While set, the red error row for
   * that message stays hidden; the panel fires the same path as the manual Retry button
   * and RETRY_FROM_ASSISTANT (or AUTO_RETRY_ABANDON on a retry that cannot start) clears it.
   */
  pendingAutoRetry: string | null;
  /** One silent auto-retry per turn: consumed by the first transient STREAM_ERROR. */
  autoRetryConsumed: boolean;
  /**
   * Set while the Backend retries a transient mid-turn failure (response.retrying) —
   * rendered as a subtle status swap on the streaming indicator, not an error.
   */
  streamRetrying: { attempt: number; reason?: string } | null;
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
  | { type: 'STREAM_STALLED' }
  | { type: 'STREAM_ERROR'; error: string; code?: string; transient?: boolean }
  | { type: 'STREAM_RETRYING'; attempt: number; reason?: string }
  | { type: 'AUTO_RETRY_ABANDON' }
  | { type: 'STREAM_QUEUED'; aheadOf: number }
  | { type: 'RESUME_STREAMING'; messageId: string }
  | { type: 'RETRY_FROM_ASSISTANT'; assistantMessageId: string }
  | { type: 'STREAM_UI_CARD'; card: UiCard }
  | { type: 'STREAM_MEDIA_SEARCH_RESULTS'; frame: MediaSearchResultsFrame }
  | { type: 'JOB_UPDATE'; job: Partial<AgentJobState> & { jobId: string } }
  | { type: 'JOB_CANCEL_START'; jobId: string }
  | { type: 'JOB_CANCEL_SUCCESS'; jobId: string }
  | { type: 'JOB_CANCEL_FAILURE'; jobId: string }
  | { type: 'DRAFT_BLUEPRINT'; draftId: string; previewRevision: string; previews: string[] }
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
    toolCallId: prev?.toolCallId,
    checkpoint: prev?.checkpoint,
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
  previewRevision?: string | null;
  error?: unknown;
};

const PIPELINE_CARD_STATUSES = new Set(['running', 'completed', 'failed', 'cancelled']);

// Map the draft's durable media-enrichment stage (plus the job status) onto the
// three-step checkpoint the pipeline card renders — the same semantics the live
// ui.pipeline_card checkpoint frames carry.
//
// `previewRevision` is carried through when the durable source has it: it is the
// approval token the realize path demands, so a checkpoint that claims
// awaitingMediaChoice without one promises an action the user cannot take. A job row
// alone does not carry the token (it lives on the draft), which is why the claim is
// conditional rather than hardcoded true — the token arrives with the persisted
// draft.blueprint_ready frame, and applyPipelineCard merges the two.
function checkpointFromDurableState(
  status: string | null | undefined,
  mediaStage: string | null | undefined,
  previewRevision?: string | null,
): PipelineCardState['checkpoint'] {
  const approval = typeof previewRevision === 'string' && previewRevision.length > 0;
  switch (mediaStage) {
    case 'text_only':
      return { textReady: true };
    case 'storyboard_ready':
      // awaitingMediaChoice is OMITTED (not set false) without a token, so a richer
      // earlier frame that already carried the token keeps its claim through the merge.
      return {
        textReady: true,
        blueprintReady: true,
        mediaStatus: 'pending',
        ...(approval ? { awaitingMediaChoice: true, previewRevision } : {}),
      };
    case 'realizing':
      return {
        textReady: true,
        blueprintReady: true,
        mediaStatus: 'generating',
        awaitingMediaChoice: false,
      };
    case 'realized':
      return {
        textReady: true,
        blueprintReady: true,
        mediaStatus: 'ready',
        awaitingMediaChoice: false,
      };
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
  const checkpoint = checkpointFromDurableState(job.status, job.mediaStage, job.previewRevision);
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

// The inverse direction: fold a job update (live frame, durable summary, or a
// restored terminal frame) into the pipeline-card and plan-item slices the cards
// actually render. This seam's absence let job.completed land in state.jobs while
// ConceptCard/PipelineCard — which read pipeline and planItemStatus — spun forever.
// Card rules mirror SYNC_GENERATION_SUMMARIES: a running card takes any update, a
// settled card only takes a terminal one, and a card is only CREATED when the job
// carries a toolCallId (cards without one have no place to render). The plan item
// is settled only by a terminal job status.
function reconcilePipelineFromJob(
  pipeline: Record<string, PipelineCardState>,
  planItemStatus: Record<string, PlanItemStatus>,
  job: DurableJobLike,
): {
  pipeline: Record<string, PipelineCardState>;
  planItemStatus: Record<string, PlanItemStatus>;
} {
  const existingCard = pipeline[job.jobId];
  const incomingTerminal = typeof job.status === 'string' && TERMINAL_JOB_STATUSES.has(job.status);
  const canWriteCard = existingCard
    ? incomingTerminal || existingCard.status === 'running'
    : Boolean(job.toolCallId);
  const nextPipeline = canWriteCard
    ? {
        ...pipeline,
        [job.jobId]: applyPipelineCard(existingCard, pipelineCardFromDurableJob(job)),
      }
    : pipeline;
  const planItemId = job.planItemId ?? existingCard?.planItemId;
  const nextPlanItemStatus =
    incomingTerminal && planItemId && planItemStatus[planItemId] !== job.status
      ? { ...planItemStatus, [planItemId]: job.status as PlanItemStatus }
      : planItemStatus;
  return { pipeline: nextPipeline, planItemStatus: nextPlanItemStatus };
}

/**
 * Fold a server-restored transcript page into what is already on screen.
 *
 * The server page is authoritative for HISTORY; local state is authoritative for the turn
 * IN FLIGHT. Only the server has seen the persisted record, but only the client has seen
 * the message just typed and the empty assistant bubble opened for it — the assistant turn
 * is not persisted until its run ends, so history can never carry it.
 *
 * Order is reconstructed rather than concatenated: a local-only message is placed just
 * BEFORE the next message the server page also has, and one with no such successor goes
 * last. Forward anchoring, not backward, is what keeps both ends right — an older page the
 * reader already scrolled back to stays at the top, and the turn in flight stays at the
 * bottom even when the server page carries messages the client has not folded yet.
 */
export function mergeRestoredMessages(
  local: readonly ConversationMessage[],
  restored: readonly ConversationMessage[],
): ConversationMessage[] {
  if (local.length === 0) return [...restored];

  const restoredIndexById = new Map(restored.map((message, index) => [message.id, index]));
  const AFTER_ALL_RESTORED = restored.length;
  const localOnlyBefore = new Map<number, ConversationMessage[]>();
  const pendingLocalOnly: ConversationMessage[] = [];

  const placeBefore = (restoredIndex: number) => {
    if (pendingLocalOnly.length === 0) return;
    const existing = localOnlyBefore.get(restoredIndex);
    if (existing) existing.push(...pendingLocalOnly);
    else localOnlyBefore.set(restoredIndex, [...pendingLocalOnly]);
    pendingLocalOnly.length = 0;
  };

  for (const message of local) {
    const restoredIndex = restoredIndexById.get(message.id);
    if (restoredIndex === undefined) pendingLocalOnly.push(message);
    else placeBefore(restoredIndex);
  }
  placeBefore(AFTER_ALL_RESTORED);

  if (localOnlyBefore.size === 0) return [...restored];

  const merged: ConversationMessage[] = [];
  restored.forEach((message, index) => {
    merged.push(...(localOnlyBefore.get(index) ?? []));
    merged.push(message);
  });
  merged.push(...(localOnlyBefore.get(AFTER_ALL_RESTORED) ?? []));
  return merged;
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
    pendingAutoRetry: null,
    autoRetryConsumed: false,
    streamRetrying: null,
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
        pendingAutoRetry: null,
        autoRetryConsumed: false,
        streamRetrying: null,
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
        pendingAutoRetry: null,
        autoRetryConsumed: false,
        streamRetrying: null,
      };
    }

    case 'STREAM_DELTA':
      if (!state.streamingMessageId) return state;
      return {
        ...state,
        // Activity resumed, so any transient reconnecting status is over.
        streamRetrying: null,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId ? { ...m, content: m.content + action.delta } : m,
        ),
      };

    case 'STREAM_TOOL_CALL':
      if (!state.streamingMessageId) return state;
      return {
        ...state,
        // A tool call after response.retrying means the retried call is running again.
        streamRetrying: null,
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
        return {
          ...state,
          streamingMessageId: action.messageId,
          pendingAutoRetry: null,
          autoRetryConsumed: false,
          streamRetrying: null,
        };
      }
      return {
        ...state,
        messages: [...state.messages, { id: action.messageId, role: 'assistant', content: '' }],
        streamingMessageId: action.messageId,
        pendingAutoRetry: null,
        autoRetryConsumed: false,
        streamRetrying: null,
      };
    }

    case 'STREAM_COMPLETE':
      // The stream hook emits a trailing STREAM_COMPLETE after a terminal error frame,
      // so a queued silent auto-retry must survive it — only streaming state clears.
      return { ...state, streamingMessageId: null, queuedAheadOf: null, streamRetrying: null };

    case 'STREAM_ERROR': {
      // First transient failure of a turn: stamp the error but queue ONE silent
      // auto-retry — the panel hides the red row while the retry is pending and
      // fires the same path as the manual Retry button. A second failure, or a
      // non-transient one, paints the error row immediately.
      const erroredMessageId = state.streamingMessageId;
      const autoRetry =
        action.transient === true && !state.autoRetryConsumed && erroredMessageId !== null;
      return {
        ...state,
        streamingMessageId: null,
        streamRetrying: null,
        messages: state.messages.map((m) =>
          m.id === erroredMessageId ? { ...m, error: action.error } : m,
        ),
        ...(autoRetry ? { pendingAutoRetry: erroredMessageId, autoRetryConsumed: true } : {}),
      };
    }

    case 'STREAM_RETRYING':
      if (!state.streamingMessageId) return state;
      return { ...state, streamRetrying: { attempt: action.attempt, reason: action.reason } };

    case 'AUTO_RETRY_ABANDON':
      // The silent retry could not start (no session, no user turn) — release the
      // hold so the already-stamped error row surfaces with the manual Retry button.
      return state.pendingAutoRetry === null ? state : { ...state, pendingAutoRetry: null };

    case 'RETRY_FROM_ASSISTANT': {
      // Drop the failed/stale assistant turn (and anything after it) and re-open
      // a fresh empty assistant message; the caller re-runs the prior user turn.
      // autoRetryConsumed is deliberately kept: the retried turn inherits the spent
      // silent-retry budget, so a second transient failure paints the error row.
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
        pendingAutoRetry: null,
        streamRetrying: null,
      };
    }

    case 'JOB_UPDATE': {
      const pendingJobCancellations = { ...state.pendingJobCancellations };
      delete pendingJobCancellations[action.job.jobId];
      if (action.job.status === 'cancelled') {
        const jobs = { ...state.jobs };
        const pipeline = { ...state.pipeline };
        const cancelledPlanItemId =
          action.job.planItemId ?? state.pipeline[action.job.jobId]?.planItemId;
        delete jobs[action.job.jobId];
        delete pipeline[action.job.jobId];
        const planItemStatus = cancelledPlanItemId
          ? { ...state.planItemStatus, [cancelledPlanItemId]: 'cancelled' as const }
          : state.planItemStatus;
        return { ...state, jobs, pipeline, planItemStatus, pendingJobCancellations };
      }
      const { pipeline, planItemStatus } = reconcilePipelineFromJob(
        state.pipeline,
        state.planItemStatus,
        action.job,
      );
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.job.jobId]: {
            ...(state.jobs[action.job.jobId] ?? {}),
            ...action.job,
          } as AgentJobState,
        },
        pipeline,
        planItemStatus,
        pendingJobCancellations,
      };
    }

    // Terminal state of last resort: the stream idle watchdog fired after minutes of
    // total silence. Nothing else will move these cards — settle every non-terminal
    // job, running card, and executing plan item as failed. A later terminal summary
    // (Realtime or the recovery poll) still overrides via the incoming-terminal guards.
    case 'STREAM_STALLED': {
      const stallError = {
        message:
          'Timed out waiting for progress. If the job is still running, this will update when it reports back.',
      };
      let changed = false;
      const jobs: Record<string, AgentJobState> = {};
      for (const [id, job] of Object.entries(state.jobs)) {
        if (TERMINAL_JOB_STATUSES.has(job.status)) {
          jobs[id] = job;
          continue;
        }
        jobs[id] = { ...job, status: 'failed', error: stallError };
        changed = true;
      }
      const pipeline: Record<string, PipelineCardState> = {};
      for (const [id, card] of Object.entries(state.pipeline)) {
        if (card.status !== 'running') {
          pipeline[id] = card;
          continue;
        }
        pipeline[id] = applyPipelineCard(card, {
          jobId: id,
          status: 'failed',
          error: stallError,
        });
        changed = true;
      }
      const planItemStatus: Record<string, PlanItemStatus> = {};
      for (const [id, status] of Object.entries(state.planItemStatus)) {
        if (status !== 'executing') {
          planItemStatus[id] = status;
          continue;
        }
        planItemStatus[id] = 'failed';
        changed = true;
      }
      if (!changed) return state;
      return { ...state, jobs, pipeline, planItemStatus };
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
      const { draftId, previewRevision, previews } = action;
      // Only the draftId is load-bearing. `previews` is a rendering nicety that fails
      // independently (preview signing can miss while the blueprint succeeded), whereas
      // `previewRevision` is the approval token the Generate-media action requires —
      // bailing on an empty preview list threw the token away and left the card stranded
      // on "awaiting media choice" with nothing to click.
      if (!draftId) return state;
      const hasPreviews = previews.length > 0;
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
            ...(hasPreviews
              ? {
                  preview: {
                    caption: card.preview?.caption ?? null,
                    imageUrl: card.preview?.imageUrl ?? previews[0] ?? null,
                    images: previews,
                    format: card.preview?.format ?? null,
                  },
                }
              : {}),
            checkpoint: {
              ...card.checkpoint,
              blueprintReady: true,
              mediaStatus: 'pending',
              awaitingMediaChoice: true,
              previewRevision,
            },
          };
        } else {
          pipeline[jobId] = card;
        }
      }

      let jobsChanged = false;
      const jobs: Record<string, AgentJobState> = {};
      for (const [jobId, job] of Object.entries(state.jobs)) {
        if (job.draftId === draftId && hasPreviews) {
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
        pendingAutoRetry: null,
        autoRetryConsumed: false,
        streamRetrying: null,
        isHydrated: false,
      };

    // Two different jobs behind one action. Switching to ANOTHER conversation is a full
    // reset — nothing on screen belongs to the session being opened. Re-hydrating the
    // session ALREADY on screen is not: the panel fires that fetch on mount without
    // waiting for the composer, so the page can land after the user has typed, and
    // resetting there deleted their message, the empty assistant bubble, and the
    // streamingMessageId every STREAM_DELTA attaches to — the turn answered into nothing.
    case 'SESSION_SWITCH': {
      if (state.sessionId !== null && state.sessionId === action.sessionId) {
        return {
          ...state,
          messages: mergeRestoredMessages(state.messages, action.messages),
          isHydrated: true,
        };
      }
      return {
        ...initialPanelState(),
        sessionId: action.sessionId,
        messages: action.messages,
        isHydrated: true,
      };
    }

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
      let planItemStatus = state.planItemStatus;
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
        const reconciled = reconcilePipelineFromJob(pipeline, planItemStatus, summary);
        pipeline = reconciled.pipeline;
        planItemStatus = reconciled.planItemStatus;
      }
      if (
        jobs === state.jobs &&
        pipeline === state.pipeline &&
        planItemStatus === state.planItemStatus
      ) {
        return state;
      }
      return { ...state, jobs, pipeline, planItemStatus };
    }

    default:
      return state;
  }
}
