'use client';

import type {
  JainaToolApprovalRequiredPayload,
  JainaToolApprovalResolvedPayload,
  JainaToolOutputDeniedPayload,
} from '@continuum/contracts';
import { ExternalLink, Maximize2, Network, Table2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useAdAccountCurrency } from '@/components/paid-media/optimizer/useOptimizerData';
import {
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardSummary,
  AgentDecisionCard,
  ApproveRejectActions,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import type { JainaScaffoldState } from '@/lib/jaina/scaffoldTypes';
import {
  openingDailyBudgetOf,
  type ScaffoldTree,
  scaffoldBlockersOf,
} from '@/lib/paid-media/scaffoldTree';
import { ScaffoldAdSetTable } from './ScaffoldAdSetTable';
import { ScaffoldStatusPill } from './ScaffoldStatusPill';
import { ScaffoldTreeCanvas } from './ScaffoldTreeCanvas';
import { formatDailyBudget } from './scaffoldBudget';
import { usePaidScaffoldTree } from './usePaidScaffoldTree';

/**
 * One proposed campaign scaffold, with its approval gate.
 *
 * Read + approve/deny only. There is no edit path here by design: a name, a
 * targeting spec and a billing event are all DERIVED from the version a human
 * approved, so changing an ad set means changing its angle or audience and letting
 * the name recompute — not typing over the name. Revising is "ask Jaina to propose
 * again", which bumps the version and re-hashes the manifest.
 */

export type ScaffoldDecision = 'approve' | 'deny';

/** The three gates read back from the tool name, so the label is never hardcoded. */
const GATE_BY_TOOL_NAME: Record<
  string,
  { gate: 'build' | 'populate' | 'activate'; label: string }
> = {
  paid_scaffold_build: { gate: 'build', label: 'Approve & create (paused)' },
  paid_scaffold_populate: { gate: 'populate', label: 'Approve & add creatives' },
  paid_scaffold_activate: { gate: 'activate', label: 'Approve & activate' },
};

/**
 * Counts from the ROWS once they load. The frame's summary only covers the moment before,
 * and a card seeded from an approval or a reload never had one.
 */
const summaryLine = (scaffold: JainaScaffoldState, tree: ScaffoldTree | null): string => {
  if (!tree && !scaffold.summary) return 'Loading the scaffold…';
  const campaigns = tree ? (tree.campaign ? 1 : 0) : (scaffold.summary?.campaigns ?? 0);
  const adSets = tree ? tree.counts.adSets : (scaffold.summary?.adSets ?? 0);
  const ads = tree ? tree.counts.ads : (scaffold.summary?.ads ?? 0);
  const parts = [
    `${campaigns} campaign${campaigns === 1 ? '' : 's'}`,
    `${adSets} ad set${adSets === 1 ? '' : 's'}`,
    `${ads} ad${ads === 1 ? '' : 's'}`,
  ];
  return `${parts.join(' · ')} — everything is created paused.`;
};

/**
 * The graph is the DEFAULT view, and the table is the alternate.
 *
 * A scaffold's first question is structural — how many ad sets hang off this campaign,
 * how the ads divide between them, which branch failed — and a table answers that by
 * making the reader rebuild the tree in their head from indented rows. It was behind a
 * ghost icon in the table header, which is where it was found least.
 */
type ScaffoldView = 'graph' | 'table';

/** Below this the inline graph is unreadable (a campaign node alone is 300px). */
const NARROW_CARD_PX = 560;

/**
 * The card's own width, or null before the first measurement.
 *
 * Measured rather than container-queried because React Flow cannot be hidden with CSS:
 * `fitView` runs against a zero-sized box under `display: none` and never re-fits. So a
 * narrow card never MOUNTS the graph, and widening it (maximizing the panel) mounts a
 * fresh one at its real size.
 */
function useCardWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function ViewSwitch({
  view,
  onChange,
  onExpand,
  canvasHref,
}: {
  view: ScaffoldView;
  onChange: (next: ScaffoldView) => void;
  onExpand: () => void;
  canvasHref: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1 rounded-md border p-0.5">
        {(
          [
            ['graph', 'Graph', Network],
            ['table', 'Table', Table2],
          ] as const
        ).map(([value, label, Icon]) => (
          <Button
            key={value}
            type="button"
            variant={view === value ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 px-2"
            aria-pressed={view === value}
            onClick={() => onChange(value)}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {view === 'graph' ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5" onClick={onExpand}>
            <Maximize2 className="size-3.5" />
            Expand
          </Button>
        ) : null}
        {canvasHref ? (
          <Link
            href={canvasHref}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-7 gap-1.5' })}
            data-testid="scaffold-open-canvas"
          >
            <ExternalLink className="size-3.5" />
            Open on canvas
          </Link>
        ) : null}
      </div>
    </div>
  );
}

const OUTLINE_LIMIT = 6;

/** The tree at a glance for a card too narrow to draw it: one line per ad set. */
function ScaffoldOutline({ tree, currency }: { tree: ScaffoldTree; currency: string | null }) {
  const hidden = tree.adSets.length - OUTLINE_LIMIT;
  return (
    <ul className="divide-y rounded-md border text-sm" data-testid="scaffold-outline">
      {tree.campaign ? (
        <li className="truncate px-2.5 py-1.5 font-medium" title={tree.campaign.name}>
          {tree.campaign.name}
        </li>
      ) : null}
      {tree.adSets.slice(0, OUTLINE_LIMIT).map((adSet) => (
        <li key={adSet.pathKey} className="flex items-center gap-2 py-1.5 pr-2.5 pl-5">
          <span className="min-w-0 flex-1 truncate" title={adSet.name}>
            {adSet.name}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {formatDailyBudget(adSet.dailyBudgetMinorUnits, currency)} · {adSet.ads.length} ad
            {adSet.ads.length === 1 ? '' : 's'}
          </span>
          <ScaffoldStatusPill status={adSet.status} />
        </li>
      ))}
      {hidden > 0 ? (
        <li className="px-2.5 py-1.5 text-muted-foreground text-xs">
          +{hidden} more ad set{hidden === 1 ? '' : 's'} — expand or open on canvas for all of them.
        </li>
      ) : null}
    </ul>
  );
}

/**
 * The one number the Backend works hardest on — an opening budget sized from the
 * account's measured CPA — stated where a reviewer decides, not three hovers deep.
 */
function OpeningBudget({ tree, currency }: { tree: ScaffoldTree; currency: string | null }) {
  if (tree.adSets.length === 0) return null;
  const { totalMinorUnits, placeholders } = openingDailyBudgetOf(tree);
  const derived = tree.adSets.length - placeholders;
  return (
    <p className="text-sm" data-testid="scaffold-opening-budget">
      {derived > 0 ? (
        <>
          Opening budget{' '}
          <span className="font-medium tabular-nums" data-testid="scaffold-opening-budget-total">
            {formatDailyBudget(totalMinorUnits, currency)}
          </span>{' '}
          across {derived} ad set{derived === 1 ? '' : 's'}, sized from the account&rsquo;s
          measured CPA.
        </>
      ) : null}
      {placeholders > 0
        ? `${derived > 0 ? ' ' : ''}${placeholders} ad set${placeholders === 1 ? ' has' : 's have'} no measured CPA and will build on the placeholder budget.`
        : null}
    </p>
  );
}

/**
 * What stops this scaffold short on Meta, read from the rows. Shown until a gate
 * settles, because it is exactly what a person approving the build needs to know.
 */
function BuildBlockers({ tree }: { tree: ScaffoldTree }) {
  const { adSetsWithoutAudience, adsWithoutCreative } = scaffoldBlockersOf(tree);
  if (adSetsWithoutAudience.length === 0 && adsWithoutCreative === 0) return null;
  const named = adSetsWithoutAudience.slice(0, 3).join(', ');
  const more = adSetsWithoutAudience.length - 3;
  return (
    <div
      className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm"
      data-testid="scaffold-blockers"
    >
      <p className="font-medium">Before this can reach Meta</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
        {adSetsWithoutAudience.length > 0 ? (
          <li data-testid="scaffold-blocker-audience">
            {adSetsWithoutAudience.length} ad set
            {adSetsWithoutAudience.length === 1 ? ' has' : 's have'} no audience ({named}
            {more > 0 ? ` +${more} more` : ''}). Build would create the campaign and stop there.
            Ask Jaina to target {adSetsWithoutAudience.length === 1 ? 'it' : 'them'} from a
            published audience group.
          </li>
        ) : null}
        {adsWithoutCreative > 0 ? (
          <li data-testid="scaffold-blocker-creative">
            {adsWithoutCreative} ad{adsWithoutCreative === 1 ? ' has' : 's have'} no creative
            attached. Populate needs one Library asset per ad.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function PaidScaffoldCard({
  scaffold,
  approval,
  resolution,
  denial,
  optimisticDecision,
  isStreaming,
  onDecide,
}: {
  scaffold: JainaScaffoldState;
  approval: JainaToolApprovalRequiredPayload | null;
  resolution: JainaToolApprovalResolvedPayload | null;
  denial: JainaToolOutputDeniedPayload | null;
  optimisticDecision: ScaffoldDecision | null;
  isStreaming: boolean;
  onDecide?: (approval: JainaToolApprovalRequiredPayload, decision: ScaffoldDecision) => void;
}) {
  const [canvasOpen, setCanvasOpen] = React.useState(false);
  const [selectedPathKey, setSelectedPathKey] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ScaffoldView>('graph');
  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const width = useCardWidth(measureRef);

  const { tree, header, isLoading, isError, error } = usePaidScaffoldTree({
    scaffoldVersionId: scaffold.scaffoldId,
    overlay: scaffold.progressByNode,
    settledAt: scaffold.receipt?.completedAt ?? null,
  });

  const currency = useAdAccountCurrency(
    scaffold.brandId ?? header?.brandId ?? '',
    scaffold.adAccountId ?? header?.adAccountId ?? null,
  );
  const parentScaffoldId = scaffold.parentScaffoldId ?? header?.scaffoldId ?? null;
  const canvasHref = parentScaffoldId
    ? `/scale/campaign-canvas?scaffold=${encodeURIComponent(parentScaffoldId)}`
    : null;

  const gate = approval ? GATE_BY_TOOL_NAME[approval.toolName] : undefined;
  const expired = approval ? Date.parse(approval.expiresAt) < Date.now() : false;
  const decided = optimisticDecision ?? (resolution ? resolution.decision : null);
  const showActions = Boolean(approval && gate && !decided && !expired && onDecide);

  const progressTotal = scaffold.lastProgress?.total ?? 0;
  const progressDone = Object.values(scaffold.progressByNode).filter(
    (entry) => entry.status === 'succeeded' || entry.status === 'skipped',
  ).length;

  return (
    <>
      <AgentDecisionCard data-testid="paid-scaffold-card" data-scaffold-version={scaffold.scaffoldId}>
        <AgentCardEyebrow
          label="Paid campaign scaffold"
          right={
            <ScaffoldStatus
              awaiting={Boolean(approval)}
              decided={decided}
              receipt={scaffold.receipt}
              expired={expired}
              tree={tree}
            />
          }
        />
        <AgentCardBody>
          <AgentCardSummary>{summaryLine(scaffold, tree)}</AgentCardSummary>

          {tree ? <OpeningBudget tree={tree} currency={currency} /> : null}
          {tree && !scaffold.receipt ? <BuildBlockers tree={tree} /> : null}

          {progressTotal > 0 && !scaffold.receipt ? (
            <div className="flex flex-col gap-1">
              <Progress value={(progressDone / progressTotal) * 100} className="h-1.5" />
              <span className="text-muted-foreground text-xs tabular-nums">
                {progressDone} of {progressTotal} created
              </span>
            </div>
          ) : null}

          <ScaffoldReceiptNotice scaffold={scaffold} />

          {isError ? (
            <p className="text-destructive text-sm">
              {error?.message ?? 'Could not load the scaffold.'}
            </p>
          ) : (
            <div ref={measureRef} className="flex flex-col gap-2">
              <ViewSwitch
                view={view}
                onChange={setView}
                onExpand={() => setCanvasOpen(true)}
                canvasHref={canvasHref}
              />
              {view === 'graph' && width !== null && width < NARROW_CARD_PX ? (
                tree ? (
                  <ScaffoldOutline tree={tree} currency={currency} />
                ) : (
                  <p className="text-muted-foreground text-sm">Loading the scaffold…</p>
                )
              ) : view === 'graph' ? (
                <div className="h-[380px] overflow-hidden rounded-md border">
                  {tree && width !== null ? (
                    <ScaffoldTreeCanvas
                      inline
                      tree={tree}
                      currency={currency}
                      selectedPathKey={selectedPathKey}
                      onSelect={setSelectedPathKey}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      {isLoading ? 'Loading the scaffold…' : 'This scaffold has no nodes.'}
                    </div>
                  )}
                </div>
              ) : (
                <ScaffoldAdSetTable tree={tree} isLoading={isLoading} currency={currency} />
              )}
            </div>
          )}

          {denial?.reason ? (
            <p className="text-muted-foreground text-sm">Reason: {denial.reason}</p>
          ) : null}

          {expired && !decided ? (
            <p className="text-muted-foreground text-sm">
              This approval expired, so nothing was created. Ask Jaina to propose the scaffold
              again.
            </p>
          ) : null}
        </AgentCardBody>

        {showActions && approval && gate ? (
          <ApproveRejectActions
            locked={isStreaming}
            approveLabel={gate.label}
            onApprove={() => onDecide?.(approval, 'approve')}
            onReject={() => onDecide?.(approval, 'deny')}
          />
        ) : null}
      </AgentDecisionCard>

      <Dialog open={canvasOpen} onOpenChange={setCanvasOpen}>
        <DialogContent className="flex h-[88vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">Campaign scaffold — tree view</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {tree ? (
              <ScaffoldTreeCanvas
                tree={tree}
                currency={currency}
                selectedPathKey={selectedPathKey}
                onSelect={setSelectedPathKey}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScaffoldStatus({
  awaiting,
  decided,
  receipt,
  expired,
  tree,
}: {
  /** An approval is open on this card. Propose is ungated, so a bare proposal has none. */
  awaiting: boolean;
  decided: ScaffoldDecision | 'approved' | 'denied' | null;
  receipt: JainaScaffoldState['receipt'];
  expired: boolean;
  tree: ScaffoldTree | null;
}) {
  if (receipt) {
    const tone =
      receipt.status === 'completed' ? 'done' : receipt.status === 'partial' ? 'running' : 'failed';
    return <StatusLabel tone={tone}>{receipt.status}</StatusLabel>;
  }
  if (decided === 'deny' || decided === 'denied') {
    return <StatusLabel tone="neutral">Declined — nothing created</StatusLabel>;
  }
  if (decided === 'approve' || decided === 'approved') {
    return <StatusLabel tone="running">Approved</StatusLabel>;
  }
  if (expired) return <StatusLabel tone="neutral">Expired</StatusLabel>;
  if (awaiting) return <StatusLabel tone="waiting">Awaiting your approval</StatusLabel>;
  // A reloaded proposal can be older than a build that has since run in a later turn.
  const onMeta = tree?.counts.created ?? 0;
  if (onMeta > 0) {
    return <StatusLabel tone="done">{onMeta} on Meta</StatusLabel>;
  }
  return <StatusLabel tone="neutral">Proposed — nothing on Meta yet</StatusLabel>;
}

/**
 * Unrecorded Meta ids are the highest-priority line in any receipt: they are objects
 * that may exist without a record, so a retry would duplicate them. Surfaced above
 * everything else rather than buried in an error list.
 */
function ScaffoldReceiptNotice({ scaffold }: { scaffold: JainaScaffoldState }) {
  const receipt = scaffold.receipt as
    | (Record<string, unknown> & { errors?: { message: string }[] })
    | null;
  if (!receipt) return null;
  const unrecorded = Array.isArray(receipt.unrecordedMetaObjectIds)
    ? (receipt.unrecordedMetaObjectIds as string[])
    : [];

  if (unrecorded.length > 0) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm">
        <p className="font-medium">
          {unrecorded.length} object{unrecorded.length === 1 ? '' : 's'} may exist on Meta without a
          record.
        </p>
        <p className="text-muted-foreground">
          Do not retry this gate — read the ad account first, or the retry will create duplicates.
        </p>
      </div>
    );
  }

  const firstError = receipt.errors?.[0]?.message;
  return firstError ? <p className="text-destructive text-sm">{firstError}</p> : null;
}
