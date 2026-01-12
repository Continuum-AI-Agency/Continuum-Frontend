"use client";

import { useCallback, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api/config";
import type { BackendChatImageRequestPayload, StreamState } from "@/lib/types/chatImage";
import type { NodeOutput } from "../types/execution";
import { useToast } from "@/components/ui/ToastProvider";
import { parseDataUrl } from "../utils/dataUrl";

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
  const outputRef = useRef<NodeOutput | null>(null);
  const { show } = useToast();

  const resolveInitUrl = useCallback((path: string) => {
    const hasClientApiBase =
      typeof window !== "undefined" &&
      (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL);

    if (hasClientApiBase) {
      return getApiUrl(path);
    }

    if (typeof window !== "undefined") {
      return `/api${path.startsWith("/") ? path : `/${path}`}`;
    }

    return getApiUrl(path);
  }, []);

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
      outputRef.current = null;
      const expectedMedium = payload.medium;
      const initUrl = payload.medium === "video"
        ? resolveInitUrl("/ai-studio/generate-video")
        : resolveInitUrl("/ai-studio/generate");

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
          const events = chunk.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? "";

          for (const evt of events) {
            let eventName: string | undefined;
            const dataLines: string[] = [];
            for (const rawLine of evt.split(/\r?\n/)) {
              const line = rawLine.replace(/\r$/, "");
              if (line.startsWith("event:")) {
                eventName = line.replace(/^event:\s*/, "").trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.replace(/^data:\s*/, ""));
              }
            }
            if (!dataLines.length) continue;
            const jsonStr = dataLines.join("\n");

            try {
              type StreamPayload = {
                jobId?: string;
                pct?: number;
                etaMs?: number;
                base64?: string;
                data_url?: string;
                bytes?: string;
                mime_type?: string;
                signed_url?: string;
                download_url?: string;
                poster_base64?: string;
                storage?: { signed_url?: string };
                message?: string;
              };

              const parsed = JSON.parse(jsonStr) as StreamPayload;
              if (parsed.jobId) jobId = parsed.jobId;

              if (eventName === "progress") {
                setStreamState((prev) => ({
                  ...prev,
                  status: "streaming",
                  progressPct: parsed.pct ?? prev.progressPct ?? 0,
                  etaMs: parsed.etaMs,
                }));
              }

              const rawImageValue =
                parsed.base64 ??
                parsed.data_url ??
                parsed.bytes;
              const parsedImage = rawImageValue?.startsWith("data:")
                ? parseDataUrl(rawImageValue)
                : null;
              const imageBase64 = parsedImage?.base64 ?? (rawImageValue ? rawImageValue.replace(/^data:image\/[^;]+;base64,/, "") : undefined);
              const normalizedImageBase64 = imageBase64 ? imageBase64.replace(/\s+/g, "") : undefined;
              const imageMimeType = parsedImage?.mimeType ?? parsed.mime_type ?? "image/png";

              if (eventName === "image" && normalizedImageBase64) {
                console.info("[studio] image event received", {
                  nodeId,
                  mimeType: imageMimeType,
                  base64Length: normalizedImageBase64.length,
                });
                if (expectedMedium === "image") {
                  finalOutput = {
                    type: "image",
                    base64: normalizedImageBase64,
                    mimeType: imageMimeType,
                  };
                  outputRef.current = finalOutput;
                }
              }

              const videoMime = parsed.mime_type ?? "video/mp4";
              const videoUrl =
                parsed.signed_url ??
                parsed.storage?.signed_url ??
                parsed.download_url ??
                parsed.data_url ??
                (parsed.bytes ? `data:${videoMime};base64,${parsed.bytes}` : undefined) ??
                (parsed.base64 ? `data:${videoMime};base64,${parsed.base64}` : undefined);

              if ((eventName === "video" || eventName === "stored") && videoUrl) {
                if (expectedMedium !== "video") {
                  return;
                }
                finalOutput = {
                  type: "video",
                  url: videoUrl,
                  posterBase64: parsed.poster_base64,
                };
                outputRef.current = finalOutput;
              }

              if (eventName === "complete" && !finalOutput) {
                if (expectedMedium === "image" && normalizedImageBase64) {
                  finalOutput = {
                    type: "image",
                    base64: normalizedImageBase64,
                    mimeType: imageMimeType,
                  };
                  outputRef.current = finalOutput;
                } else if (expectedMedium === "video" && videoUrl) {
                  finalOutput = {
                    type: "video",
                    url: videoUrl,
                    posterBase64: parsed.poster_base64,
                  };
                  outputRef.current = finalOutput;
                }
              }

              if (eventName === "error") {
                setStreamState((prev) => ({
                  ...prev,
                  status: "error",
                  error: parsed.message,
                }));
                show({
                  title: "Generation failed",
                  description: parsed.message ?? "Stream error",
                  variant: "error",
                });
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

        if (!finalOutput && outputRef.current) {
          finalOutput = outputRef.current;
        }

        if (finalOutput) {
          console.info("[studio] executeGeneration returning output", {
            nodeId,
            type: finalOutput.type,
          });
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
        if (!isCancelledRef.current) {
          const description = message.includes("Failed to fetch")
            ? "Unable to reach the AI Studio API. Check your API base URL and that the backend is running."
            : message;
          show({
            title: "Generation failed",
            description,
            variant: "error",
          });
        }
        return { success: false, error: message };
      }
    },
    [streamState.status, streamState.error, show, resolveInitUrl]
  );

  return { streamState, executeGeneration, cancel, reset };
}
