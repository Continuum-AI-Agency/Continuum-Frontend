"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";
import { useRunEventStream, type ParsedRunEvent } from "@/hooks/useRunEventStream";

export function useCalendarRunStream() {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const progressRef = useRef({ completed: 0, total: 0 });

  const {
    setGridStatus,
    setGridProgress,
    setGridError,
    setGridJobId,
    addDraft,
    updateDraft,
    upsertGeneration,
    requestCalendarRefetch,
  } = useCalendarStore(
    useShallow((s) => ({
      setGridStatus: s.setGridStatus,
      setGridProgress: s.setGridProgress,
      setGridError: s.setGridError,
      setGridJobId: s.setGridJobId,
      addDraft: s.addDraft,
      updateDraft: s.updateDraft,
      upsertGeneration: s.upsertGeneration,
      requestCalendarRefetch: s.requestCalendarRefetch,
    }))
  );

  const handleEvent = useCallback(
    (event: ParsedRunEvent) => {
      const d = event.data;

      switch (event.type) {
        case "progress": {
          const total = typeof d.total === "number" ? d.total : progressRef.current.total;
          progressRef.current.total = total;
          setGridProgress({
            percent: typeof d.percent === "number" ? d.percent : 0,
            stage: typeof d.stage === "string" ? d.stage : undefined,
            message: typeof d.message === "string" ? d.message : undefined,
            completed: progressRef.current.completed,
            total,
          });
          break;
        }

        case "slot_started": {
          const placementId = d.placement_id as string | undefined;
          const dayId = (d.day_id ?? d.dayId) as string | undefined;
          const platform = (d.platform as string | undefined) ?? "instagram";
          if (placementId && dayId) {
            addDraft(dayId, buildPlaceholderDraft(placementId, dayId, platform, d));
          } else if (placementId) {
            updateDraft(placementId, (dr) => ({ ...dr, status: "streaming" }));
          }
          if (placementId) {
            upsertGeneration({ jobId: placementId, planItemId: placementId, platform, status: "running" });
          }
          break;
        }

        case "slot_stage": {
          const placementId = d.placement_id as string | undefined;
          if (placementId) {
            upsertGeneration({
              jobId: placementId,
              status: "running",
              stage: strOf(d.stage) ?? null,
            });
          }
          break;
        }

        case "slot_text_ready": {
          // Phase-1 checkpoint: drop a planned post on the calendar immediately so
          // the user sees fast feedback before the gated media realization runs.
          const entry = buildTextReadyEntry(d);
          if (entry) {
            addDraft(entry.dayId, entry.draft);
            upsertGeneration({
              jobId: entry.placementId,
              planItemId: entry.placementId,
              platform: entry.draft.platforms[0],
              status: "running",
              draftId: entry.placementId,
            });
            requestCalendarRefetch();
          }
          break;
        }

        case "slot_completed": {
          progressRef.current.completed += 1;
          const { completed, total } = progressRef.current;
          const placementId = d.placement_id as string | undefined;
          if (placementId) {
            updateDraft(placementId, (dr) => ({ ...dr, status: "draft" }));
            upsertGeneration({ jobId: placementId, status: "completed", draftId: placementId });
          }
          setGridProgress({
            percent: Math.round((completed / Math.max(total, 1)) * 100),
            completed,
            total,
          });
          requestCalendarRefetch();
          break;
        }

        case "slot_failed": {
          const placementId = d.placement_id as string | undefined;
          if (placementId) {
            updateDraft(placementId, (dr) => ({
              ...dr,
              status: "failed",
              generationError: (d.error as string | undefined) ?? "Generation failed",
            }));
            upsertGeneration({
              jobId: placementId,
              status: "failed",
              error: (d.error as string | undefined) ?? "Generation failed",
            });
          }
          break;
        }

        case "placement": {
          const placementId = d.placement_id as string | undefined;
          const dayId = d.day_id as string | undefined;
          if (!placementId) break;
          upsertGeneration({ jobId: placementId, status: "completed", draftId: placementId });
          const patch = buildPlacementPatch(d);
          if (dayId) {
            addDraft(dayId, {
              id: placementId,
              timeLabel: strOf(d.time) ?? "",
              dateLabel: dayId,
              platforms: [((d.platform as string | undefined) ?? "instagram") as OrganicCalendarDraft["platforms"][number]],
              tags: [],
              mediaCount: 1,
              objective: "Draft",
              ...patch,
            });
          } else {
            updateDraft(placementId, (dr) => ({ ...dr, ...patch }));
          }
          requestCalendarRefetch();
          break;
        }

        case "slot_asset_ready": {
          const placementId = (d.placement_id ?? d.placementId) as string | undefined;
          const imageUrl = (d.image_url ?? d.imageUrl) as string | undefined;
          const images = d.images as string[] | undefined;
          if (placementId) {
            upsertGeneration({ jobId: placementId, previewUrl: images?.[0] ?? imageUrl ?? undefined });
          }
          break;
        }

        case "error": {
          setGridStatus("error");
          setGridError((d.message as string | undefined) ?? "Generation failed");
          break;
        }
      }
    },
    [
      addDraft,
      setGridError,
      setGridProgress,
      setGridStatus,
      updateDraft,
      upsertGeneration,
      requestCalendarRefetch,
    ]
  );

  const { status: streamStatus } = useRunEventStream(activeRunId, handleEvent);

  useEffect(() => {
    if (streamStatus === "completed") {
      setGridStatus("complete");
      setGridJobId(null);
      // Terminal frame landed — reconcile the calendar against the persisted
      // drafts so the final populated content replaces the planned placeholders.
      requestCalendarRefetch();
    } else if (streamStatus === "failed" || streamStatus === "timed_out") {
      setGridStatus("error");
      setGridError("Generation run did not complete");
    }
  }, [streamStatus, setGridStatus, setGridJobId, setGridError, requestCalendarRefetch]);

  const attachRun = useCallback(
    (runId: string) => {
      progressRef.current = { completed: 0, total: 0 };
      setActiveRunId(runId);
      setGridJobId(runId);
      setGridStatus("running");
    },
    [setGridJobId, setGridStatus]
  );

  return { attachRun };
}

function strOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Derive a YYYY-MM-DD day id from an ISO timestamp. */
function dayIdFromIso(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const match = iso.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : undefined;
}

export type TextReadyEntry = {
  placementId: string;
  dayId: string;
  draft: OrganicCalendarDraft;
};

/**
 * Build a planned-draft calendar card from a `slot_text_ready` event payload.
 * Reads the nested contract placement shape (`{ placement: { placementId, schedule,
 * platform, content, copy, creative } }`) first, then falls back to the flat
 * snake_case fields the legacy realtime rows carry. Returns null when neither a
 * placement id nor a day can be resolved.
 */
export function buildTextReadyEntry(d: Record<string, unknown>): TextReadyEntry | null {
  const placement = isRecord(d.placement) ? d.placement : null;
  const schedule = placement && isRecord(placement.schedule) ? placement.schedule : null;
  const platformObj = placement && isRecord(placement.platform) ? placement.platform : null;
  const content = placement && isRecord(placement.content) ? placement.content : null;
  const copy = placement && isRecord(placement.copy) ? placement.copy : null;
  const creative = placement && isRecord(placement.creative) ? placement.creative : null;

  const placementId =
    strOf(placement?.placementId) ?? strOf(d.placement_id) ?? strOf(d.placementId);
  if (!placementId) return null;

  const dayId =
    strOf(schedule?.dayId) ??
    strOf(d.day_id) ??
    strOf(d.dayId) ??
    dayIdFromIso(strOf(schedule?.scheduledAt) ?? strOf(d.scheduled_at) ?? strOf(d.scheduledAt));
  if (!dayId) return null;

  const platform =
    strOf(platformObj?.name) ?? strOf(d.platform) ?? "instagram";
  const timeLabel = strOf(schedule?.timeOfDay) ?? strOf(d.time) ?? "";
  const caption = strOf(copy?.caption) ?? strOf(d.caption_preview ?? d.captionPreview) ?? "";
  const title = strOf(content?.titleTopic) ?? strOf(d.title) ?? "";
  const format = strOf(content?.format) ?? strOf(d.format) ?? "Post";
  const objective = strOf(content?.objective) ?? "Draft";
  const creativeIdea = strOf(creative?.creativeIdea) ?? strOf(d.creative_idea ?? d.creativeIdea);

  const draft: OrganicCalendarDraft = {
    id: placementId,
    title,
    summary: "",
    timeLabel,
    dateLabel: dayId,
    status: "draft",
    platforms: [platform as OrganicCalendarDraft["platforms"][number]],
    format,
    objective,
    captionPreview: caption,
    creativeIdea,
    tags: [],
    mediaCount: 1,
  };

  return { placementId, dayId, draft };
}

function buildPlaceholderDraft(
  placementId: string,
  dayId: string,
  platform: string,
  d: Record<string, unknown>
): OrganicCalendarDraft {
  return {
    id: placementId,
    title: "",
    summary: "",
    timeLabel: strOf(d.time) ?? "",
    dateLabel: dayId,
    status: "streaming",
    platforms: [platform as OrganicCalendarDraft["platforms"][number]],
    format: strOf(d.format) ?? "Post",
    objective: "Draft",
    captionPreview: "",
    tags: [],
    mediaCount: 1,
  };
}

function buildPlacementPatch(
  d: Record<string, unknown>
): Partial<OrganicCalendarDraft> & Pick<OrganicCalendarDraft, "status" | "title" | "summary" | "captionPreview" | "format"> {
  return {
    status: "draft",
    title: strOf(d.title) ?? "",
    summary: strOf(d.summary) ?? "",
    captionPreview: strOf(d.caption_preview ?? d.captionPreview) ?? "",
    creativeIdea: strOf(d.creative_idea ?? d.creativeIdea),
    creativeDirectionPrompt: strOf(d.creative_direction_prompt ?? d.creativeDirectionPrompt),
    thumbnailPrompt: strOf(d.thumbnail_prompt ?? d.thumbnailPrompt),
    format: strOf(d.format) ?? "Post",
  };
}
