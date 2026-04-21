"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readNdjsonStream } from "@/lib/streaming/readNdjsonStream";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { getApiBaseUrl } from "@/lib/api/config";
import type { CalendarPlacement } from "@/lib/organic/calendar-generation";
import type { AgentChatInput, AgentJobState } from "@/components/organic/agent/types";
import type { PanelAction } from "@/components/organic/agent/useOrganicAgentReducer";

function parseJobUpdate(
  type: string,
  event: Record<string, unknown>
): Partial<AgentJobState> & { jobId: string } {
  const jobId = event.jobId as string;
  const brandId = event.brandId as string;

  switch (type) {
    case "job.enqueued":
      return {
        jobId,
        brandId,
        platform: event.platform as string | undefined,
        scheduledAt: event.scheduledAt as string | undefined,
        trendId: event.trendId as string | null | undefined,
        status: "queued",
      };
    case "job.progress":
      return {
        jobId,
        brandId,
        status: "running",
        stage: event.stage as string | undefined,
        agentName: event.agentName as string | undefined,
        message: event.message as string | undefined,
      };
    case "draft.ready":
      return {
        jobId,
        brandId,
        draftId: event.draftId as string,
        placement: event.placement as CalendarPlacement,
      };
    case "job.completed":
      return {
        jobId,
        brandId,
        status: "completed",
        draftId: event.draftId as string,
      };
    case "job.failed":
      return {
        jobId,
        brandId,
        status: "failed",
        error: event.error as { code?: string; message: string },
      };
    case "job.cancelled":
      return { jobId, brandId, status: "cancelled" };
    default:
      return { jobId, brandId };
  }
}

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

            const type = event.type as string;

            switch (type) {
              case "response.output_text.delta":
                dispatch({ type: "STREAM_DELTA", delta: (event.delta as string) ?? "" });
                break;
              case "tool.call":
                dispatch({
                  type: "STREAM_TOOL_CALL",
                  event: {
                    toolCallId: event.toolCallId as string,
                    toolName: event.toolName as string,
                    args: event.args,
                  },
                });
                break;
              case "tool.result":
                dispatch({
                  type: "STREAM_TOOL_RESULT",
                  toolCallId: event.toolCallId as string,
                  result: event.result,
                });
                break;
              case "response.error":
                dispatch({ type: "STREAM_ERROR", error: event.message as string });
                break;
              case "response.done":
                dispatch({ type: "STREAM_COMPLETE" });
                break;
              case "job.enqueued":
              case "job.progress":
              case "draft.ready":
              case "job.completed":
              case "job.failed":
              case "job.cancelled":
                dispatch({ type: "JOB_UPDATE", job: parseJobUpdate(type, event) });
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
