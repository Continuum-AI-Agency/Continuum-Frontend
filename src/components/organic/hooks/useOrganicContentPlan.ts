"use client";

import * as React from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useCalendarStore } from "@/lib/organic/store";
import type {
  OrganicContentPlan,
  OrganicContentPlanPlacement,
} from "@/lib/organic/chat.types";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

type UseOrganicContentPlanOptions = {
  brandId: string;
  weekStart: string;
  brandProfileId?: string;
  activePlatforms?: OrganicPlatformKey[];
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>;
};

type UseOrganicContentPlanResult = {
  activePlan: OrganicContentPlan | null;
  isApproving: boolean;
  approvePlan: (planId: string) => Promise<void>;
  cancelPlan: () => void;
};

function placementToDraft(
  placement: OrganicContentPlanPlacement,
  planId: string,
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>
): OrganicCalendarDraft {
  const platform = placement.platform as OrganicPlatformKey;
  const targetAccountId = placement.account_id ?? platformAccountIds[platform];

  const draftId = `plan-${planId}-${placement.day}-${placement.platform}-${Date.now()}`;

  return {
    id: draftId,
    title: placement.concept ?? "Content idea",
    summary: "",
    timeLabel: placement.time,
    dateLabel: placement.day,
    status: "placeholder",
    platforms: [platform],
    format: placement.post_type ?? "Post",
    objective: "Draft",
    creativeIdea: placement.concept ?? "",
    captionPreview: "",
    tags: [],
    mediaCount: 1,
    seedTrendId: placement.trend_id,
    targetAccountId,
  };
}

export function useOrganicContentPlan({
  brandId,
  weekStart,
  brandProfileId,
  platformAccountIds = {},
}: UseOrganicContentPlanOptions): UseOrganicContentPlanResult {
  const [activePlan, setActivePlan] = React.useState<OrganicContentPlan | null>(null);
  const [isApproving, setIsApproving] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const {
    setGridStatus,
    setGridProgress,
    setGridError,
    setGridJobId,
    addDraft,
    updateDraft,
    days,
  } = useCalendarStore(
    React.useCallback(
      (s) => ({
        setGridStatus: s.setGridStatus,
        setGridProgress: s.setGridProgress,
        setGridError: s.setGridError,
        setGridJobId: s.setGridJobId,
        addDraft: s.addDraft,
        updateDraft: s.updateDraft,
        days: s.days,
      }),
      []
    )
  );

  // Subscribe to proposed/active plans for this brand+week
  React.useEffect(() => {
    if (!brandId || !weekStart) return;

    const supabase = createSupabaseBrowserClient();

    const load = async () => {
      const { data } = await supabase
        .schema("organic" as never)
        .from("organic_content_plans")
        .select("*")
        .eq("brand_id", brandId)
        .eq("week_start", weekStart)
        .in("status", ["proposed", "approved", "generating"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) setActivePlan(data as OrganicContentPlan);
    };

    void load();

    // Realtime subscription for plan status changes
    const channel = supabase
      .channel(`organic-content-plans-${brandId}-${weekStart}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "organic",
          table: "organic_content_plans",
          filter: `brand_id=eq.${brandId}`,
        },
        (payload) => {
          const plan = payload.new as OrganicContentPlan;
          if (plan.week_start !== weekStart) return;

          setActivePlan((current) => {
            // Only track proposed/generating; clear on terminal states
            if (
              plan.status === "proposed" ||
              plan.status === "approved" ||
              plan.status === "generating"
            ) {
              return plan;
            }
            if (plan.status === "completed") {
              setGridStatus("complete");
              setGridJobId(null);
              return null;
            }
            if (plan.status === "failed") {
              setGridStatus("error");
              setGridError("Content plan generation failed.");
              setGridJobId(null);
              return null;
            }
            if (plan.status === "cancelled") {
              setGridStatus("idle");
              setGridJobId(null);
              return current?.id === plan.id ? null : current;
            }
            return current;
          });

          if (plan.status === "generating") {
            setGridStatus("running");
            setGridJobId(plan.id);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandId, weekStart, setGridStatus, setGridProgress, setGridError, setGridJobId]);

  const approvePlan = React.useCallback(
    async (planId: string) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setIsApproving(true);
      setGridStatus("running");
      setGridProgress({ percent: 0, stage: "starting", message: "Preparing content plan…" });

      try {
        // Seed placeholder drafts from the plan's placements so the calendar
        // has slots to fill in as streaming events arrive
        const plan = activePlan;
        if (plan) {
          const dayIds = new Set(days.map((d) => d.id));
          for (const placement of plan.placements) {
            if (!dayIds.has(placement.day)) continue;
            const draft = placementToDraft(
              placement,
              planId,
              platformAccountIds as Partial<Record<OrganicPlatformKey, string>>
            );
            addDraft(placement.day, draft);
          }
        }

        // Start the run — backend uses plan_id to look up placements
        const response = await fetch("/api/organic/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_id: planId,
            input: {
              brandProfileId,
              week_start: weekStart,
            },
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Run start failed: ${response.status}`);
        }

        setGridJobId(planId);

        // Consume NDJSON stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let buffer = "";
        let completed = 0;
        const total = plan?.placements.length ?? 0;

        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          if (chunk.value) {
            buffer += decoder.decode(chunk.value, { stream: !done });
          }

          const lines = buffer.split("\n");
          buffer = done ? "" : (lines.pop() ?? "");

          for (const line of lines) {
            if (!line.trim()) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }

            const type = event.type as string | undefined;

            if (type === "progress") {
              const percent = typeof event.percent === "number" ? event.percent : undefined;
              const stage = typeof event.stage === "string" ? event.stage : undefined;
              const message = typeof event.message === "string" ? event.message : undefined;
              setGridProgress({
                percent: percent ?? 0,
                stage,
                message,
                completed,
                total,
              });
            }

            if (type === "slot_started") {
              const placementId = event.placement_id as string | undefined;
              if (placementId) {
                updateDraft(placementId, (d) => ({ ...d, status: "streaming" as const }));
              }
            }

            if (type === "slot_completed") {
              completed += 1;
              setGridProgress({ percent: Math.round((completed / Math.max(total, 1)) * 100), completed, total });
            }

            if (type === "slot_failed") {
              const placementId = event.placement_id as string | undefined;
              if (placementId) {
                updateDraft(placementId, (d) => ({
                  ...d,
                  status: "failed" as const,
                  generationError: (event.error as string | undefined) ?? "Generation failed",
                }));
              }
            }

            if (type === "placement") {
              const data = event.data as Record<string, unknown> | undefined;
              if (!data) continue;

              const placementId = (event.placement_id ?? data.placement_id) as string | undefined;
              const dayId = (event.day_id ?? data.day_id) as string | undefined;

              if (!dayId) continue;

              const patch: Partial<OrganicCalendarDraft> = {
                status: "draft",
                title: (data.title as string | undefined) ?? undefined,
                summary: (data.summary as string | undefined) ?? undefined,
                captionPreview: (data.caption_preview ?? data.captionPreview) as string | undefined,
                creativeIdea: (data.creative_idea ?? data.creativeIdea) as string | undefined,
                creativeDirectionPrompt: (data.creative_direction_prompt ?? data.creativeDirectionPrompt) as string | undefined,
                thumbnailPrompt: (data.thumbnail_prompt ?? data.thumbnailPrompt) as string | undefined,
                format: (data.format as string | undefined) ?? undefined,
              };

              if (placementId) {
                updateDraft(placementId, (d) => ({ ...d, ...patch }));
              }
            }

            if (type === "error") {
              setGridStatus("error");
              setGridError((event.message as string | undefined) ?? "Generation failed");
              break;
            }
          }
        }

        setGridStatus("complete");
        setGridJobId(null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setGridStatus("error");
        setGridError(
          error instanceof Error ? error.message : "Failed to run content plan"
        );
      } finally {
        setIsApproving(false);
      }
    },
    [
      activePlan,
      addDraft,
      brandProfileId,
      days,
      platformAccountIds,
      setGridError,
      setGridJobId,
      setGridProgress,
      setGridStatus,
      updateDraft,
      weekStart,
    ]
  );

  const cancelPlan = React.useCallback(() => {
    abortRef.current?.abort();
    setIsApproving(false);
    setGridStatus("idle");
    setGridJobId(null);
    setActivePlan(null);
  }, [setGridStatus, setGridJobId]);

  return { activePlan, isApproving, approvePlan, cancelPlan };
}
