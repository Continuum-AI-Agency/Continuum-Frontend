"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { BulkContentPlan } from "./types";

const PLATFORM_STYLES: Record<string, string> = {
  instagram: "bg-violet-500/15 text-violet-500",
  tiktok: "bg-pink-500/15 text-pink-500",
  linkedin: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  facebook: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  youtube: "bg-red-500/15 text-red-500",
};

const FORMAT_STYLES = "bg-muted/60 text-muted-foreground";

function Chip({ label, style }: { label: string; style: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        style,
      )}
    >
      {label}
    </span>
  );
}

function MixBar({ plan }: { plan: BulkContentPlan }) {
  const mix = plan.strategyBrief.mix;
  const total = mix.reduce((sum, m) => sum + m.weight, 0) || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
      {mix.map((m) => (
        <div
          key={m.format}
          className={cn("h-full", FORMAT_STYLES)}
          style={{ width: `${(m.weight / total) * 100}%` }}
          title={`${m.format} ${Math.round((m.weight / total) * 100)}%`}
        />
      ))}
    </div>
  );
}

type Props = {
  plan: BulkContentPlan;
  onApproveAction: () => void;
  onRejectAction: () => void;
};

export function BulkPlanCard({ plan, onApproveAction, onRejectAction }: Props) {
  const [decided, setDecided] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { strategyBrief, schedule, placements } = plan;

  function decide(action: () => void) {
    if (decided) return;
    setDecided(true);
    action();
  }

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Bulk Content Plan
        </p>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-violet-500/15 text-violet-500">
          {placements.length} pieces · {schedule.horizonWeeks} wks
        </span>
      </div>

      <p className="mb-1 text-[13px] font-semibold leading-snug text-foreground">{plan.title}</p>
      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">{strategyBrief.summary}</p>

      <div className="mb-3 space-y-2 border-t border-border/40 pt-3">
        <div className="flex flex-wrap gap-1.5">
          {strategyBrief.pillars.map((p) => (
            <Chip key={p.name} label={p.name} style="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />
          ))}
        </div>
        <MixBar plan={plan} />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>~{schedule.postsPerDayPerPlatform}/day/platform</span>
          {strategyBrief.platformSplit.map((s) => (
            <Chip
              key={s.platform}
              label={s.platform}
              style={PLATFORM_STYLES[s.platform] ?? "bg-muted/60 text-muted-foreground"}
            />
          ))}
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 text-[11px] font-medium text-foreground/70 hover:text-foreground"
      >
        {expanded ? "Hide" : "Show"} {placements.length} scheduled pieces
      </button>

      {expanded && (
        <div className="mb-3 max-h-64 space-y-1.5 overflow-y-auto border-t border-border/40 pt-2">
          {placements.map((spec) => (
            <div key={spec.specId} className="flex items-center gap-2">
              <Chip label={spec.format} style={FORMAT_STYLES} />
              <Chip
                label={spec.platform}
                style={PLATFORM_STYLES[spec.platform] ?? "bg-muted/60 text-muted-foreground"}
              />
              <span className="text-[10px] text-muted-foreground">{spec.dayId ?? "unscheduled"}</span>
              <span className="min-w-0 truncate text-[11px] text-foreground/80">{spec.angle}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2 border-t border-border/40 pt-3">
        <button
          onClick={() => decide(onRejectAction)}
          disabled={decided}
          className={cn(
            "rounded-md border border-border px-3 py-1.5 text-[12px] font-medium transition-opacity",
            decided ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/40",
          )}
        >
          Reject
        </button>
        <button
          onClick={() => decide(onApproveAction)}
          disabled={decided}
          className={cn(
            "rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity",
            decided ? "opacity-40 cursor-not-allowed" : "hover:opacity-90",
          )}
        >
          Approve &amp; Generate &rarr;
        </button>
      </div>
    </div>
  );
}
