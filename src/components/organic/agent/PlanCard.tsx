"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  AgentCard,
  AgentCardEyebrow,
  AgentCardSummary,
  AgentCardTitle,
  ApproveRejectActions,
  MetaRow,
  PlatformTag,
  StatusLabel,
} from "./agentCardKit";
import type { PlanEvidence, PlanItem, PlanItemStatus, UiPlanCard } from "./types";

const STATUS_TONE: Record<PlanItemStatus, "neutral" | "running" | "done" | "failed"> = {
  pending: "neutral",
  executing: "running",
  completed: "done",
  failed: "failed",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<PlanItemStatus, string> = {
  pending: "Pending",
  executing: "Generating",
  completed: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

function formatScheduledAt(iso: string): string {
  try {
    return format(new Date(iso), "EEE MMM d · h:mm a");
  } catch {
    return iso;
  }
}

function PlanItemRow({ item, status }: { item: PlanItem; status: PlanItemStatus }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PlatformTag platform={item.platform} />
          <MetaRow items={[item.format ?? undefined, formatScheduledAt(item.scheduledAt), item.objective]} />
        </div>
        {status !== "pending" && <StatusLabel tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusLabel>}
      </div>
      {item.angle && <p className="text-[13px] leading-snug text-foreground/90 text-pretty">{item.angle}</p>}
      {item.trendTitle && (
        <p className="text-[11.5px] text-muted-foreground">Trend · {item.trendTitle}</p>
      )}
    </div>
  );
}

function EvidenceRow({ evidence }: { evidence: PlanEvidence }) {
  return (
    <p className="text-[11.5px] leading-snug text-muted-foreground">
      <span className="font-medium capitalize text-foreground/70">{evidence.kind.replace("_", " ")}</span>
      <span className="px-1.5 text-muted-foreground/40">·</span>
      {evidence.summary}
    </p>
  );
}

type Props = {
  plan: UiPlanCard;
  planItemStatus?: Record<string, PlanItemStatus>;
  onApproveAction: () => void;
  onRejectAction: () => void;
};

export function PlanCard({ plan, planItemStatus, onApproveAction, onRejectAction }: Props) {
  const [decided, setDecided] = useState(false);

  const title = typeof plan?.title === "string" ? plan.title : "";
  const summary = typeof plan?.summary === "string" ? plan.summary : "";
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const evidence = Array.isArray(plan?.evidence) ? plan.evidence : [];

  const resolveStatus = (item: PlanItem): PlanItemStatus =>
    planItemStatus?.[item.itemId] ?? item.status ?? "pending";
  // Once any item has started, the plan has been acted on — lock the buttons.
  const alreadyActioned = items.some((item) => resolveStatus(item) !== "pending");
  const locked = decided || alreadyActioned;

  function handleApprove() {
    if (locked) return;
    setDecided(true);
    onApproveAction();
  }

  function handleReject() {
    if (locked) return;
    setDecided(true);
    onRejectAction();
  }

  return (
    <AgentCard>
      <AgentCardEyebrow label="Weekly plan" />
      {title && <AgentCardTitle>{title}</AgentCardTitle>}
      {summary && <AgentCardSummary>{summary}</AgentCardSummary>}

      {items.length > 0 && (
        <div className="mt-3.5 space-y-3.5">
          {items.map((item, i) => (
            <PlanItemRow key={item.itemId ?? i} item={item} status={resolveStatus(item)} />
          ))}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="mt-3.5 space-y-1.5">
          {evidence.map((ev, i) => (
            <EvidenceRow key={ev.refId ?? i} evidence={ev} />
          ))}
        </div>
      )}

      <ApproveRejectActions
        locked={locked}
        approveLabel="Approve plan"
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </AgentCard>
  );
}
