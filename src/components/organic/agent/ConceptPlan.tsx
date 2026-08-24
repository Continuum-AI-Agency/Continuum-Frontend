'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import {
  Plan,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  type PlanStatus,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan';
import { AgentButton } from '@/components/shared/agent-cards/agentCardKit';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ConceptCard, FORMAT_LABELS, formatDayLabel } from './ConceptCard';
import type {
  PipelineCardState,
  PlanEvidence,
  PlanItem,
  PlanItemStatus,
  UiPlanCard,
} from './types';

type Props = {
  plan: UiPlanCard;
  planItemStatus?: Record<string, PlanItemStatus>;
  pipeline: PipelineCardState[];
  onGenerateItemAction: (itemId: string, clientKey: string) => void;
  // Group approve: the kept (pending, visible) cards in ONE action. The Backend
  // enqueues them in parallel — this replaces fanning out N per-card approvals.
  onGenerateAllAction: (itemIds: string[]) => void;
  onRejectAction: () => void;
  onViewDraftAction: (draftId: string, target: 'calendar' | 'list') => void;
  onEnrichDraftAction?: (draftId: string) => void;
  onGenerateMediaAction?: (draftId: string, format: string, previewRevision: string) => void;
};

// Stable per-card identity so a re-click (a per-card button or the footer)
// collapses to the SAME job on the Backend instead of over-dispatching.
const makeClientKey = (planId: string, itemId: string): string => `${planId}:${itemId}`;

const EVIDENCE_LABELS: Record<PlanEvidence['kind'], string> = {
  trend: 'Trend',
  metric: 'Metric',
  competitor: 'Competitor',
  past_draft: 'Past post',
  brand_doc: 'Brand doc',
};

/** `weekStart` is a bare YYYY-MM-DD; parsing it as a Date would shift it a day west of UTC. */
function formatWeekOf(weekStart: string | undefined): string | null {
  if (!weekStart) return null;
  const [y, m, d] = weekStart.split('-').map(Number);
  if (!y || !m || !d) return null;
  return `Week of ${new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

// Brand names, not capitalized wire tokens — a plan header that says "Tiktok" reads
// like the database wrote it.
const PLATFORM_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const platformName = (value: string): string =>
  PLATFORM_NAMES[value] ?? value.charAt(0).toUpperCase() + value.slice(1);

function formatEstimate(seconds: number | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 90) return `~${Math.round(seconds)} sec to generate`;
  return `~${Math.round(seconds / 60)} min to generate`;
}

/**
 * A weekly plan is a SEQUENCE — `scheduledAt` orders it and `dependsOn` can make that
 * order load-bearing. Sort so a dependency always precedes its dependents, keeping the
 * schedule order otherwise. A cycle (or a reference outside this plan) never drops an
 * item: whatever cannot be placed is appended in schedule order.
 */
function orderByDependency(items: PlanItem[]): PlanItem[] {
  const byId = new Map(items.map((item) => [item.itemId, item]));
  const bySchedule = [...items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const placed = new Set<string>();
  const ordered: PlanItem[] = [];

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const item of bySchedule) {
      if (placed.has(item.itemId)) continue;
      const blocked = (item.dependsOn ?? []).some((id) => byId.has(id) && !placed.has(id));
      if (blocked) continue;
      placed.add(item.itemId);
      ordered.push(item);
      progressed = true;
    }
  }
  for (const item of bySchedule) if (!placed.has(item.itemId)) ordered.push(item);
  return ordered;
}

/** "Mon 25 · Reel" for the one dependency a row actually points at, resolved in-plan. */
function dependencyLabel(item: PlanItem, byId: Map<string, PlanItem>): string | null {
  const parents = (item.dependsOn ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is PlanItem => !!p);
  if (parents.length === 0) return null;
  const first = parents[0];
  const format = first.format ? (FORMAT_LABELS[first.format] ?? first.format) : null;
  const label = [formatDayLabel(first.scheduledAt), format].filter(Boolean).join(' · ');
  return parents.length > 1 ? `${label} +${parents.length - 1} more` : label;
}

function resolvePlanStatus(input: { dismissed: boolean; statuses: PlanItemStatus[] }): PlanStatus {
  if (input.dismissed) return 'rejected';
  if (input.statuses.length === 0) return 'pending';
  if (input.statuses.every((s) => s === 'completed')) return 'completed';
  if (input.statuses.some((s) => s === 'executing' || s === 'completed' || s === 'failed'))
    return 'in_progress';
  return 'awaiting_approval';
}

/**
 * Renders a proposed plan as a date-ordered editorial schedule: one plan card, one row
 * per concept. The row form is the point — a hook is a sentence and needs horizontal
 * room, and `dependsOn` / `scheduledAt` are sequence, which a wrapping grid of square
 * tiles cannot express and cannot fit.
 */
export function ConceptPlan({
  plan,
  planItemStatus,
  pipeline,
  onGenerateItemAction,
  onGenerateAllAction,
  onRejectAction,
  onViewDraftAction,
  onEnrichDraftAction,
  onGenerateMediaAction,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // Synchronous in-flight latch: the async `generatingAll` state updates too late
  // to stop a fast double-click, so this ref blocks the second dispatch at once.
  const generateAllInFlight = useRef(false);
  const reduceMotion = useReducedMotion();

  const items = useMemo(() => (Array.isArray(plan?.items) ? plan.items : []), [plan?.items]);
  const summary = typeof plan?.summary === 'string' ? plan.summary : '';
  const evidence = Array.isArray(plan?.evidence) ? plan.evidence : [];

  const resolveStatus = (item: PlanItem): PlanItemStatus =>
    planItemStatus?.[item.itemId] ?? item.status ?? 'pending';
  const pipelineFor = (itemId: string): PipelineCardState | undefined =>
    pipeline.find((p) => p.planItemId === itemId);

  const ordered = useMemo(() => orderByDependency(items), [items]);
  const byId = useMemo(() => new Map(items.map((item) => [item.itemId, item])), [items]);

  const visibleItems = ordered.filter((item) => !dismissedIds.has(item.itemId));
  const pendingVisibleItems = visibleItems.filter((item) => resolveStatus(item) === 'pending');
  const anyActioned = items.some((item) => resolveStatus(item) !== 'pending');
  const allActioned = items.length > 0 && items.every((item) => resolveStatus(item) !== 'pending');
  const footerLocked =
    dismissed || generatingAll || pendingVisibleItems.length === 0 || allActioned;

  const planStatus = resolvePlanStatus({ dismissed, statuses: items.map(resolveStatus) });
  const platforms = [...new Set(items.map((item) => item.platform))];
  const headerMeta = [
    formatWeekOf(plan?.weekStart),
    `${items.length} ${items.length === 1 ? 'post' : 'posts'}`,
    platforms.length > 0 ? platforms.map(platformName).join(', ') : null,
    formatEstimate(plan?.estimatedDurationSeconds),
  ].filter((part): part is string => Boolean(part));

  const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

  function handleGenerateAll() {
    if (footerLocked || generateAllInFlight.current) return;
    generateAllInFlight.current = true;
    setGeneratingAll(true);
    // ONE group approve of the kept (pending, visible) cards. The Backend enqueues
    // them in parallel and the count always equals the number of jobs created — this
    // replaces the old per-card fan-out (N separate approval messages). Dismissed
    // concepts are excluded because only pendingVisibleItems are sent.
    onGenerateAllAction(pendingVisibleItems.map((item) => item.itemId));
  }

  function handleDismissAll() {
    if (anyActioned || generatingAll) return;
    setDismissed(true);
    onRejectAction();
  }

  return (
    <Plan className="mt-2 gap-3" defaultOpen status={planStatus}>
      <PlanHeader className="gap-1">
        <div className="min-w-0">
          <PlanTitle className="text-sm">{plan?.title || 'Content plan'}</PlanTitle>
          {summary && (
            <PlanDescription className="mt-1 max-w-[68ch] text-xs leading-relaxed">
              {summary}
            </PlanDescription>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs text-muted-foreground">
            {headerMeta.map((part, i) => (
              <span key={part}>
                {i > 0 && <span className="pr-1.5 text-muted-foreground/40">·</span>}
                {part}
              </span>
            ))}
            {evidence.length > 0 && (
              <HoverCard closeDelay={80} openDelay={120}>
                <HoverCardTrigger
                  render={
                    <button
                      className="rounded-sm underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                    >
                      <span className="pr-1.5 text-muted-foreground/40">·</span>
                      Grounded in {evidence.length} {evidence.length === 1 ? 'signal' : 'signals'}
                    </button>
                  }
                />
                <HoverCardContent align="start" className="w-96 p-3">
                  <p className="mb-2 text-2xs font-medium text-muted-foreground">
                    What this plan is built on
                  </p>
                  <ul className="space-y-2">
                    {evidence.map((item, i) => (
                      <li className="text-xs leading-relaxed text-pretty" key={`${item.kind}-${i}`}>
                        <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                          {EVIDENCE_LABELS[item.kind] ?? item.kind}
                        </span>
                        <span className="text-foreground/85">{item.summary}</span>
                      </li>
                    ))}
                  </ul>
                </HoverCardContent>
              </HoverCard>
            )}
          </div>
        </div>
        <PlanTrigger />
      </PlanHeader>

      <PlanContent className="divide-y divide-border/40 border-t border-border/40 pt-0">
        <AnimatePresence initial={false}>
          {visibleItems.map((item, i) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, transition: { duration: reduceMotion ? 0 : 0.15 } }}
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              key={item.itemId ?? i}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { delay: Math.min(i, 6) * 0.04, duration: 0.18, ease }
              }
            >
              <ConceptCard
                concept={item}
                dependsOnLabel={dependencyLabel(item, byId)}
                locked={dismissed}
                onDismiss={() => setDismissedIds((prev) => new Set([...prev, item.itemId]))}
                onEnrichDraft={onEnrichDraftAction}
                onGenerate={() =>
                  onGenerateItemAction(item.itemId, makeClientKey(plan.planId, item.itemId))
                }
                onGenerateMedia={onGenerateMediaAction}
                onViewDraft={onViewDraftAction}
                pipeline={pipelineFor(item.itemId)}
                status={resolveStatus(item)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </PlanContent>

      {!dismissed && visibleItems.length > 1 && (
        <PlanFooter className="justify-end gap-1 pt-0">
          <AgentButton
            disabled={anyActioned || generatingAll}
            onClick={handleDismissAll}
            variant="ghost"
          >
            Dismiss all
          </AgentButton>
          <AgentButton
            disabled={footerLocked}
            loading={generatingAll}
            onClick={handleGenerateAll}
            variant="primary"
          >
            Write copy for {pendingVisibleItems.length}
          </AgentButton>
        </PlanFooter>
      )}
    </Plan>
  );
}
