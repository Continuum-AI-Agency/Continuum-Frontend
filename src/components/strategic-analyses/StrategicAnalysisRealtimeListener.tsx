"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/ToastProvider";
import { usePersistentState } from "@/lib/usePersistentState";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { registerStrategicRunsCatchUp } from "./realtimeBus";

type Props = {
  brandId: string;
};

export function StrategicAnalysisRealtimeListener({ brandId }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const queryClient = useQueryClient();
  const { show } = useToast();

  const [lastCompletedAt, setLastCompletedAt] = usePersistentState<string | null>(
    `strategic-analysis:last-completed:${brandId}`,
    null
  );

  const lastCompletedAtRef = useRef<string | null>(lastCompletedAt);
  const seenRunIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    lastCompletedAtRef.current = lastCompletedAt;
  }, [lastCompletedAt]);

  useEffect(() => {
    seenRunIdsRef.current = new Set();
    lastCompletedAtRef.current = lastCompletedAt;
  }, [brandId, lastCompletedAt]);

  useEffect(() => {
    let isActive = true;

    const handleCompletion = (runId: string, completedAt?: string | null) => {
      if (!isActive) return;

      seenRunIdsRef.current.add(runId);

      if (completedAt) {
        setLastCompletedAt(completedAt);
        lastCompletedAtRef.current = completedAt;
      }

      show({
        title: "Strategic analysis ready",
        description: "Your latest run finished processing.",
        variant: "success",
      });

      queryClient.invalidateQueries({ queryKey: ["strategic-analysis", brandId] });
      queryClient.invalidateQueries({ queryKey: ["strategic-analysis-runs", brandId] });
    };

    const catchUpMissed = async () => {
      const since = lastCompletedAtRef.current ?? "1970-01-01T00:00:00Z";
      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("strategic_analysis_runs")
        .select("id, completed_at")
        .eq("brand_id", brandId)
        .eq("status", "completed")
        .gt("completed_at", since)
        .order("completed_at", { ascending: true });

      if (error || !data) return;

      for (const row of data) {
        const runId = row.id;
        if (!runId || seenRunIdsRef.current.has(runId)) continue;
        handleCompletion(runId, row.completed_at);
      }
    };

    const unregister = registerStrategicRunsCatchUp(brandId, catchUpMissed);

    const channel = supabase
      .channel(`strategic_runs_${brandId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "brand_profiles",
          table: "strategic_analysis_runs",
          filter: `brand_id=eq.${brandId}`,
        },
        payload => {
          const previous = payload.old?.status;
          const next = payload.new?.status;
          const runId = payload.new?.id;
          if (!runId) return;
          if (previous === "completed" || next !== "completed") return;
          if (seenRunIdsRef.current.has(runId)) return;

          const completedAt = payload.new?.completed_at ?? null;
          handleCompletion(runId, completedAt);
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          void catchUpMissed();
        }
      });

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
      unregister();
    };
  }, [brandId, queryClient, setLastCompletedAt, show, supabase]);

  return null;
}
