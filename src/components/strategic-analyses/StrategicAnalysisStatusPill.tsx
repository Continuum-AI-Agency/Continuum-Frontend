"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { registerStrategicRunsCatchUp } from "./realtimeBus";

type Props = {
  brandId: string;
};

const ACTIVE_STATUSES = ["queued", "running", "in_progress", "pending"] as const;

type ActiveRunRow = { id: string; status: string | null; started_at: string | null };

async function fetchActiveRun(brandId: string): Promise<ActiveRunRow | null> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase
    .schema("brand_trends" as never)
    .from("strategic_analysis_runs")
    .select("id, status, started_at")
    .eq("brand_id", brandId)
    .in("status", ACTIVE_STATUSES as unknown as string[])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActiveRunRow | null) ?? null;
}

export function StrategicAnalysisStatusPill({ brandId }: Props) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["strategic-analysis-active", brandId] as const, [brandId]);
  const { data: activeRun } = useQuery({
    queryKey,
    queryFn: () => fetchActiveRun(brandId),
    refetchInterval: (q) => (q.state.data ? 5_000 : 30_000),
    staleTime: 0,
  });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
  }, [activeRun?.id]);

  useEffect(() => {
    return registerStrategicRunsCatchUp(brandId, async () => {
      await queryClient.invalidateQueries({ queryKey });
    });
  }, [brandId, queryClient, queryKey]);

  const visible = Boolean(activeRun) && !hidden;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto fixed right-4 top-4 z-40 flex items-center gap-2 rounded-full border border-violet-500/30 bg-white/95 px-3 py-1.5 text-sm font-medium text-violet-700 shadow-md backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          <Sparkles className="h-3 w-3" aria-hidden />
          <span>Refining your Brand DNA…</span>
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="ml-1 text-2xs font-semibold uppercase tracking-wide text-violet-500 hover:text-violet-700"
            aria-label="Dismiss"
          >
            Hide
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
