"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCalendarStore } from "@/lib/organic/store";
import { useGenerationSummaries } from "@/lib/organic/generationSummaries";
import type { BulkRunState, BulkRunStatus } from "./types";
import { useRunEventStream, type ParsedRunEvent } from "@/hooks/useRunEventStream";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function foldEvent(prev: BulkRunState, event: ParsedRunEvent): BulkRunState {
  // bulkExecution.ts stores the V2 envelope as payload, so event.data is the
  // full envelope and the actual run-event data lives at event.data.event.
  const inner = isRecord(event.data.event) ? event.data.event : event.data;

  switch (event.type) {
    case "run_started":
      return { ...prev, total: typeof inner.totalPlacements === "number" ? inner.totalPlacements : prev.total };
    case "slot_completed": {
      const pl = isRecord(inner.placement) ? inner.placement : {};
      const platform = isRecord(pl.platform) ? String(pl.platform.name ?? "unknown") : "unknown";
      const format = isRecord(pl.content) ? String(pl.content.format ?? "unknown") : "unknown";
      return {
        ...prev,
        completed: prev.completed + 1,
        byPlatform: { ...prev.byPlatform, [platform]: (prev.byPlatform[platform] ?? 0) + 1 },
        byFormat: { ...prev.byFormat, [format]: (prev.byFormat[format] ?? 0) + 1 },
      };
    }
    case "slot_failed":
      return { ...prev, failed: prev.failed + 1 };
    case "run_completed":
      return { ...prev, status: "completed" as BulkRunStatus };
    case "run_failed":
      return { ...prev, status: "failed" as BulkRunStatus };
    default:
      return prev;
  }
}

function useBulkRunProgress(runId: string, total: number): BulkRunState {
  const [state, setState] = useState<BulkRunState>({
    runId,
    planId: runId.replace(/^run_/, ""),
    brandId: "",
    total,
    completed: 0,
    failed: 0,
    byPlatform: {},
    byFormat: {},
    status: "running",
  });

  const handleEvent = useCallback((event: ParsedRunEvent) => {
    setState((prev) => foldEvent(prev, event));
  }, []);

  useRunEventStream(runId, handleEvent);

  return state;
}

function CountRow({ label, counts }: { label: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {entries.map(([key, n]) => (
        <span key={key} className="rounded bg-muted/60 px-1 py-0.5 text-2xs text-foreground/80">
          {key} {n}
        </span>
      ))}
    </div>
  );
}

export function BulkRunPanel({
  runId,
  total,
  brandId,
}: {
  runId: string;
  total: number;
  brandId?: string | null;
}) {
  // The run-event stream still drives the by-platform / by-format breakdowns (the
  // summaries carry platform but not format), but the completion TALLY is derived
  // from the real post_generation_jobs rows for this plan.
  const run = useBulkRunProgress(runId, total);
  const { summaries } = useGenerationSummaries(brandId);

  const planId = run.planId;
  const planSummaries = useMemo(
    () => summaries.filter((s) => s.planId === planId),
    [summaries, planId],
  );
  const completed = planSummaries.filter((s) => s.status === "completed").length;
  const failed = planSummaries.filter((s) => s.status === "failed").length;
  const activeCount = planSummaries.filter(
    (s) => s.status === "running" || s.status === "queued",
  ).length;
  // Total = the real number of jobs created (so a partial dispatch or a deduped
  // re-click reports honestly), not run_started.totalPlacements. Before any job
  // row exists, fall back to the intended count so the bar isn't a transient 0/0.
  const summaryTotal = planSummaries.length;
  const displayTotal = summaryTotal > 0 ? summaryTotal : run.total;
  const done = completed + failed;
  const pct = displayTotal > 0 ? Math.round((done / displayTotal) * 100) : 0;

  // Terminal status from the jobs when they exist; otherwise trust the stream.
  const status: BulkRunStatus =
    summaryTotal > 0 && activeCount === 0
      ? failed > 0 && completed === 0
        ? "failed"
        : "completed"
      : run.status;

  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch);
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (reconciledRef.current) return;
    if (status === "completed" || status === "failed") {
      reconciledRef.current = true;
      requestCalendarRefetch();
    }
  }, [status, requestCalendarRefetch]);

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          Bulk Generation Run
        </p>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide",
            status === "completed"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : status === "failed"
                ? "bg-red-500/15 text-red-500"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
        >
          {status}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done}/{displayTotal}
          {failed > 0 ? ` · ${failed} failed` : ""}
        </span>
      </div>

      <div className="space-y-1.5">
        <CountRow label="By platform" counts={run.byPlatform} />
        <CountRow label="By format" counts={run.byFormat} />
      </div>
    </div>
  );
}
