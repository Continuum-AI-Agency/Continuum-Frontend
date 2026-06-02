"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readNdjsonStream } from "@/lib/streaming/readNdjsonStream";
import type { AgentChatInput } from "@/components/organic/agent/types";
import type { PanelAction } from "@/components/organic/agent/useOrganicAgentReducer";
import { parseOrganicStreamEvent } from "@/components/organic/agent/streamEventParser";

const RECONNECT_BACKOFF_MS = 750;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useOrganicAgentStream(
  dispatch: React.Dispatch<PanelAction>,
  opts?: { onRunStarted?: (runId: string) => void }
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    abortRef.current = null;
    readerRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  const start = useCallback(
    async (input: AgentChatInput): Promise<{ error?: string }> => {
      cancel();
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let chatRunId: string | null = null;
      let lastSeq = -1;
      let terminal = false;

      const dispatchParsed = (event: Record<string, unknown>): void => {
        const type = typeof event.type === "string" ? event.type : undefined;

        // Capture the runId from agent.chat_started; this is the
        // first frame the Backend emits when the chat path opens a
        // resumable run. Reconnect needs it.
        if (type === "agent.chat_started" && !chatRunId) {
          const data = event.data as { runId?: unknown; sessionId?: unknown } | undefined;
          const runIdFromEvent = typeof data?.runId === "string" ? data.runId : null;
          if (runIdFromEvent) {
            chatRunId = runIdFromEvent;
            opts?.onRunStarted?.(runIdFromEvent);
          }
          return;
        }

        const parsed = parseOrganicStreamEvent(event);

        switch (parsed.kind) {
          case "delta":
            dispatch({ type: "STREAM_DELTA", delta: parsed.delta });
            break;
          case "toolCall":
            dispatch({ type: "STREAM_TOOL_CALL", event: parsed.event });
            break;
          case "toolResult":
            dispatch({
              type: "STREAM_TOOL_RESULT",
              toolCallId: parsed.toolCallId,
              result: parsed.result,
            });
            break;
          case "error":
            dispatch({ type: "STREAM_ERROR", error: parsed.message });
            terminal = true;
            break;
          case "complete":
            dispatch({ type: "STREAM_COMPLETE" });
            terminal = true;
            break;
          case "uiCard":
            dispatch({ type: "STREAM_UI_CARD", card: parsed.card });
            break;
          case "postCard":
            dispatch({
              type: "JOB_UPDATE",
              job: { jobId: parsed.card.jobId, brandId: parsed.card.brandId, uiPostCard: parsed.card },
            });
            break;
          case "jobUpdate":
            dispatch({ type: "JOB_UPDATE", job: parsed.job });
            break;
          case "pipelineStage":
            dispatch({ type: "PIPELINE_STAGE", event: parsed.event });
            break;
          case "pipelineCard":
            dispatch({ type: "PIPELINE_CARD", card: parsed.card });
            break;
          case "planStatus":
            dispatch({ type: "PLAN_STATUS", event: parsed.event });
            break;
          case "toolApproval":
            dispatch({ type: "TOOL_APPROVAL_ADD", approval: parsed.approval });
            break;
          case "bulkRun":
            dispatch({
              type: "BULK_RUN_START",
              run: { runId: parsed.run.runId, planId: parsed.run.planId, total: parsed.run.total },
            });
            break;
          case "runStarted":
            opts?.onRunStarted?.(parsed.runId);
            break;
          case "ignored":
            break;
          case "invalid":
            console.warn("[organic-agent-stream] Invalid event payload ignored", {
              type: parsed.type ?? type,
              payload: event,
            });
            break;
        }
      };

      const consumeReader = async (
        reader: ReadableStreamDefaultReader<Uint8Array>
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
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "Failed to start stream.");
          throw new Error(detail || "Failed to start stream.");
        }

        const initialReader = response.body.getReader();
        readerRef.current = initialReader;
        await consumeReader(initialReader);

        // Stream closed. If we never saw a terminal frame and we have a
        // runId, the connection dropped mid-turn — reconnect via the
        // resumable GET endpoint and continue from the last-seen seq.
        let attempts = 0;
        while (!terminal && !controller.signal.aborted && chatRunId && attempts < MAX_RECONNECT_ATTEMPTS) {
          attempts += 1;
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, RECONNECT_BACKOFF_MS * attempts);
            controller.signal.addEventListener("abort", () => {
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
          readerRef.current = resumeReader;
          await consumeReader(resumeReader);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stream failed";
        if (!controller.signal.aborted) {
          dispatch({ type: "STREAM_ERROR", error: message });
        }
        return { error: message };
      } finally {
        dispatch({ type: "STREAM_COMPLETE" });
        setIsStreaming(false);
      }

      return {};
    },
    // Match original hook contract: opts is captured by closure rather than
    // listed as a dep so consumers don't have to memoize the options object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, cancel]
  );

  return { start, cancel, isStreaming };
}
