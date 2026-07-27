'use client';

// The ONE place an Organic stream frame becomes panel state.
//
// There are two producers of frames now — the live NDJSON stream (fast) and the app-level
// run store, which replays a run's durable log when you come back to a session whose turn
// is still going. Both must fold a frame into the reducer identically, or a turn watched
// live and the same turn re-attached to after a navigation would render differently.
// Keeping the switch here, rather than inline in the stream hook, is what makes that
// impossible by construction.

import { useCalendarStore } from '@/lib/organic/store';
import { parseOrganicStreamEvent, postListCardFromToolResult } from './streamEventParser';
import type { PanelAction } from './useOrganicAgentReducer';

/**
 * `control` frames drive a background action (an approval, a retry) rather than a visible
 * assistant turn, so they must not write into the transcript.
 */
export type OrganicFrameMode = 'chat' | 'control';

export type OrganicFrameHandlers = {
  onCalendarDraftSignal?: (event: Record<string, unknown>) => void;
  /** The MID-stream per-tool `agent.run_started` frame — a jobId, not the run lifecycle. */
  onJobRunStarted?: (runId: string) => void;
};

// Tools that mutate a draft's lifecycle state in a way the planner/calendar must reflect
// immediately (status, scheduling, deletion). A successful call refetches the calendar so
// the Scheduled/Draft counts match what the agent did, instead of drifting until the next
// realtime event.
const CALENDAR_MUTATING_TOOLS = new Set([
  'approveDraft',
  'updateDraft',
  'publishDraft',
  'createDraft',
]);

/**
 * Fold one frame into panel state. Returns true when the frame is TERMINAL (the turn is
 * over) — the caller uses that to stop reconnecting or to stop projecting.
 */
export function applyOrganicFrame(
  event: Record<string, unknown>,
  dispatch: React.Dispatch<PanelAction>,
  mode: OrganicFrameMode,
  handlers?: OrganicFrameHandlers,
): boolean {
  const type = typeof event.type === 'string' ? event.type : undefined;
  const parsed = parseOrganicStreamEvent(event);

  switch (parsed.kind) {
    case 'delta':
      if (mode === 'control') break;
      dispatch({ type: 'STREAM_DELTA', delta: parsed.delta });
      break;
    case 'toolCall':
      if (mode === 'control') break;
      dispatch({ type: 'STREAM_TOOL_CALL', event: parsed.event });
      break;
    case 'toolResult': {
      if (mode === 'control') break;
      dispatch({
        type: 'STREAM_TOOL_RESULT',
        toolCallId: parsed.toolCallId,
        result: parsed.result,
        ok: parsed.ok,
        reason: parsed.reason,
      });
      if (parsed.ok !== false && CALENDAR_MUTATING_TOOLS.has(parsed.toolName)) {
        useCalendarStore.getState().requestCalendarRefetch();
      }
      const postCard = postListCardFromToolResult(parsed.toolName, parsed.result);
      if (postCard) dispatch({ type: 'STREAM_UI_CARD', card: postCard });
      break;
    }
    case 'error':
      if (mode === 'chat') {
        dispatch({
          type: 'STREAM_ERROR',
          error: parsed.message,
          code: parsed.code,
          transient: parsed.transient,
        });
      }
      return true;
    case 'retrying':
      if (mode === 'control') break;
      dispatch({ type: 'STREAM_RETRYING', attempt: parsed.attempt, reason: parsed.reason });
      break;
    case 'complete':
      if (mode === 'chat') dispatch({ type: 'STREAM_COMPLETE' });
      return true;
    case 'uiCard':
      if (mode === 'control') break;
      dispatch({ type: 'STREAM_UI_CARD', card: parsed.card });
      break;
    case 'postCard':
      dispatch({
        type: 'JOB_UPDATE',
        job: {
          jobId: parsed.card.jobId,
          brandId: parsed.card.brandId,
          uiPostCard: parsed.card,
        },
      });
      break;
    case 'jobUpdate':
      dispatch({ type: 'JOB_UPDATE', job: parsed.job });
      if (type === 'draft.text_ready' || type === 'draft.ready' || type === 'job.completed') {
        handlers?.onCalendarDraftSignal?.(event);
      }
      break;
    case 'draftBlueprint':
      dispatch({
        type: 'DRAFT_BLUEPRINT',
        draftId: parsed.draftId,
        previewRevision: parsed.previewRevision,
        previews: parsed.previews,
      });
      break;
    case 'pipelineStage':
      dispatch({ type: 'PIPELINE_STAGE', event: parsed.event });
      break;
    case 'pipelineCard':
      dispatch({ type: 'PIPELINE_CARD', card: parsed.card });
      break;
    case 'planStatus':
      dispatch({ type: 'PLAN_STATUS', event: parsed.event });
      break;
    case 'toolApproval':
      if (mode === 'control') break;
      dispatch({ type: 'TOOL_APPROVAL_ADD', approval: parsed.approval });
      break;
    case 'bulkRun':
      dispatch({
        type: 'BULK_RUN_START',
        run: { runId: parsed.run.runId, planId: parsed.run.planId, total: parsed.run.total },
      });
      break;
    case 'mediaSearchResults':
      if (mode === 'control') break;
      dispatch({ type: 'STREAM_MEDIA_SEARCH_RESULTS', frame: parsed.frame });
      break;
    case 'mediaResolution':
      if (mode === 'control') break;
      dispatch({ type: 'MEDIA_RESOLUTION', report: parsed.data });
      break;
    case 'runStarted':
      // A per-tool jobId emitted mid-stream — NOT the run-lifecycle frame, despite the
      // name. See the homonym note on agent.chat_started in the contracts.
      handlers?.onJobRunStarted?.(parsed.runId);
      break;
    case 'ignored':
      break;
    case 'invalid':
      console.warn('[organic-agent-stream] Invalid event payload ignored', {
        type: parsed.type ?? type,
        payload: event,
      });
      break;
  }

  return false;
}
