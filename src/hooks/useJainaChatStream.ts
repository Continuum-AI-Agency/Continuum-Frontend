"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readNdjsonStream } from "@/lib/streaming/readNdjsonStream";
import {
  jainaChatRequestSchema,
  type JainaChatStreamRequest,
  type JainaPlanAction,
} from "@/lib/jaina/schemas";
import type { AgentMentionReference } from "@/lib/agent-references";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import {
  createInitialJainaStreamState,
  hasRenderableStreamContent,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
  type JainaStreamState,
} from "@/lib/jaina/stream";

type JainaChatInput = {
  query: string;
  canvas?: boolean;
  adAccountId: string;
  brandId: string;
  sessionId?: string;
  clarificationId?: string;
  userId?: string;
  images?: Array<{ url: string; name?: string }>;
  references?: AgentMentionReference[];
  planAction?: JainaPlanAction;
  forceReportArtifact?: boolean;
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
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearWatchdog();
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    abortRef.current = null;
    readerRef.current = null;
    setState(createInitialJainaStreamState());
  }, [clearWatchdog]);

  const cancel = useCallback(() => {
    clearWatchdog();
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    setState((prev) => ({ ...prev, status: "idle" }));
  }, [clearWatchdog]);

  useEffect(() => () => cancel(), [cancel]);

  const getAccessToken = useCallback(async () => {
    const token = await getBrowserAccessToken();
    if (!token) {
      throw new Error("No authentication token available");
    }
    return token;
  }, []);

  const clearMemory = useCallback(
    async (adAccountId: string) => {
      const token = await getAccessToken();
      const response = await fetch("/api/agents/jaina/chat/memory?ad_account_id=" + encodeURIComponent(adAccountId), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "Failed to clear memory.");
        throw new Error(detail || "Failed to clear memory.");
      }
    },
    [getAccessToken]
  );

  const start = useCallback(
    async (input: JainaChatInput): Promise<StartResult> => {
      reset();
      setState((prev) => ({ ...prev, status: "starting" }));

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
          clarification: input.clarificationId
            ? { id: input.clarificationId }
            : undefined,
          ...(input.planAction ? { plan_action: input.planAction } : {}),
          context: {
            adAccountId: input.adAccountId,
            brandId: input.brandId,
            sessionId: input.sessionId,
            canvas: input.canvas,
            ...(input.references && input.references.length > 0
              ? { references: input.references }
              : {}),
            ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request payload";
        setState((prev) => ({ ...prev, status: "error", error: message }));
        return { error: message };
      }

      try {
        const token = await getAccessToken();
        const response = await fetch("/api/agents/jaina/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "Failed to start stream.");
          throw new Error(detail || "Failed to start stream.");
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        setState((prev) => ({ ...prev, status: "streaming" }));

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
                prev.status === "complete" || prev.status === "error"
                  ? prev
                  : {
                      ...prev,
                      status: "error",
                      error: "Jaina stopped responding. Please try again.",
                    }
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
                { headers: { Authorization: `Bearer ${token}` } }
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

            if (runStatus === "completed") {
              controller.abort();
              setState((prev) =>
                prev.status === "error" ? prev : { ...prev, status: "complete" }
              );
              return;
            }
            if (runStatus === "failed") {
              controller.abort();
              setState((prev) => ({
                ...prev,
                status: "error",
                error: runErrorMessage || "Jaina run failed.",
              }));
              return;
            }
            if (runStatus === "running" || runStatus === "pending") {
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
          if (prev.status === "error" || prev.status === "complete") return prev;
          return hasRenderableStreamContent(prev)
            ? { ...prev, status: "complete" }
            : {
                ...prev,
                status: "error",
                error: "Jaina ended unexpectedly. Please try again.",
              };
        });
      } catch (error) {
        clearWatchdog();
        const message = error instanceof Error ? error.message : "Stream failed";
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, status: "error", error: message }));
        }
        return { error: message };
      }

      return {};
    },
    [getAccessToken, reset, clearWatchdog]
  );

  return {
    state,
    start,
    cancel,
    reset,
    clearMemory,
  };
}
