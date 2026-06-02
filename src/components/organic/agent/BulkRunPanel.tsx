"use client";

import { useEffect, useRef, useState } from "react";
import { readNdjsonStream } from "@/lib/streaming/readNdjsonStream";
import { cn } from "@/lib/utils";
import type { BulkRunState, BulkRunStatus } from "./types";

const POLL_INTERVAL_MS = 2500;

type RunEvent = {
  type?: string;
  totalPlacements?: number;
  placement?: { platform?: { name?: string }; content?: { format?: string } };
};

function readRunEvent(line: string): RunEvent | null {
  try {
    const frame = JSON.parse(line) as { data?: unknown };
    const data = frame.data as { event?: RunEvent } | RunEvent | undefined;
    if (data && typeof data === "object" && "event" in data && data.event) return data.event as RunEvent;
    return (data as RunEvent) ?? null;
  } catch {
    return null;
  }
}

/**
 * Polls the durable run-events replay endpoint and folds the v2 envelopes into
 * an aggregate. The runId is deterministic (`run_<planId>`); a 404 simply means
 * the background run row is not written yet, so we keep polling.
 */
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
  const lastSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/organic/agent/runs/${runId}/events?after_seq=${lastSeqRef.current}`, {
          headers: { Accept: "application/x-ndjson" },
        });
        if (res.ok && res.body) {
          const reader = res.body.getReader();
          await readNdjsonStream({
            reader,
            onLine: (line) => {
              const seq = (() => {
                try {
                  return (JSON.parse(line) as { seq?: number }).seq ?? 0;
                } catch {
                  return 0;
                }
              })();
              if (seq > lastSeqRef.current) lastSeqRef.current = seq;
              const event = readRunEvent(line);
              if (!event?.type) return;
              setState((prev) => foldEvent(prev, event));
            },
          });
        }
      } catch {
        // Transient network/404 — keep polling.
      }
      if (!cancelled) {
        setState((prev) => {
          if (prev.status !== "running") return prev;
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return prev;
        });
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  return state;
}

function foldEvent(prev: BulkRunState, event: RunEvent): BulkRunState {
  switch (event.type) {
    case "run_started":
      return { ...prev, total: event.totalPlacements ?? prev.total };
    case "slot_completed": {
      const platform = event.placement?.platform?.name ?? "unknown";
      const format = event.placement?.content?.format ?? "unknown";
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
