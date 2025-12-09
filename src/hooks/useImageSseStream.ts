"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getApiUrl } from "@/lib/api/config";
import type { BackendChatImageRequestPayload, StreamState, StreamEvent } from "@/lib/types/chatImage";

type StartOptions = {
  initUrl?: string; // single endpoint that streams SSE directly on POST
  expectedMedia?: "image" | "video";
};

type StartResult = { jobId?: string; error?: string };

const DEFAULT_INIT = process.env.NEXT_PUBLIC_AI_STUDIO_INIT_URL || getApiUrl("/ai-studio/generate");

export function useImageSseStream() {
  const [state, setState] = useState<StreamState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    abortRef.current = null;
    readerRef.current = null;
    setState({ status: "idle" });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    setState((prev) => ({ ...prev, status: "idle" }));
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  const start = useCallback(
    async (payload: BackendChatImageRequestPayload, options?: StartOptions): Promise<StartResult> => {
      const initUrl = options?.initUrl ?? DEFAULT_INIT;
      const expectedMedia = options?.expectedMedia ?? "image";

      reset();
      setState({ status: "starting" });

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
          const msg = body.includes("<!DOCTYPE") ? "Init endpoint returned HTML (likely 404). Check API base." : body;
          throw new Error(`init failed ${res.status}: ${msg.slice(0, 200)}`);
        }

        setState({ status: "streaming", progressPct: 0 });

        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = "";

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
              type StreamEventPayload = {
                jobId?: string;
                phase?: string;
                pct?: number;
                etaMs?: number;
                base64?: string;
                data_url?: string;
                progress?: number;
                poster_base64?: string;
                download_url?: string;
                message?: string;
                mime_type?: string;
                bytes?: string;
                signed_url?: string;
                storage?: { signed_url?: string; bucket?: string; path?: string };
              };

              const parsed = JSON.parse(jsonStr) as StreamEventPayload;
              if (parsed.jobId) jobId = parsed.jobId;

              const mapLastEvent = (
                name: string | undefined,
                payload: StreamEventPayload,
                opts: { videoUrl?: string; posterBase64?: string; thumbBase64?: string }
              ): StreamEvent | undefined => {
                switch (name) {
                  case "status":
                    return {
                      type: "status",
                      status: payload.phase === "complete" ? "completed" : "processing",
                    };
                  case "progress":
                    return { type: "progress", pct: payload.pct ?? 0, etaMs: payload.etaMs };
                  case "image": {
                    const base64 = payload.base64 ?? payload.data_url?.replace(/^data:image\/[^;]+;base64,/, "");
                    if (!base64) return undefined;
                    return { type: "thumbnail", base64 };
                  }
                  case "video":
                  case "stored":
                  case "complete":
                    return {
                      type: "done",
                      base64: opts.posterBase64 ?? opts.thumbBase64 ?? payload.poster_base64,
                      videoUrl: opts.videoUrl,
                      posterBase64: opts.posterBase64 ?? payload.poster_base64,
                    };
                  case "error":
                    return { type: "error", message: payload.message ?? "Stream error" };
                  default:
                    return undefined;
                }
              };

              setState((prev): StreamState => {
                const signedUrl = parsed.signed_url ?? parsed.storage?.signed_url;
                const supabaseVideoUrl = signedUrl;
                const downloadUrl = parsed.download_url ?? (parsed.bytes ? `data:${parsed.mime_type ?? "video/mp4"};base64,${parsed.bytes}` : undefined);
                switch (eventName) {
                  case "status":
                    return {
                      ...prev,
                      status: parsed.phase === "complete" ? "done" : "streaming",
                      lastEvent: mapLastEvent(eventName, parsed, { videoUrl: prev.videoUrl }),
                    };
                  case "progress":
                    return {
                      ...prev,
                      status: "streaming",
                      progressPct: parsed.pct ?? prev.progressPct,
                      etaMs: parsed.etaMs,
                      lastEvent: mapLastEvent(eventName, parsed, { videoUrl: prev.videoUrl }),
                    };
                  case "init":
                    return { ...prev, lastEvent: undefined };
                  case "image": {
                    const imgBase64 = parsed.base64 ?? parsed.data_url?.replace(/^data:image\/[^;]+;base64,/, "");
                    return {
                      ...prev,
                      status: "streaming",
                      progressPct: parsed.progress ?? 100,
                      currentBase64: imgBase64 ?? prev.currentBase64,
                      posterBase64: imgBase64 ?? prev.posterBase64,
                      thumbBase64: imgBase64 ?? prev.thumbBase64,
                      lastEvent: mapLastEvent(eventName, parsed, {
                        thumbBase64: imgBase64 ?? prev.thumbBase64,
                        posterBase64: imgBase64 ?? prev.posterBase64,
                      }),
                    };
                  }
                  case "video": {
                    const mime = parsed.mime_type ?? "video/mp4";
                    const videoUrl: string | undefined =
                      supabaseVideoUrl ??
                      parsed.download_url ??
                      parsed.data_url ??
                      (parsed.bytes ? `data:${mime};base64,${parsed.bytes}` : undefined) ??
                      (parsed.base64 ? `data:${mime};base64,${parsed.base64}` : undefined);
                    return {
                      ...prev,
                      status: "streaming",
                      progressPct: parsed.progress ?? prev.progressPct ?? 0,
                      posterBase64: parsed.poster_base64 ?? prev.posterBase64,
                      currentBase64: prev.currentBase64, // leave images untouched
                      lastEvent: mapLastEvent(eventName, parsed, {
                        videoUrl: expectedMedia === "video" ? videoUrl ?? prev.videoUrl : prev.videoUrl,
                        posterBase64: parsed.poster_base64 ?? prev.posterBase64,
                        thumbBase64: prev.thumbBase64,
                      }),
                      videoUrl: expectedMedia === "video" ? videoUrl ?? prev.videoUrl : prev.videoUrl,
                    };
                  }
                  case "text":
                  case "grounding":
                  case "conversation_append":
                    return { ...prev, lastEvent: undefined };
                  case "stored":
                    return {
                      ...prev,
                      lastEvent: mapLastEvent(eventName, parsed, {
                        videoUrl:
                          expectedMedia === "video"
                            ? supabaseVideoUrl ?? prev.videoUrl ?? downloadUrl ?? prev.videoUrl
                            : prev.videoUrl,
                      }),
                      videoUrl:
                        expectedMedia === "video"
                          ? supabaseVideoUrl ?? prev.videoUrl ?? downloadUrl ?? prev.videoUrl
                          : prev.videoUrl,
                    };
                  case "complete":
                    return {
                      ...prev,
                      status: "done",
                      progressPct: 100,
                      thumbBase64: prev.thumbBase64 ?? prev.currentBase64,
                      lastEvent: mapLastEvent(eventName, parsed, {
                        videoUrl:
                          expectedMedia === "video"
                            ? supabaseVideoUrl ?? prev.videoUrl ?? downloadUrl ?? prev.videoUrl
                            : prev.videoUrl,
                        posterBase64: parsed.poster_base64 ?? prev.posterBase64,
                        thumbBase64: prev.thumbBase64 ?? prev.currentBase64,
                      }),
                      videoUrl:
                        expectedMedia === "video"
                          ? supabaseVideoUrl ?? prev.videoUrl ?? downloadUrl ?? prev.videoUrl
                          : prev.videoUrl,
                    };
                  case "error":
                    return {
                      ...prev,
                      status: "error",
                      error: parsed.message ?? "Stream error",
                      lastEvent: mapLastEvent(eventName, parsed, { videoUrl: prev.videoUrl }),
                    };
                  case "reset":
                    return { status: "idle" };
                  default:
                    return prev;
                }
              });
            } catch (err) {
              console.error("Failed to parse SSE message", err, jsonStr.slice(0, 200));
              setState((prev) => ({ ...prev, status: "error", error: "Stream parse error" }));
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

        pump().catch((err) => {
          console.error("stream-read-failed", err);
          setState((prev) => ({ ...prev, status: "error", error: "Stream ended unexpectedly" }));
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("stream-start-failed", message);
        setState({ status: "error", error: message });
        return { jobId, error: message };
      }

      return { jobId };
    },
    [reset]
  );

  return { state, start, cancel, reset };
}
