"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";
import { useRunEventStream, type ParsedRunEvent } from "@/hooks/useRunEventStream";

export function useCalendarRunStream() {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const progressRef = useRef({ completed: 0, total: 0 });

  const { setGridStatus, setGridProgress, setGridError, setGridJobId, addDraft, updateDraft, upsertGeneration } =
    useCalendarStore(
      useShallow((s) => ({
        setGridStatus: s.setGridStatus,
        setGridProgress: s.setGridProgress,
        setGridError: s.setGridError,
        setGridJobId: s.setGridJobId,
        addDraft: s.addDraft,
        updateDraft: s.updateDraft,
        upsertGeneration: s.upsertGeneration,
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
    [addDraft, setGridError, setGridProgress, setGridStatus, updateDraft, upsertGeneration]
  );

  const { status: streamStatus } = useRunEventStream(activeRunId, handleEvent);

  useEffect(() => {
    if (streamStatus === "completed") {
      setGridStatus("complete");
      setGridJobId(null);
    } else if (streamStatus === "failed" || streamStatus === "timed_out") {
      setGridStatus("error");
      setGridError("Generation run did not complete");
    }
  }, [streamStatus, setGridStatus, setGridJobId, setGridError]);

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
