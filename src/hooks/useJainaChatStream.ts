'use client';

import type { AgentAttachment } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentMentionReference } from '@/lib/agent-references';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { browserTimezone } from '@/lib/automations/schedule';
import {
  type JainaChatStreamRequest,
  type JainaPlanAction,
  type JainaScaffoldAction,
  jainaChatRequestSchema,
} from '@/lib/jaina/schemas';
import {
  createInitialJainaStreamState,
  hasRenderableStreamContent,
  type JainaStreamState,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from '@/lib/jaina/stream';
import { readNdjsonStream } from '@/lib/streaming/readNdjsonStream';

type JainaChatInput = {
  query: string;
  canvas?: boolean;
  adAccountId: string;
  brandId: string;
  sessionId?: string;
  clarificationId?: string;
  userId?: string;
  images?: AgentAttachment[];
  references?: AgentMentionReference[];
  planAction?: JainaPlanAction;
  scaffoldAction?: JainaScaffoldAction;
  forceReportArtifact?: boolean;
  /**
   * Invoked when the request fails to reach the backend.
   *
   * `start()` resolves before the fetch settles, so a caller holding optimistic UI
   * has no other way to learn it was dropped. Without this an approval that never
   * arrived still renders as "Approved" — exactly the silence an approval gate
   * exists to prevent.
   */
  onDispatchError?: (message: string) => void;
};

type StartResult = { error?: string };

// Backstop for a stream that goes silent without a terminal frame. The backend
// emits progress/tool frames (and an idle heartbeat) continuously, so this only
// fires on a true stall (lost connection / hung run). Re-armed on every frame.
const STREAM_INACTIVITY_TIMEOUT_MS = 120_000;

// On a stall we consult the durable run row. Only a confirmed completed/failed
// status ends the stream; a still-running row, a transient fetch failure, or a
// missing run id re-arms — up to this many times before we surface a stall, so
// a merely slow (but alive) run is never falsely aborted.
const MAX_TRANSIENT_WATCHDOG_POLLS = 3;

export function useJainaChatStream() {
  const [state, setState] = useState<JainaStreamState>(() => createInitialJainaStreamState());
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The run THIS reader owns, as reactive state so the projection can skip it (exactly one
  // folder per run — the same invariant as organic's `liveRunId`).
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  // Which run we've already registered into the app-level store, and the session/brand it
  // belongs to (captured at start; the run's own frames confirm the session id).
  const registeredRunRef = useRef<string | null>(null);
  const runContextRef = useRef<{ sessionId?: string; brandId?: string }>({});
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  // Register the durable run into the app-level store the moment its runId is known. This is
  // what makes AgentRunsProvider tail it live (RunTail) and what lets useProjectedJainaRun
  // reattach after the user navigates away — the run outlives this reader.
  useEffect(() => {
    const runId = state.runId;
    if (!runId || registeredRunRef.current === runId) return;
    if (state.status !== 'streaming' && state.status !== 'starting') return;
    registeredRunRef.current = runId;
    setLiveRunId(runId);
    const ctx = runContextRef.current;
    useAgentRunStore.getState().upsertRun({
      runId,
      agent: 'jaina',
      sessionId: ctx.sessionId ?? state.runSessionId ?? '',
      brandId: ctx.brandId,
      status: 'running',
      createdAt: new Date().toISOString(),
    });
  }, [state.runId, state.status, state.runSessionId]);

  const reset = useCallback(() => {
    clearWatchdog();
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    abortRef.current = null;
    readerRef.current = null;
    registeredRunRef.current = null;
    setLiveRunId(null);
    setState(createInitialJainaStreamState());
  }, [clearWatchdog]);

  // Release the LOCAL view without stopping the run — the session-switch / unmount path. The
  // run keeps executing (Backend) and the store keeps tailing it (RunTail), so the projection
  // takes over rendering it when the user returns. Mirrors organic's detach.
  const detach = useCallback(() => {
    clearWatchdog();
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    abortRef.current = null;
    readerRef.current = null;
    registeredRunRef.current = null;
    setLiveRunId(null);
    setState((prev) => ({ ...prev, status: 'idle' }));
  }, [clearWatchdog]);

  // Actually STOP the run — Backend row flipped to `cancelled` so it can't keep burning tokens
  // or be resurrected by the projection. `targetRunId` lets the caller stop a run this reader
  // does not own (the projected run you returned to); it defaults to the owned run.
  const cancel = useCallback(
    async (targetRunId?: string) => {
      const runId = targetRunId ?? stateRef.current.runId;
      clearWatchdog();
      abortRef.current?.abort();
      readerRef.current?.cancel().catch(() => {});
      setLiveRunId(null);
      registeredRunRef.current = null;
      setState((prev) => ({ ...prev, status: 'idle' }));

      if (!runId) return;
      // Optimistically mark the store terminal so the projection stops rendering it as live and
      // AgentRunsProvider fires no false completion toast; the Backend call makes it durable.
      const record = useAgentRunStore.getState().runs[runId];
      if (record) {
        useAgentRunStore.getState().upsertRun({ ...record.run, status: 'cancelled' });
      }
      try {
        const token = await getBrowserAccessToken();
        if (!token) return;
        await fetch(`/api/agents/jaina/chat/runs/${encodeURIComponent(runId)}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Best-effort: the row may already be terminal (a 409), which is fine.
      }
    },
    [clearWatchdog],
  );

  // Unmount releases the view but does NOT stop the run — leaving /paid-media must not kill a
  // turn mid-sentence. (It used to call cancel, which is why Jaina turns died on navigation.)
  useEffect(() => () => detach(), [detach]);

  const getAccessToken = useCallback(async () => {
    const token = await getBrowserAccessToken();
    if (!token) {
      throw new Error('No authentication token available');
    }
    return token;
  }, []);

  const clearMemory = useCallback(
    async (adAccountId: string) => {
      const token = await getAccessToken();
      const response = await fetch(
        '/api/agents/jaina/chat/memory?ad_account_id=' + encodeURIComponent(adAccountId),
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => 'Failed to clear memory.');
        throw new Error(detail || 'Failed to clear memory.');
      }
    },
    [getAccessToken],
  );

  const start = useCallback(
    async (input: JainaChatInput): Promise<StartResult> => {
      reset();
      // Remember which conversation/brand this run belongs to, so the registration effect can
      // bind the store run to the right session for the projection to find later.
      runContextRef.current = { sessionId: input.sessionId, brandId: input.brandId };
      setState((prev) => ({ ...prev, status: 'starting' }));

      const controller = new AbortController();
      abortRef.current = controller;

      let payload: JainaChatStreamRequest;
      try {
        payload = jainaChatRequestSchema.parse({
          query: input.query,
          include_thoughts: true,
          force_report_artifact: input.forceReportArtifact,
          message_metadata:
            input.references && input.references.length > 0
              ? { references: input.references }
              : undefined,
          userId: input.userId,
          canvas: input.canvas,
          clarification: input.clarificationId ? { id: input.clarificationId } : undefined,
          ...(input.planAction ? { plan_action: input.planAction } : {}),
          ...(input.scaffoldAction ? { scaffold_action: input.scaffoldAction } : {}),
          context: {
            adAccountId: input.adAccountId,
            brandId: input.brandId,
            sessionId: input.sessionId,
            canvas: input.canvas,
            // Jaina answers questions phrased in the user's local calendar
            // ("last week", "since yesterday"), so it needs their zone.
            timezone: browserTimezone(),
            ...(input.references && input.references.length > 0
              ? { references: input.references }
              : {}),
            ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid request payload';
        setState((prev) => ({ ...prev, status: 'error', error: message }));
        input.onDispatchError?.(message);
        return { error: message };
      }

      try {
        const token = await getAccessToken();
        const response = await fetch('/api/agents/jaina/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => 'Failed to start stream.');
          throw new Error(detail || 'Failed to start stream.');
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        setState((prev) => ({ ...prev, status: 'streaming' }));

        // On prolonged silence, authoritatively check the durable run row before
        // giving up — so we never falsely error a run that actually finished or
        // is merely slow. Only a confirmed completed/failed status is decisive.
        let transientWatchdogPolls = 0;
        const armWatchdog = () => {
          clearWatchdog();
          watchdogRef.current = setTimeout(async () => {
            const surfaceStall = () => {
              controller.abort();
              setState((prev) =>
                prev.status === 'complete' || prev.status === 'error'
                  ? prev
                  : {
                      ...prev,
                      status: 'error',
                      error: 'Jaina stopped responding. Please try again.',
                    },
              );
            };

            const reArmOrStall = () => {
              transientWatchdogPolls += 1;
              if (transientWatchdogPolls < MAX_TRANSIENT_WATCHDOG_POLLS) {
                armWatchdog();
                return;
              }
              surfaceStall();
            };

            const currentRunId = stateRef.current.runId;
            if (!currentRunId) {
              reArmOrStall();
              return;
            }

            let runStatus: string | undefined;
            let runErrorMessage: string | null | undefined;
            try {
              const res = await fetch(
                `/api/agents/jaina/chat/runs/${encodeURIComponent(currentRunId)}`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              if (res.ok) {
                const body = (await res.json().catch(() => null)) as {
                  run?: { status?: string; error_message?: string | null };
                } | null;
                runStatus = body?.run?.status;
                runErrorMessage = body?.run?.error_message;
              }
            } catch {
              // transient — handled by reArmOrStall below
            }

            if (runStatus === 'completed') {
              controller.abort();
              setState((prev) =>
                prev.status === 'error' ? prev : { ...prev, status: 'complete' },
              );
              return;
            }
            if (runStatus === 'failed') {
              controller.abort();
              setState((prev) => ({
                ...prev,
                status: 'error',
                error: runErrorMessage || 'Jaina run failed.',
              }));
              return;
            }
            if (runStatus === 'running' || runStatus === 'pending') {
              transientWatchdogPolls = 0;
              armWatchdog();
              return;
            }
            reArmOrStall();
          }, STREAM_INACTIVITY_TIMEOUT_MS);
        };

        armWatchdog();

        await readNdjsonStream({
          reader,
          onLine: (line) => {
            transientWatchdogPolls = 0;
            armWatchdog();
            const event = parseJainaStreamEvent(line);
            if (event) {
              setState((prev) => reduceJainaStreamEvent(prev, event));
            }
          },
        });

        clearWatchdog();

        // Reader closed. If a terminal frame already set complete/error, keep it.
        // Otherwise finalize from whatever was streamed: render if there is content,
        // else surface an error rather than a silent/empty "complete".
        setState((prev) => {
          if (prev.status === 'error' || prev.status === 'complete') return prev;
          return hasRenderableStreamContent(prev)
            ? { ...prev, status: 'complete' }
            : {
                ...prev,
                status: 'error',
                error: 'Jaina ended unexpectedly. Please try again.',
              };
        });
      } catch (error) {
        clearWatchdog();
        const message = error instanceof Error ? error.message : 'Stream failed';
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, status: 'error', error: message }));
          input.onDispatchError?.(message);
        }
        return { error: message };
      }

      return {};
    },
    [getAccessToken, reset, clearWatchdog],
  );

  return {
    state,
    start,
    cancel,
    detach,
    reset,
    clearMemory,
    liveRunId,
  };
}
