"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatImageRequestPayload, StreamEvent, StreamState } from "@/lib/types/chatImage";

type StartOptions = {
  initUrl?: string;
  streamUrl?: string; // optional override; defaults to `${initUrl}/stream` if omitted
};

type StartResult = { jobId?: string };

const DEFAULT_INIT = "/api/ai-studio/chat-generate/init";
const DEFAULT_STREAM = "/api/ai-studio/chat-generate/stream";

export function useImageSseStream() {
  const [state, setState] = useState<StreamState>({ status: "idle" });
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    abortRef.current?.abort();
    eventSourceRef.current = null;
    abortRef.current = null;
    setState({ status: "idle" });
  }, []);

  const cancel = useCallback(() => {
    eventSourceRef.current?.close();
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, status: "idle" }));
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  const start = useCallback(
    async (payload: ChatImageRequestPayload, options?: StartOptions): Promise<StartResult> => {
      const initUrl = options?.initUrl ?? DEFAULT_INIT;
      const streamUrlBase = options?.streamUrl ?? DEFAULT_STREAM;

      reset();
      setState({ status: "starting" });

      const controller = new AbortController();
      abortRef.current = controller;

      let jobId: string | undefined;
      try {
        const res = await fetch(initUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = (await res.json()) as { jobId?: string; streamUrl?: string };
        jobId = json.jobId;
        const streamUrl = json.streamUrl ?? `${streamUrlBase}${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`;

        const es = new EventSource(streamUrl, { withCredentials: true });
        eventSourceRef.current = es;
        setState({ status: "streaming", progressPct: 0 });

        es.addEventListener("message", (evt) => {
          try {
            const parsed = JSON.parse((evt as MessageEvent<string>).data) as StreamEvent;
            setState((prev) => {
              switch (parsed.type) {
                case "progress":
                  return { ...prev, status: "streaming", progressPct: parsed.pct, etaMs: parsed.etaMs, lastEvent: parsed };
                case "chunk":
                  return { ...prev, currentBase64: parsed.base64, lastEvent: parsed };
                case "thumbnail":
                  return { ...prev, posterBase64: parsed.base64, lastEvent: parsed };
                case "status":
                  return { ...prev, status: parsed.status === "failed" ? "error" : prev.status, lastEvent: parsed };
                case "done":
                  return { ...prev, status: "done", currentBase64: parsed.base64 ?? prev.currentBase64, posterBase64: parsed.posterBase64 ?? prev.posterBase64, lastEvent: parsed };
                case "error":
                  return { ...prev, status: "error", error: parsed.message, lastEvent: parsed };
                default:
                  return prev;
              }
            });
          } catch (error) {
            console.error("Failed to parse SSE message", error);
            setState((prev) => ({ ...prev, status: "error", error: "Stream parse error" }));
          }
        });

        es.onerror = () => {
          setState((prev) => ({ ...prev, status: prev.status === "done" ? "done" : "error", error: prev.error ?? "Stream connection error" }));
        };
      } catch (error) {
        console.error("stream-start-failed", error instanceof Error ? error.message : error);
        setState({ status: "error", error: error instanceof Error ? error.message : String(error) });
      }

      return { jobId };
    },
    [reset]
  );

  return { state, start, cancel, reset };
}
