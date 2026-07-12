'use client';

import { AGENT_CHAT_STARTED, AGENT_RUN_QUEUED } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyOrganicFrame,
  type OrganicFrameHandlers,
} from '@/components/organic/agent/applyOrganicFrame';
import type { AgentChatInput } from '@/components/organic/agent/types';
import type { PanelAction } from '@/components/organic/agent/useOrganicAgentReducer';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { readNdjsonStream } from '@/lib/streaming/readNdjsonStream';

const RECONNECT_BACKOFF_MS = 750;
const MAX_RECONNECT_ATTEMPTS = 5;

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
  }, []);

  /**
   * Actually STOP the run — what the user means by pressing stop. Aborting the local reader
   * alone would just hide a run that keeps burning tokens, which is exactly the bug the old
   * DB-only cancel had on the Backend.
   */
  const cancel = useCallback(async () => {
    const runId = runIdRef.current;
    detach();
    if (!runId) return;

    try {
      const token = await getBrowserAccessToken();
      if (!token) return;
      await fetch(`${getApiBaseUrl()}/api/organic/agent/runs/${runId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // The run row is the source of truth; a failed cancel surfaces as the run continuing.
    }
  }, [detach]);

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

      const dispatchParsed = (event: Record<string, unknown>): void => {
        const type = typeof event.type === 'string' ? event.type : undefined;

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
            useAgentRunStore.getState().upsertRun({
              runId: runIdFromEvent,
              agent: 'organic',
              sessionId: sessionIdFromEvent ?? '',
              brandId: input.brandId,
              status: 'running',
              createdAt: new Date().toISOString(),
            });
            opts?.onRunStarted?.(runIdFromEvent);
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

            const seq = typeof event.seq === "number" ? event.seq : null;
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

      try {
        // Proxied through the Next.js route at /api/organic/agent/chat
        // (mirrors the Jaina chat-stream pattern). The proxy attaches the
        // Supabase access token server-side from the request cookie and
        // emits the PostHog `organic_agent_chat_message_sent` event before
        // forwarding to the Backend.
        const response = await fetch("/api/organic/agent/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
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
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => 'Failed to start stream.');
          throw new Error(detail || 'Failed to start stream.');
        }

        const initialReader = response.body.getReader();
        if (mode === 'chat') readerRef.current = initialReader;
        await consumeReader(initialReader);

        // Stream closed. If we never saw a terminal frame and we have a
        // runId, the connection dropped mid-turn — reconnect via the
        // resumable GET endpoint and continue from the last-seen seq.
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

          // Proxied through /api/organic/agent/runs/[runId]/events — the
          // server-side route attaches the Supabase token from the cookie
          // and forwards to the Backend resume endpoint.
          const resumeUrl = `/api/organic/agent/runs/${chatRunId}/events?after_seq=${lastSeq + 1}`;
          const resumeResponse = await fetch(resumeUrl, {
            headers: {
              Accept: "application/x-ndjson",
            },
            signal: controller.signal,
          });

          if (!resumeResponse.ok || !resumeResponse.body) {
            // If the run can't be found (e.g. older deployment without
            // chat-run persistence), surface the dropped-connection
            // error instead of silently spinning.
            throw new Error(
              `Stream reconnect failed (status ${resumeResponse.status}). The connection was lost and could not be resumed.`
            );
          }

          const resumeReader = resumeResponse.body.getReader();
          if (mode === "chat") readerRef.current = resumeReader;
          await consumeReader(resumeReader);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stream failed";
        if (mode === "chat" && !controller.signal.aborted) {
          dispatch({ type: "STREAM_ERROR", error: message });
        }
        return { error: message };
      } finally {
        if (mode === "chat") {
          dispatch({ type: "STREAM_COMPLETE" });
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

  return { start, startControl, cancel, isStreaming };
}
