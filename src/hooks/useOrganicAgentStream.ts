'use client';

import {
  AGENT_CHAT_STARTED,
  AGENT_RUN_QUEUED,
  type AgentRunEventDto,
  type AgentRunStatus,
  isTerminalAgentRunStatus,
  runStatusFromFrameType,
} from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyOrganicFrame,
  type OrganicFrameHandlers,
} from '@/components/organic/agent/applyOrganicFrame';
import type { AgentChatInput } from '@/components/organic/agent/types';
import type { PanelAction } from '@/components/organic/agent/useOrganicAgentReducer';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { confirmOrganicRunCancellation } from '@/lib/organic/agent-cancellation';
import { readNdjsonStream } from '@/lib/streaming/readNdjsonStream';

const RECONNECT_BACKOFF_MS = 750;
const MAX_RECONNECT_ATTEMPTS = 5;
// 5 minutes of total silence — matches useRunEventStream's watchdog budget. Reset on
// every frame, so a long-but-progressing turn is never cut short; only a genuinely idle
// stream trips it.
const STREAM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * How to settle a run the idle watchdog had to end. A run that emitted at least one
 * frame produced real work (drafts landed, jobs were enqueued) and its missing terminal
 * frame is a backend gap, not a user-facing failure — settle it `completed` so the panel
 * unlocks without claiming the turn broke. A run that emitted nothing at all never
 * started, so `failed` is the honest report.
 *
 * Mirrors resolveWatchdogStatus in useRunEventStream; kept separate because that hook
 * speaks RunStreamStatus and this one speaks AgentRunStatus.
 */
export function resolveIdleRunStatus(receivedAnyFrame: boolean): AgentRunStatus {
  return receivedAnyFrame ? 'completed' : 'failed';
}

/**
 * Lift a raw NDJSON frame into the store's log shape, or null when it cannot be logged.
 *
 * `seq` is the only required field: it is the dedupe key the two producers share, so a
 * frame without one (the unenveloped `agent.run_queued` notice) has no safe place in the
 * log. `eventId`/`ts` are only identity and display, so they are substituted rather than
 * treated as fatal.
 */
export function toAgentRunEvent(frame: Record<string, unknown>): AgentRunEventDto | null {
  const seq = typeof frame.seq === 'number' ? frame.seq : null;
  const type = typeof frame.type === 'string' ? frame.type : null;
  if (seq === null || !type) return null;
  return {
    eventId: typeof frame.eventId === 'string' ? frame.eventId : `evt_${seq}`,
    seq,
    ts: typeof frame.ts === 'string' ? frame.ts : new Date().toISOString(),
    type,
    data:
      frame.data && typeof frame.data === 'object'
        ? (frame.data as Record<string, unknown>)
        : ({} as Record<string, unknown>),
  };
}

type OrganicAgentStreamOptions = {
  onRunStarted?: (runId: string) => void;
  onCalendarDraftSignal?: (event: Record<string, unknown>) => void;
};

type StreamMode = 'chat' | 'control';

export function useOrganicAgentStream(
  dispatch: React.Dispatch<PanelAction>,
  opts?: OrganicAgentStreamOptions,
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const controlAbortRefs = useRef<Set<AbortController>>(new Set());

  const runIdRef = useRef<string | null>(null);
  // Reactive twin of runIdRef: the store projection is an effect, so it needs the owned
  // runId to be state, not a ref, or it never re-evaluates when the run changes.
  const [liveRunId, setLiveRunId] = useState<string | null>(null);

  const frameHandlers: OrganicFrameHandlers = {
    onCalendarDraftSignal: (event) => opts?.onCalendarDraftSignal?.(event),
    onJobRunStarted: (runId) => opts?.onRunStarted?.(runId),
  };

  /**
   * Tear down the LOCAL view of the run — the NDJSON reader — without stopping the run.
   *
   * This is the whole point of the detached model: the socket is one view, not the run.
   * The app-level store keeps tailing the durable log over Realtime, so a closed reader
   * (an unmount, a navigation) loses nothing.
   */
  const detach = useCallback(() => {
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    abortRef.current = null;
    readerRef.current = null;
    setIsStreaming(false);
    // Release ownership: the run lives on, and the store projection takes over rendering it.
    runIdRef.current = null;
    setLiveRunId(null);
  }, []);

  /**
   * Actually STOP the run — what the user means by pressing stop. Aborting the local reader
   * alone would just hide a run that keeps burning tokens, which is exactly the bug the old
   * DB-only cancel had on the Backend.
   *
   * `targetRunId` lets a caller stop a run this reader does NOT own — the projected run you
   * returned to after switching away. It defaults to the locally-owned run. When the target
   * is not the owned run, `isCurrent` is false and the caller is responsible for clearing its
   * own transcript (the store status still flips to `cancelled` via `acknowledge`).
   */
  const cancel = useCallback(
    async (targetRunId?: string) => {
      const runId = targetRunId ?? runIdRef.current;
      if (!runId) return { ok: false as const, error: 'No active run to stop.' };

      return confirmOrganicRunCancellation({
        runId,
        acknowledge: (cancelledRunId) => {
          const record = useAgentRunStore.getState().runs[cancelledRunId];
          if (record) {
            useAgentRunStore.getState().upsertRun({ ...record.run, status: 'cancelled' });
          }
        },
        isCurrent: (cancelledRunId) => runIdRef.current === cancelledRunId,
        reconcileCurrent: () => {
          dispatch({ type: 'STREAM_COMPLETE' });
          detach();
        },
      });
    },
    [detach, dispatch],
  );

  // Unmount detaches the view. It does NOT cancel: this cleanup used to abort the run's
  // only reader, which — together with the Backend aborting on socket close — is why
  // navigating away silently killed a turn mid-sentence.
  useEffect(
    () => () => {
      detach();
      for (const controller of controlAbortRefs.current) controller.abort();
      controlAbortRefs.current.clear();
    },
    [detach],
  );

  const runStream = useCallback(
    async (input: AgentChatInput, mode: StreamMode): Promise<{ error?: string }> => {
      if (mode === 'chat') {
        // Detach any previous view; do not cancel the run behind it.
        detach();
        runIdRef.current = null;
        setIsStreaming(true);
      }

      const controller = new AbortController();
      if (mode === 'chat') {
        abortRef.current = controller;
      } else {
        controlAbortRefs.current.add(controller);
      }

      let chatRunId: string | null = null;
      let lastSeq = -1;
      let terminal = false;
      let receivedAnyFrame = false;
      // The status the LAST terminal frame implies, mirroring how the store derives it.
      // Organic emits a non-fatal `response.error` when a background-job drain times out and
      // then still finishes the turn, so a later `completed` has to be allowed to win.
      let terminalStatus: AgentRunStatus | null = null;

      /**
       * Idle watchdog. `composerBusy` is `isStreaming || viewedSessionStreaming`, and BOTH
       * halves hang on a terminal frame that a stalled backend never sends: the local flag
       * clears only in this function's `finally`, and the store derives status from the last
       * terminal frame in the log. A run that goes silent therefore locks the composer and
       * every action on the panel — permanently, and across reloads — which is the
       * "can't make anything" half of the frozen-planner report.
       *
       * So the watchdog settles both: abort the reader (which runs the `finally`) and stamp
       * a terminal status on the store record. Aborting alone would leave the store record
       * "running" forever.
       */
      let idleHandle: ReturnType<typeof setTimeout> | null = null;
      let idleTimedOut = false;
      const clearIdleWatchdog = () => {
        if (idleHandle) clearTimeout(idleHandle);
        idleHandle = null;
      };
      const settleIdleRun = () => {
        if (terminal || controller.signal.aborted) return;
        idleTimedOut = true;
        const store = useAgentRunStore.getState();
        const record = chatRunId ? store.runs[chatRunId] : undefined;
        if (record) {
          store.upsertRun({ ...record.run, status: resolveIdleRunStatus(receivedAnyFrame) });
        }
        controller.abort();
        // Abort alone is not enough to unblock the read loop: the pending `reader.read()`
        // resolves only if the body stream is torn down, so cancel it explicitly rather
        // than trusting the fetch signal to propagate. Without this the `finally` (which
        // clears isStreaming) never runs and the panel stays locked.
        readerRef.current?.cancel().catch(() => {});
      };
      const armIdleWatchdog = () => {
        if (mode !== 'chat') return;
        clearIdleWatchdog();
        idleHandle = setTimeout(settleIdleRun, STREAM_IDLE_TIMEOUT_MS);
      };

      /**
       * The reader is the SECOND producer into the run's durable log — the store's
       * "TWO PRODUCERS, ONE LOG" design. Without this the log had exactly one producer, the
       * Realtime tailer, so a dropped postgres-changes subscription left the store record
       * `running` forever: `isSessionStreaming` stayed true, "Continuum is working…" never
       * cleared and the composer stayed disabled until the idle watchdog fired minutes later.
       *
       * Appending here makes the terminal frame settle the run the instant the stream ends,
       * with no dependence on Realtime. Both producers dedupe by seq inside the store, so
       * the tailer re-appending the same frame is a no-op.
       */
      const recordFrame = (event: Record<string, unknown>): void => {
        if (!chatRunId) return;
        const logged = toAgentRunEvent(event);
        if (!logged) return;
        terminalStatus = runStatusFromFrameType(logged.type) ?? terminalStatus;
        useAgentRunStore.getState().appendEvents(chatRunId, [logged]);
      };

      /**
       * Belt and braces for the composer lock. `recordFrame` already settles the run through
       * the log, but a status derived from a log is one indirection away from the flag that
       * disables the composer — so if the stream ended terminally and the record is somehow
       * still non-terminal, stamp it directly. There is nothing else left to unlock it.
       */
      const settleTerminalRun = (): void => {
        if (!terminalStatus || !chatRunId) return;
        const store = useAgentRunStore.getState();
        const record = store.runs[chatRunId];
        if (!record || isTerminalAgentRunStatus(record.run.status)) return;
        store.upsertRun({ ...record.run, status: terminalStatus });
      };

      const dispatchParsed = (event: Record<string, unknown>): void => {
        const type = typeof event.type === 'string' ? event.type : undefined;
        // Any frame proves the stream is alive, so every frame re-arms the watchdog. Only
        // frames that carry actual output count as WORK though: agent.chat_started merely
        // names the run and agent.run_queued says the turn has not begun, so a run that
        // sent nothing else produced nothing and should not settle as completed.
        armIdleWatchdog();
        if (type !== AGENT_CHAT_STARTED && type !== AGENT_RUN_QUEUED) receivedAnyFrame = true;

        // The seq-0 frame that names the durable run this stream is a view of. Registering
        // it in the app-level store is what lets the run outlive this component: the store
        // tails it over Realtime from here on, so unmounting the panel (or navigating away
        // entirely) no longer ends the run's client side.
        if (type === AGENT_CHAT_STARTED && !chatRunId) {
          const data = event.data as { runId?: unknown; sessionId?: unknown } | undefined;
          const runIdFromEvent = typeof data?.runId === 'string' ? data.runId : null;
          const sessionIdFromEvent =
            typeof data?.sessionId === 'string' ? data.sessionId : input.sessionId;
          if (runIdFromEvent) {
            chatRunId = runIdFromEvent;
            runIdRef.current = runIdFromEvent;
            setLiveRunId(runIdFromEvent);
            useAgentRunStore.getState().upsertRun({
              runId: runIdFromEvent,
              agent: 'organic',
              sessionId: sessionIdFromEvent ?? '',
              brandId: input.brandId,
              status: 'running',
              createdAt: new Date().toISOString(),
            });
            opts?.onRunStarted?.(runIdFromEvent);
            recordFrame(event);
          }
          return;
        }

        // Fenced behind another run on this session. Unenveloped (no seq) by design, so it
        // cannot collide with the seq-0 run-started frame.
        if (type === AGENT_RUN_QUEUED) {
          const data = event.data as { aheadOf?: unknown } | undefined;
          dispatch({
            type: 'STREAM_QUEUED',
            aheadOf: typeof data?.aheadOf === 'number' ? data.aheadOf : 1,
          });
          return;
        }

        recordFrame(event);
        if (applyOrganicFrame(event, dispatch, mode, frameHandlers)) {
          terminal = true;
        }
      };

      const consumeReader = async (
        reader: ReadableStreamDefaultReader<Uint8Array>,
      ): Promise<void> => {
        await readNdjsonStream({
          reader,
          onLine: (line) => {
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line) as Record<string, unknown>;
            } catch {
              return;
            }

            const seq = typeof event.seq === 'number' ? event.seq : null;
            // Dedupe across the initial POST stream and any reconnect
            // GETs — both sources may overlap on the boundary frame.
            if (seq !== null) {
              if (seq <= lastSeq) return;
              lastSeq = seq;
            }

            dispatchParsed(event);
          },
        });
      };

      // Armed before the request: a backend that accepts the POST and then never writes
      // a byte is exactly the stall this guards.
      armIdleWatchdog();

      try {
        // Proxied through the Next.js route at /api/organic/agent/chat
        // (mirrors the Jaina chat-stream pattern). The proxy attaches the
        // Supabase access token server-side from the request cookie and
        // emits the PostHog `organic_agent_chat_message_sent` event before
        // forwarding to the Backend.
        const response = await fetch('/api/organic/agent/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
          },
          // References travel once, top-level. The backend reads body.references
          // first (see organic/agent/src/runtime/server.ts), so the previous
          // duplicate copies under context/message_metadata were dead weight.
          body: JSON.stringify({
            brandId: input.brandId,
            sessionId: input.sessionId,
            messages: input.messages,
            references: input.references,
            approvals: input.approvals,
            weekStart: input.weekStart,
            timezone: input.timezone,
            platformAccountIds: input.platformAccountIds,
            images: input.images,
            locale: input.locale,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => 'Failed to start stream.');
          throw new Error(detail || 'Failed to start stream.');
        }

        const initialReader = response.body.getReader();
        if (mode === 'chat') readerRef.current = initialReader;
        try {
          await consumeReader(initialReader);
        } catch (error) {
          // A mid-stream throw on a NAMED run is a dropped connection, not a failed
          // turn — fall into the resume loop below (GET replay from after_seq, no
          // re-billing) instead of surfacing STREAM_ERROR. Without a runId there is
          // nothing to resume, so the throw propagates to the outer catch.
          if (terminal || !chatRunId || controller.signal.aborted) throw error;
        }

        // Stream closed or broke mid-turn. If we never saw a terminal frame and we
        // have a runId, reconnect via the resumable GET endpoint and continue from
        // the last-seen seq. Each failed attempt (fetch error, non-OK response, or
        // another mid-stream throw) burns one attempt; only exhausting them all
        // falls through to STREAM_ERROR.
        let attempts = 0;
        while (
          !terminal &&
          !controller.signal.aborted &&
          chatRunId &&
          attempts < MAX_RECONNECT_ATTEMPTS
        ) {
          attempts += 1;
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, RECONNECT_BACKOFF_MS * attempts);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              resolve();
            });
          });
          if (controller.signal.aborted) break;

          try {
            // Proxied through /api/organic/agent/runs/[runId]/events — the
            // server-side route attaches the Supabase token from the cookie
            // and forwards to the Backend resume endpoint.
            const resumeUrl = `/api/organic/agent/runs/${chatRunId}/events?after_seq=${lastSeq + 1}`;
            const resumeResponse = await fetch(resumeUrl, {
              headers: {
                Accept: 'application/x-ndjson',
              },
              signal: controller.signal,
            });

            if (!resumeResponse.ok || !resumeResponse.body) {
              // If the run can't be found (e.g. older deployment without
              // chat-run persistence), surface the dropped-connection
              // error instead of silently spinning.
              throw new Error(
                `Stream reconnect failed (status ${resumeResponse.status}). The connection was lost and could not be resumed.`,
              );
            }

            const resumeReader = resumeResponse.body.getReader();
            if (mode === 'chat') readerRef.current = resumeReader;
            await consumeReader(resumeReader);
          } catch (error) {
            if (controller.signal.aborted) break;
            if (attempts >= MAX_RECONNECT_ATTEMPTS) throw error;
          }
        }

        if (!terminal && chatRunId && !controller.signal.aborted) {
          // Every resume attempt ran out without a terminal frame — this is the
          // only path from a resumable run to STREAM_ERROR.
          throw new Error(
            'The connection was lost and could not be resumed after multiple attempts.',
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Stream failed';
        if (mode === 'chat' && !controller.signal.aborted) {
          dispatch({ type: 'STREAM_ERROR', error: message });
        }
        return { error: message };
      } finally {
        clearIdleWatchdog();
        settleTerminalRun();
        if (mode === 'chat') {
          // An aborted controller means an INTENTIONAL detach (session switch / unmount), not
          // a finished turn — the run lives on and the projection owns it now. Dispatching
          // STREAM_COMPLETE here would clear the streaming state of whatever session is now on
          // screen. A natural end already dispatched STREAM_COMPLETE via the terminal frame.
          //
          // The watchdog is the exception: it aborts precisely BECAUSE the turn will never
          // end on its own, so its abort must settle the transcript rather than leave the
          // assistant bubble rendering as streaming forever.
          if (!controller.signal.aborted || idleTimedOut) dispatch({ type: 'STREAM_COMPLETE' });
          setIsStreaming(false);
        } else {
          controlAbortRefs.current.delete(controller);
        }
      }

      return {};
    },
    // Match original hook contract: opts is captured by closure rather than
    // listed as a dep so consumers don't have to memoize the options object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, detach],
  );

  const start = useCallback((input: AgentChatInput) => runStream(input, 'chat'), [runStream]);
  const startControl = useCallback(
    (input: AgentChatInput) => runStream(input, 'control'),
    [runStream],
  );

  // The run THIS reader owns. The store projection uses it to stay off the run we are already
  // folding — exactly one folder per run, or every delta lands twice.
  //
  // `detach` is exported so the panel can release the local reader when the user switches
  // sessions mid-run: the run keeps executing (Backend + app-level store), and the projection
  // reattaches when they come back. Without this, the reader would keep dispatching the old
  // session's frames into a reducer that has already switched to a different transcript.
  return { start, startControl, cancel, detach, isStreaming, liveRunId };
}
