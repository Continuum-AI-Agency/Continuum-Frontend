"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AgentButton } from "./agentCardKit";
import { ConceptCard } from "./ConceptCard";
import type { PipelineCardState, PlanItem, PlanItemStatus, UiPlanCard } from "./types";

type Props = {
  plan: UiPlanCard;
  planItemStatus?: Record<string, PlanItemStatus>;
  pipeline: PipelineCardState[];
  onGenerateItemAction: (itemId: string) => void;
  onGenerateAllAction: () => void;
  onRejectAction: () => void;
  onViewDraftAction: (draftId: string, target: "calendar" | "list") => void;
};

/**
 * Renders a proposed plan as a compact, auto-filling grid of square concept
 * cards. Cards stay bounded (they don't stretch to fill the panel) so a plan
 * reads as "more volume available" rather than a few oversized tiles.
 * Per-card dismiss collapses individual cards; the footer controls apply
 * to the whole plan.
 */
export function ConceptPlan({
  plan,
  planItemStatus,
  pipeline,
  onGenerateItemAction,
  onGenerateAllAction,
  onRejectAction,
  onViewDraftAction,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const items = Array.isArray(plan?.items) ? plan.items : [];
  const summary = typeof plan?.summary === "string" ? plan.summary : "";

  const resolveStatus = (item: PlanItem): PlanItemStatus =>
    planItemStatus?.[item.itemId] ?? item.status ?? "pending";
  const pipelineFor = (itemId: string): PipelineCardState | undefined =>
    pipeline.find((p) => p.planItemId === itemId);

  const visibleItems = items.filter((item) => !dismissedIds.has(item.itemId));
  const pendingVisibleItems = visibleItems.filter((item) => resolveStatus(item) === "pending");
  const anyActioned = items.some((item) => resolveStatus(item) !== "pending");
  const allActioned = items.length > 0 && items.every((item) => resolveStatus(item) !== "pending");
  const footerLocked = dismissed || generatingAll || pendingVisibleItems.length === 0 || allActioned;

  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

  function handleGenerateAll() {
    if (footerLocked) return;
    setGeneratingAll(true);
    if (dismissedIds.size === 0 && !anyActioned) {
      onGenerateAllAction();
      return;
    }
    pendingVisibleItems.forEach((item) => onGenerateItemAction(item.itemId));
  }

  function handleDismissAll() {
    if (anyActioned || generatingAll) return;
    setDismissed(true);
    onRejectAction();
  }

  return (
    <div className="mt-2 space-y-2.5">
      <div className="mb-2 border-b border-border/40 pb-2 px-0.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Weekly plan · {items.length} {items.length === 1 ? "concept" : "concepts"}
        </p>
        {summary && (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">{summary}</p>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,170px))] gap-2">
        <AnimatePresence initial={false}>
          {visibleItems.map((item, i) => (
            <motion.div
              key={item.itemId ?? i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={{ delay: i * 0.06, duration: 0.2, ease }}
            >
              <ConceptCard
                concept={item}
                status={resolveStatus(item)}
                pipeline={pipelineFor(item.itemId)}
                locked={dismissed}
                onGenerate={() => onGenerateItemAction(item.itemId)}
                onDismiss={() => setDismissedIds((prev) => new Set([...prev, item.itemId]))}
                onViewDraft={onViewDraftAction}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {!dismissed && visibleItems.length > 1 && (
        <div className="flex items-center justify-end gap-1 px-0.5">
          <AgentButton variant="ghost" disabled={anyActioned || generatingAll} onClick={handleDismissAll}>
            Dismiss all
          </AgentButton>
          <AgentButton variant="primary" loading={generatingAll} disabled={footerLocked} onClick={handleGenerateAll}>
            Create copy for {pendingVisibleItems.length}
          </AgentButton>
        </div>
      )}
    </div>
  );
}
