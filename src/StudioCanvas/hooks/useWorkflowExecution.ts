"use client";

import { useCallback, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api/config";
import type { BackendChatImageRequestPayload, StreamState } from "@/lib/types/chatImage";
import type { NodeOutput } from "../types/execution";

type ExecutionStreamState = StreamState & {
  currentNodeId?: string;
};

type ExecutionResult = {
  success: boolean;
  output?: NodeOutput;
  error?: string;
};

export function useWorkflowExecution() {
  const [streamState, setStreamState] = useState<ExecutionStreamState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const isCancelledRef = useRef(false);

  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    setStreamState((prev) => ({ ...prev, status: "idle" }));
  }, []);

  const reset = useCallback(() => {
    isCancelledRef.current = false;
    abortRef.current = null;
    readerRef.current = null;
    setStreamState({ status: "idle" });
  }, []);

  const executeGeneration = useCallback(
    async (
      nodeId: string,
      payload: BackendChatImageRequestPayload
    ): Promise<ExecutionResult> => {
      const initUrl = payload.medium === "video"
        ? getApiUrl("/ai-studio/generate-video")
        : getApiUrl("/ai-studio/generate");

      if (isCancelledRef.current) {
        return { success: false, error: "Execution cancelled" };
      }

      setStreamState({ status: "starting", currentNodeId: nodeId });

      const controller = new AbortController();
      abortRef.current = controller;

      let jobId: string | undefined;
      try {
        const res = await fetch(initUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = await res.text();
          const msg = body.includes("<!DOCTYPE")
            ? "API endpoint returned HTML (likely 404). Check API base URL."
            : body;
          throw new Error(`API request failed: ${res.status} - ${msg.slice(0, 200)}`);
        }

        setStreamState({ status: "streaming", progressPct: 0, currentNodeId: nodeId });

        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = "";
        let finalOutput: NodeOutput | undefined;

        const processChunk = (chunk: string) => {
          const events = chunk.split("\n\n");
          buffer = events.pop() ?? "";

          for (const evt of events) {
            let eventName: string | undefined;
            const dataLines: string[] = [];
            for (const line of evt.split("\n")) {
              if (line.startsWith("event:")) {
                eventName = line.replace(/^event:\s*/, "").trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.replace(/^data:\s*/, ""));
              }
            }
            if (!dataLines.length) continue;
            const jsonStr = dataLines.join("");

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.jobId) jobId = parsed.jobId;

              if (eventName === "progress") {
                setStreamState((prev) => ({
                  ...prev,
                  status: "streaming",
                  progressPct: parsed.pct ?? prev.progressPct ?? 0,
                  etaMs: parsed.etaMs,
                }));
              }

              if (eventName === "image" && parsed.base64) {
                finalOutput = {
                  type: "image",
                  base64: parsed.base64,
                  mimeType: "image/png",
                };
              }

              if ((eventName === "video" || eventName === "complete" || eventName === "stored") && parsed.signed_url) {
                finalOutput = {
                  type: "video",
                  url: parsed.signed_url,
                  posterBase64: parsed.poster_base64,
                };
              }

              if (eventName === "error") {
                setStreamState((prev) => ({
                  ...prev,
                  status: "error",
                  error: parsed.message,
                }));
              }

              if (eventName === "complete") {
                setStreamState((prev) => ({
                  ...prev,
                  status: "done",
                  progressPct: 100,
                }));
              }
            } catch (err) {
              console.error("Failed to parse SSE message", err);
            }
          }
        };

        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim().length) {
              processChunk(buffer + "\n\n");
              buffer = "";
            }
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          processChunk(buffer);
          await pump();
        };

        await pump().catch((err) => {
          console.error("Stream read failed", err);
        });

        if (isCancelledRef.current) {
          return { success: false, error: "Execution cancelled" };
        }

        if (finalOutput) {
          return { success: true, output: finalOutput };
        }

        if (streamState.status === "error") {
           return { success: false, error: streamState.error || "Unknown stream error" };
        }

        return { success: false, error: "No output received from generation" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Generation failed", message);
        setStreamState({ status: "error", error: message, currentNodeId: nodeId });
        return { success: false, error: message };
      }
    },
    [streamState.status, streamState.error]
  );

  return { streamState, executeGeneration, cancel, reset };
}
