"use client";

import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { PlanEvidence, PlanItem, UiPlanCard } from "./types";

const PLATFORM_STYLES: Record<string, string> = {
  instagram: "bg-violet-500/15 text-violet-500",
  tiktok: "bg-pink-500/15 text-pink-500",
  linkedin: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  facebook: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  youtube: "bg-red-500/15 text-red-500",
};

const FORMAT_STYLES = "bg-muted/60 text-muted-foreground";

const OBJECTIVE_STYLES: Record<string, string> = {
  share: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  save: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  dm: "bg-violet-500/15 text-violet-500",
  click: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  comment: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  follow: "bg-pink-500/15 text-pink-500",
};

const EVIDENCE_KIND_STYLES: Record<string, string> = {
  trend: "bg-violet-500/15 text-violet-500",
  metric: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  competitor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  past_draft: "bg-muted/60 text-muted-foreground",
  brand_doc: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

function Chip({ label, style }: { label: string; style: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        style
      )}
    >
      {label}
    </span>
  );
}

function formatScheduledAt(iso: string): string {
  try {
    return format(new Date(iso), "EEE MMM d · h:mm a");
  } catch {
    return iso;
  }
}

function PlanItemRow({ item }: { item: PlanItem }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {item.format && <Chip label={item.format} style={FORMAT_STYLES} />}
        <Chip
          label={item.platform}
          style={PLATFORM_STYLES[item.platform] ?? "bg-muted/60 text-muted-foreground"}
        />
        <span className="text-[11px] text-muted-foreground">
          {formatScheduledAt(item.scheduledAt)}
        </span>
        <Chip
          label={item.objective}
          style={OBJECTIVE_STYLES[item.objective] ?? "bg-muted/60 text-muted-foreground"}
        />
      </div>
      {item.trendTitle && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/70">Trend:</span> {item.trendTitle}
        </p>
      )}
      {item.angle && (
        <p className="min-w-0 text-[12px] leading-snug text-foreground">{item.angle}</p>
      )}
    </div>
  );
}

function EvidenceRow({ evidence }: { evidence: PlanEvidence }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Chip
        label={evidence.kind}
        style={EVIDENCE_KIND_STYLES[evidence.kind] ?? "bg-muted/60 text-muted-foreground"}
      />
      <span className="min-w-0 text-[11px] leading-snug text-foreground/70">{evidence.summary}</span>
    </div>
  );
}

type Props = {
  plan: UiPlanCard;
  onApprove: () => void;
  onReject: () => void;
};

export function PlanCard({ plan, onApprove, onReject }: Props) {
  const [decided, setDecided] = useState(false);

  const title = typeof plan?.title === "string" ? plan.title : "";
  const summary = typeof plan?.summary === "string" ? plan.summary : "";
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const evidence = Array.isArray(plan?.evidence) ? plan.evidence : [];

  function handleApprove() {
    if (decided) return;
    setDecided(true);
    onApprove();
  }

  function handleReject() {
    if (decided) return;
    setDecided(true);
    onReject();
  }

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Weekly Campaign Plan
        </p>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-violet-500/15 text-violet-500">
          {plan.status}
        </span>
      </div>

      {title && (
        <p className="mb-1 text-[13px] font-semibold leading-snug text-foreground">{title}</p>
      )}
      {summary && (
        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">{summary}</p>
      )}

      {items.length > 0 && (
        <div className="space-y-3 border-t border-border/40 pt-3">
          {items.map((item, i) => (
            <div key={item.itemId ?? i}>
              {i > 0 && <div className="mb-3 border-t border-border/30" />}
              <PlanItemRow item={item} />
            </div>
          ))}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Evidence
          </p>
          {evidence.map((ev, i) => (
            <EvidenceRow key={ev.refId ?? i} evidence={ev} />
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2 border-t border-border/40 pt-3">
        <button
          onClick={handleReject}
          disabled={decided}
          className={cn(
            "rounded-md border border-border px-3 py-1.5 text-[12px] font-medium transition-opacity",
            decided ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/40"
          )}
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          disabled={decided}
          className={cn(
            "rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity",
            decided ? "opacity-40 cursor-not-allowed" : "hover:opacity-90"
          )}
        >
          Approve Plan →
        </button>
      </div>
    </div>
  );
}
