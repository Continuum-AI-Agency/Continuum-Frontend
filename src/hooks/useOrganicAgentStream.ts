"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readNdjsonStream } from "@/lib/streaming/readNdjsonStream";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { getApiBaseUrl } from "@/lib/api/config";
import type { AgentChatInput } from "@/components/organic/agent/types";
import type { PanelAction } from "@/components/organic/agent/useOrganicAgentReducer";
import { parseOrganicStreamEvent } from "@/components/organic/agent/streamEventParser";

export function useOrganicAgentStream(dispatch: React.Dispatch<PanelAction>) {
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

      try {
        const token = await getBrowserAccessToken();
        if (!token) throw new Error("No authentication token available");

        const response = await fetch(`${getApiBaseUrl()}/api/organic/agent/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            brandId: input.brandId,
            sessionId: input.sessionId,
            messages: input.messages,
            references: input.references,
            message_metadata:
              input.references && input.references.length > 0
                ? { references: input.references }
                : undefined,
            weekStart: input.weekStart,
            timezone: input.timezone,
            platformAccountIds: input.platformAccountIds,
            context:
              input.references && input.references.length > 0
                ? { references: input.references }
                : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "Failed to start stream.");
          throw new Error(detail || "Failed to start stream.");
        }

        const reader = response.body.getReader();
        readerRef.current = reader;

        await readNdjsonStream({
          reader,
          onLine: (line) => {
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line) as Record<string, unknown>;
            } catch {
              return;
            }

            const type = typeof event.type === "string" ? event.type : undefined;
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
                break;
              case "complete":
                dispatch({ type: "STREAM_COMPLETE" });
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
              case "ignored":
                break;
              case "invalid":
                console.warn("[organic-agent-stream] Invalid event payload ignored", {
                  type: parsed.type ?? type,
                  payload: event,
                });
                break;
            }
          },
        });
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
    [dispatch, cancel]
  );

  return { start, cancel, isStreaming };
}
