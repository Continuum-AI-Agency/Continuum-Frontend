"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readNdjsonStream } from "@/lib/streaming/readNdjsonStream";
import { jainaChatRequestSchema, type JainaChatRequest } from "@/lib/jaina/schemas";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { getApiUrl } from "@/lib/api/config";
import {
  createInitialJainaStreamState,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
  type JainaStreamState,
} from "@/lib/jaina/stream";

type JainaChatInput = {
  query: string;
  adAccountId: string;
  brandId?: string;
  userId?: string;
};

type StartResult = { error?: string };

export function useJainaChatStream() {
  const [state, setState] = useState<JainaStreamState>(() => createInitialJainaStreamState());
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    abortRef.current = null;
    readerRef.current = null;
    setState(createInitialJainaStreamState());
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => {});
    setState((prev) => ({ ...prev, status: "idle" }));
  }, []);

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
      const response = await fetch(
        getApiUrl(`/api/agents/jaina/chat/memory?ad_account_id=${encodeURIComponent(adAccountId)}`),
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

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

      let payload: JainaChatRequest;
      try {
        payload = jainaChatRequestSchema.parse({
          query: input.query,
          userId: input.userId,
          context: {
            adAccountId: input.adAccountId,
            brandId: input.brandId,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request payload";
        setState((prev) => ({ ...prev, status: "error", error: message }));
        return { error: message };
      }

      try {
        const token = await getAccessToken();
        const response = await fetch(getApiUrl("/api/agents/jaina/chat/stream"), {
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

        await readNdjsonStream({
          reader,
          onLine: (line) => {
            const event = parseJainaStreamEvent(line);
            setState((prev) => reduceJainaStreamEvent(prev, event));
          },
        });

        if (stateRef.current.status === "streaming") {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "Stream ended unexpectedly",
          }));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stream failed";
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, status: "error", error: message }));
        }
        return { error: message };
      }

      return {};
    },
    [getAccessToken, reset]
  );

  return {
    state,
    start,
    cancel,
    reset,
    clearMemory,
  };
}
