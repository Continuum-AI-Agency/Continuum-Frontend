"use client";

import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { readNdjsonStream } from "@/lib/streaming/readNdjsonStream";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { getApiBaseUrl } from "@/lib/api/config";
import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";

const REPOLL_DELAY_MS = 1500;
const REPOLL_AFTER_EVENTS_MS = 500;

export function useCalendarRunStream() {
  const abortRef = useRef<AbortController | null>(null);

  const { setGridStatus, setGridProgress, setGridError, setGridJobId, addDraft, updateDraft } =
    useCalendarStore(
      useShallow((s) => ({
        setGridStatus: s.setGridStatus,
        setGridProgress: s.setGridProgress,
        setGridError: s.setGridError,
        setGridJobId: s.setGridJobId,
        addDraft: s.addDraft,
        updateDraft: s.updateDraft,
      }))
    );

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const attachRun = useCallback(
    async (runId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setGridJobId(runId);
      setGridStatus("running");

      let afterSeq = 0;
      let isTerminal = false;
      let isError = false;
      let completed = 0;
      let total = 0;

      try {
        while (!isTerminal && !controller.signal.aborted) {
          const token = await getBrowserAccessToken();
          if (!token) throw new Error("No authentication token available");

          const url = `${getApiBaseUrl()}/api/organic/agent/runs/${runId}/events?after_seq=${afterSeq}`;
          const response = await fetch(url, {
            headers: {
              Accept: "application/x-ndjson",
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error(`Run events fetch failed: ${response.status}`);
          }

          let hadEvents = false;

          await readNdjsonStream({
            reader: response.body.getReader(),
            onLine: (line) => {
              let event: Record<string, unknown>;
              try {
                event = JSON.parse(line) as Record<string, unknown>;
              } catch {
                return;
              }

              const seq = typeof event.seq === "number" ? event.seq : null;
              if (seq !== null) afterSeq = seq + 1;
              hadEvents = true;

              const type = typeof event.type === "string" ? event.type : undefined;

              if (type === "progress") {
                total = typeof event.total === "number" ? event.total : total;
                setGridProgress({
                  percent: typeof event.percent === "number" ? event.percent : 0,
                  stage: typeof event.stage === "string" ? event.stage : undefined,
                  message: typeof event.message === "string" ? event.message : undefined,
                  completed,
                  total,
                });
              }

              if (type === "slot_started") {
                const placementId = event.placement_id as string | undefined;
                const dayId = (event.day_id ?? event.dayId) as string | undefined;

                if (placementId && dayId) {
                  const platform = (event.platform as string | undefined) ?? "instagram";
                  addDraft(dayId, buildPlaceholderDraft(placementId, dayId, platform, event));
                } else if (placementId) {
                  updateDraft(placementId, (d) => ({ ...d, status: "streaming" }));
                }
              }

              if (type === "slot_completed") {
                completed += 1;
                const placementId = event.placement_id as string | undefined;
                if (placementId) {
                  updateDraft(placementId, (d) => ({ ...d, status: "draft" }));
                }
                setGridProgress({
                  percent: Math.round((completed / Math.max(total, 1)) * 100),
                  completed,
                  total,
                });
              }

              if (type === "slot_failed") {
                const placementId = event.placement_id as string | undefined;
                if (placementId) {
                  updateDraft(placementId, (d) => ({
                    ...d,
                    status: "failed",
                    generationError: (event.error as string | undefined) ?? "Generation failed",
                  }));
                }
              }

              if (type === "placement") {
                const data = isRecord(event.data) ? event.data : event;
                const placementId = (event.placement_id ?? data.placement_id) as string | undefined;
                const dayId = (event.day_id ?? data.day_id) as string | undefined;

                if (!placementId) return;

                const patch = buildPlacementPatch(data, event);

                if (dayId) {
                  const platform = (data.platform ?? event.platform) as string | undefined;
                  addDraft(dayId, {
                    id: placementId,
                    timeLabel: strOf(data.time ?? event.time) ?? "",
                    dateLabel: dayId,
                    platforms: [(platform ?? "instagram") as OrganicCalendarDraft["platforms"][number]],
                    tags: [],
                    mediaCount: 1,
                    objective: "Draft",
                    ...patch,
                  });
                } else {
                  updateDraft(placementId, (d) => ({ ...d, ...patch }));
                }
              }

              if (type === "error") {
                setGridStatus("error");
                setGridError((event.message as string | undefined) ?? "Generation failed");
                isError = true;
                isTerminal = true;
              }

              if (type === "complete" || type === "run_completed") {
                isTerminal = true;
              }
            },
          });

          if (!isTerminal && !controller.signal.aborted) {
            await delay(hadEvents ? REPOLL_AFTER_EVENTS_MS : REPOLL_DELAY_MS, controller.signal);
          }
        }

        if (!controller.signal.aborted && !isError) {
          setGridStatus("complete");
          setGridJobId(null);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setGridStatus("error");
        setGridError(error instanceof Error ? error.message : "Run stream failed");
      }
    },
    [addDraft, setGridError, setGridJobId, setGridProgress, setGridStatus, updateDraft]
  );

  return { attachRun };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function strOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildPlaceholderDraft(
  placementId: string,
  dayId: string,
  platform: string,
  event: Record<string, unknown>
): OrganicCalendarDraft {
  return {
    id: placementId,
    title: "",
    summary: "",
    timeLabel: strOf(event.time) ?? "",
    dateLabel: dayId,
    status: "streaming",
    platforms: [platform as OrganicCalendarDraft["platforms"][number]],
    format: strOf(event.format) ?? "Post",
    objective: "Draft",
    captionPreview: "",
    tags: [],
    mediaCount: 1,
  };
}

function buildPlacementPatch(
  data: Record<string, unknown>,
  event: Record<string, unknown>
): Partial<OrganicCalendarDraft> & Pick<OrganicCalendarDraft, "status" | "title" | "summary" | "captionPreview" | "format"> {
  return {
    status: "draft",
    title: strOf(data.title) ?? "",
    summary: strOf(data.summary) ?? "",
    captionPreview: strOf(data.caption_preview ?? data.captionPreview) ?? "",
    creativeIdea: strOf(data.creative_idea ?? data.creativeIdea),
    creativeDirectionPrompt: strOf(data.creative_direction_prompt ?? data.creativeDirectionPrompt),
    thumbnailPrompt: strOf(data.thumbnail_prompt ?? data.thumbnailPrompt),
    format: strOf(data.format ?? event.format) ?? "Post",
  };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
