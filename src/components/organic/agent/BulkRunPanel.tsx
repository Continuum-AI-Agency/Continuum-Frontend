"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCalendarStore } from "@/lib/organic/store";
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
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {entries.map(([key, n]) => (
        <span key={key} className="rounded bg-muted/60 px-1 py-0.5 text-[10px] text-foreground/80">
          {key} {n}
        </span>
      ))}
    </div>
  );
}

export function BulkRunPanel({ runId, total }: { runId: string; total: number }) {
  const run = useBulkRunProgress(runId, total);
  const done = run.completed + run.failed;
  const pct = run.total > 0 ? Math.round((done / run.total) * 100) : 0;

  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch);
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (reconciledRef.current) return;
    if (run.status === "completed" || run.status === "failed") {
      reconciledRef.current = true;
      requestCalendarRefetch();
    }
  }, [run.status, requestCalendarRefetch]);

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Bulk Generation Run
        </p>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            run.status === "completed"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : run.status === "failed"
                ? "bg-red-500/15 text-red-500"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
        >
          {run.status}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {done}/{run.total}
          {run.failed > 0 ? ` · ${run.failed} failed` : ""}
        </span>
      </div>

      <div className="space-y-1.5">
        <CountRow label="By platform" counts={run.byPlatform} />
        <CountRow label="By format" counts={run.byFormat} />
      </div>
    </div>
  );
}
