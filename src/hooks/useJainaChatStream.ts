"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readNdjsonStream } from "@/lib/streaming/readNdjsonStream";
import {
  feedbackApprovalCommandSchema,
  jainaChatRequestSchema,
  parsePlanDecisionPayload,
  planDecisionCommandSchema,
  planApprovalCommandSchema,
  type JainaChatStreamRequest,
  type ResponsePlanDecisionEventData,
} from "@/lib/jaina/schemas";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import {
  createInitialJainaStreamState,
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
};

type StartResult = { error?: string };
type ApprovePlanInput = { planId: string; approved: boolean; reason?: string };
type ApprovePlanResult = {
  error?: string;
  decision?: ResponsePlanDecisionEventData;
};

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

  const approvePlan = useCallback(
    async (input: ApprovePlanInput): Promise<ApprovePlanResult> => {
      let decisionPayload;
      let compatibilityPayload;
      let legacyPayload;
      try {
        decisionPayload = planDecisionCommandSchema.parse({
          type: "plan.decision",
          data: {
            decision: input.approved ? "approve" : "deny",
            planId: input.planId,
            reason: input.reason,
          },
        });

        compatibilityPayload = feedbackApprovalCommandSchema.parse({
          type: "feedback",
          data: {
            approved: input.approved,
            planId: input.planId,
            reason: input.reason,
          },
        });

        legacyPayload = planApprovalCommandSchema.parse({
          type: "plan.approval",
          data: {
            plan_id: input.planId,
            approved: input.approved,
            note: input.reason,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid plan approval payload";
        return { error: message };
      }

      try {
        const token = await getAccessToken();
        const response = await fetch("/api/agents/jaina/chat/plan/decision", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            primary: decisionPayload,
            compatibility: compatibilityPayload,
            legacy: legacyPayload,
          }),
        });

        if (!response.ok) {
          const detail = await response
            .text()
            .catch(() => "Failed to submit plan approval.");
          throw new Error(detail || "Failed to submit plan approval.");
        }

        const rawDecision = await response.json().catch(() => null);
        const payload =
          rawDecision && typeof rawDecision === "object" && "data" in rawDecision
            ? (rawDecision as { data: unknown }).data
            : rawDecision;

        const parsedDecision = parsePlanDecisionPayload(payload);
        if (!parsedDecision) {
          return {};
        }

        setState((prev) => {
          const nextPlan =
            prev.plan && prev.plan.id === parsedDecision.plan_id
              ? { ...prev.plan, status: parsedDecision.status }
              : prev.plan;
          return {
            ...prev,
            plan: nextPlan,
            pendingPlan: null,
            lastPlanDecision: parsedDecision,
          };
        });

        return { decision: parsedDecision };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to submit plan approval.";
        return { error: message };
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
          userId: input.userId,
          canvas: input.canvas,
          clarification: input.clarificationId
            ? { id: input.clarificationId }
            : undefined,
          context: {
            adAccountId: input.adAccountId,
            brandId: input.brandId,
            sessionId: input.sessionId,
            canvas: input.canvas,
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

        await readNdjsonStream({
          reader,
          onLine: (line) => {
            const event = parseJainaStreamEvent(line);
            if (event) {
              setState((prev) => reduceJainaStreamEvent(prev, event));
            }
          },
        });

        setState((prev) =>
          prev.status === "error" ? prev : { ...prev, status: "complete" }
        );
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
    approvePlan,
  };
}
