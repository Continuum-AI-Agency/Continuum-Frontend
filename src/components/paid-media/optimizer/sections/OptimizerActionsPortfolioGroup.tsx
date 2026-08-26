'use client';

// One portfolio's UNIFIED actionable queue. The portfolio's performance report carries
// two kinds of work a human decides on: budget moves (cycle_items — held, approved, or a
// scored change not yet written) and recommendations (pause / fatigue). This surface reads
// both, lets the operator multi-select and approve them, and then EXECUTES the approved set
// through the real Meta write path — budget drains via optimizer-apply-approved, pauses via
// the audited optimizer-apply-adset-status drain. The app makes the Meta call; the user
// never opens Business Manager.
//
// Creative kinds (variate_creative / seed_experiment) are approvable: approving one opens a
// creative request — a tracked task, or a generation job when the portfolio has autogen on —
// and its brief renders inline from the recommendation's seed. pause_ad is still FOUND but not
// executable (no single-ad pause drain yet), so it renders read-only with a danger tooltip —
// never a button that lies about acting.
//
// Approve is optimistic (a spinner while in flight, rolled back on error); an APPLIED state
// is never assumed from a mutation — it is read back from the drain's per-item results and
// the refetch the mutations trigger.

import type {
  CycleItemRow,
  ParsedCycleRunReport,
  PortfolioListItem,
  RecommendationRow,
} from '@continuum/contracts';
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { resolveAdsetName } from '../adsetName';
import { AdSetIdLabel } from '../charts/AdSetIdLabel';
import { attributeTransfers, type TransferAttribution } from '../charts/chartData';
import { formatCurrency } from '../format';
import {
  actionRoute,
  applyModeExplainer,
  creativeBriefForRec,
  notImplementedMessage,
  parseReport,
  recommendationLabel,
  severityBadgeVariant,
  severityRank,
} from '../reportModel';
import {
  useApplyAdsetStatus,
  useApplyApproved,
  useOptimizerActions,
  useOptimizerEnrolledAdsets,
  useOptimizerMutations,
  useOptimizerPerformance,
} from '../useOptimizerData';
import { ActionRow } from './OptimizerActionFeed';
import { OptimizerReadError } from './OptimizerReadError';
import { RecommendationInsight } from './RecommendationInsight';

/** A budget move needing a decision — held by autopilot, approved and awaiting the drain,
 *  or a scored change not yet written (recommend mode). */
export type BudgetQueueRow = {
  key: string;
  route: 'budget';
  adsetId: string;
  name: string | null;
  item: CycleItemRow;
  /** apply_status === 'approved_pending' — already approved, awaiting "Apply N budget moves". */
  approved: boolean;
};

/** A recommendation needing a decision. `route` is where an approval drains to:
 *  'pause' (audited Meta pause), 'creative' (a creative request — task or generation job),
 *  'fatigue' (renewal task), 'hidden' (found, not executable). */
export type RecQueueRow = {
  key: string;
  route: 'pause' | 'creative' | 'fatigue' | 'hidden';
  adsetId: string;
  name: string | null;
  rec: RecommendationRow;
  /** rec.status === 'approved' — a pause awaiting "Pause N ad sets". */
  approved: boolean;
};

export type QueueRow = BudgetQueueRow | RecQueueRow;

/** The checkbox's accessible name. It has to name the DECISION, not just the ad set: one
 *  cycle can queue a budget move AND a creative refresh on the same ad set, and labelling
 *  both "Select <ad set>" gave two different writes one indistinguishable name — a screen
 *  reader user could not tell which one they were authorizing. */
export function selectionLabel(row: QueueRow): string {
  const subject = row.name ?? row.adsetId;
  if (row.route === 'budget') return `Select budget move for ${subject}`;
  return `Select ${recommendationLabel(row.rec.kind).label.toLowerCase()} for ${subject}`;
}

/** A row a human can select and approve. Approved rows (awaiting execute) and hidden
 *  ad-level rows are shown but never selectable. */
export function isSelectableRow(row: QueueRow): boolean {
  if (row.route === 'hidden') return false;
  if (row.route === 'budget') return !row.approved;
  return row.rec.status === 'pending';
}

/** Build ONE portfolio's unified queue from its parsed performance report. Pure and
 *  DOM-free so the ordering + inclusion rules are unit-tested without React. Ordering:
 *  work needing a decision first (budget moves, then recs by severity), approved-awaiting-
 *  execute next, and the hidden ad-level rows last. */
export function buildActionQueue(
  report: ParsedCycleRunReport | null,
  nameById?: Map<string, string> | null,
): QueueRow[] {
  if (!report) return [];
  const rows: QueueRow[] = [];

  for (const item of report.latest_items) {
    const status = item.apply_status ?? null;
    const changed = (item.change_abs ?? 0) !== 0;
    // A held item (autopilot over-cap), an approved item (awaiting drain), or a scored move
    // not yet written (recommend mode) is actionable. Applied/failed/skipped rows live in Logs.
    const actionable =
      status === 'held' || status === 'approved_pending' || (status == null && changed);
    if (!actionable) continue;
    rows.push({
      key: `budget:${item.adset_id}`,
      route: 'budget',
      adsetId: item.adset_id,
      name: resolveAdsetName(item, nameById),
      item,
      approved: status === 'approved_pending',
    });
  }

  for (const rec of report.recommendations) {
    // Budget is never a recommendation route (budget moves are cycle_items), so the rec route
    // is one of pause | fatigue | hidden — narrow it so the row's union type is exact.
    const route = actionRoute(rec.kind);
    const recRoute: RecQueueRow['route'] = route === 'budget' ? 'fatigue' : route;
    // Pending recs need a decision; an APPROVED pause awaits its drain. Everything else
    // (rejected, applied, a hidden kind already approved) is not queue work.
    const relevant =
      rec.status === 'pending' || (recRoute === 'pause' && rec.status === 'approved');
    if (!relevant) continue;
    rows.push({
      key: `rec:${rec.id}`,
      route: recRoute,
      adsetId: rec.adset_id,
      name: resolveAdsetName(rec, nameById),
      rec,
      approved: rec.status === 'approved',
    });
  }

  return rows.sort((a, b) => queueRank(a) - queueRank(b));
}

/** Who this ad set's budget came from, or went to. `direction` is from the row's point of
 *  view: a cut ad set FUNDS others, a raised one is FUNDED BY them. */
export type Counterparty = { adsetId: string; name: string | null; amount: number };

/** Attribution → per-ad-set counterparty lists, largest first. Slivers under a dollar are
 *  dropped here rather than in the pure function, which stays exact so its sums test cleanly. */
export function buildCounterparties(
  attribution: TransferAttribution,
  nameById?: Map<string, string> | null,
): Map<string, { direction: 'funds' | 'fundedBy'; parties: Counterparty[] }> {
  const byAdset = new Map<string, { direction: 'funds' | 'fundedBy'; parties: Counterparty[] }>();
  const name = (id: string) => resolveAdsetName({ adset_id: id }, nameById);

  for (const transfer of attribution.transfers) {
    if (transfer.amount < 1) continue;
    const donor = byAdset.get(transfer.fromAdsetId) ?? { direction: 'funds' as const, parties: [] };
    donor.parties.push({
      adsetId: transfer.toAdsetId,
      name: name(transfer.toAdsetId),
      amount: transfer.amount,
    });
    byAdset.set(transfer.fromAdsetId, donor);

    const recipient = byAdset.get(transfer.toAdsetId) ?? {
      direction: 'fundedBy' as const,
      parties: [],
    };
    recipient.parties.push({
      adsetId: transfer.fromAdsetId,
      name: name(transfer.fromAdsetId),
      amount: transfer.amount,
    });
    byAdset.set(transfer.toAdsetId, recipient);
  }

  for (const entry of byAdset.values()) entry.parties.sort((a, b) => b.amount - a.amount);
  return byAdset;
}

/** Sort key: needs-decision first, approved-awaiting-execute next, hidden last; within the
 *  needs-decision band, higher-severity recs rise. */
function queueRank(row: QueueRow): number {
  if (row.route === 'hidden') return 300;
  if (row.approved) return 200;
  if (row.route === 'budget') return 10;
  return 100 - severityRank(row.rec.severity);
}

type OptimizerActionsPortfolioGroupProps = {
  brandId: string;
  adAccountId: string;
  portfolio: PortfolioListItem;
};

export function OptimizerActionsPortfolioGroup({
  brandId,
  adAccountId,
  portfolio,
}: OptimizerActionsPortfolioGroupProps) {
  const performanceQuery = useOptimizerPerformance(portfolio.id);
  const enrolledQuery = useOptimizerEnrolledAdsets(portfolio.id);
  const { setStatus, setStatuses, requestApplyItems } = useOptimizerMutations(brandId, adAccountId);
  const applyApproved = useApplyApproved();
  const applyAdsetStatus = useApplyAdsetStatus();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [approving, setApproving] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [routeFilters, setRouteFilters] = React.useState<Set<QueueRow['route']>>(new Set());
  const [executeNote, setExecuteNote] = React.useState<string | null>(null);
  const [failedAdsets, setFailedAdsets] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState<null | 'budget' | 'pause'>(null);

  const report = parseReport(performanceQuery.data);
  const nameById = React.useMemo(
    () => new Map(enrolledQuery.data.map((row) => [row.adset_id, row.adset_name ?? ''])),
    [enrolledQuery.data],
  );
  const rows = React.useMemo(() => buildActionQueue(report, nameById), [report, nameById]);

  const runId = (report?.latest_run as { id?: string } | null)?.id ?? null;
  // Observe hard-halts every Meta write; approving/executing is disabled and the reason shown.
  const writesBlocked = portfolio.apply_mode === 'observe';

  const visibleRows = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (routeFilters.size > 0 && !routeFilters.has(row.route)) return false;
      if (!term) return true;
      return rowSearchText(row).includes(term);
    });
  }, [rows, routeFilters, search]);

  const selectableVisible = visibleRows.filter(isSelectableRow);
  const rowByKey = React.useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);

  const approvedBudgetCount = rows.filter((row) => row.route === 'budget' && row.approved).length;
  const approvedPauseCount = rows.filter((row) => row.route === 'pause' && row.approved).length;

  // Attribution runs over the FULL allocation vector, not the queue rows: in autopilot only
  // the over-cap items are 'held' and the rest are filtered out of the queue, but the whole
  // vector is the only correct pro-rata denominator. So a held raise can legitimately read
  // "funded by Cold Lookalike" where Cold Lookalike is not itself in the queue.
  const attribution = React.useMemo(
    () => attributeTransfers(report?.latest_items ?? []),
    [report?.latest_items],
  );
  // Attribution knows only ad set IDs, so naming has to go through a map. cycle_items carry
  // the authoritative adset_name (the performance RPC's join) and the enrolled roster is the
  // fallback — same precedence resolveAdsetName documents, just flattened into one map.
  const transferNameById = React.useMemo(() => {
    const merged = new Map(nameById);
    for (const item of report?.latest_items ?? []) {
      const name = item.adset_name?.trim();
      if (name) merged.set(item.adset_id, name);
    }
    return merged;
  }, [nameById, report?.latest_items]);
  const counterpartyById = React.useMemo(
    () => buildCounterparties(attribution, transferNameById),
    [attribution, transferNameById],
  );

  const selectableBudgetRows = rows.filter((row) => row.route === 'budget' && isSelectableRow(row));
  const budgetGroupSelected =
    selectableBudgetRows.length > 0 && selectableBudgetRows.every((row) => selected.has(row.key));
  // What approving exactly the current selection does to total daily spend. Raw change_abs
  // sum — no filtering — because that is literally the question. Selecting a conserved set
  // reads flat; selecting only the raise reads +$15/day.
  const selectedBudgetRows = rows.filter(
    (row): row is BudgetQueueRow => row.route === 'budget' && selected.has(row.key),
  );
  const selectionNetDelta =
    selectedBudgetRows.length === 0
      ? null
      : selectedBudgetRows.reduce((sum, row) => sum + (row.item.change_abs ?? 0), 0);

  if (performanceQuery.isLoading) return <Skeleton className="h-28 rounded-lg" />;
  // A failed read used to fall through to rows.length === 0 and return null, so the whole
  // group disappeared from a queue that had just counted this portfolio as having work.
  // Name it instead — the count and the list must never disagree in silence.
  if (performanceQuery.isError) {
    return (
      <OptimizerReadError
        error={performanceQuery.error}
        onRetry={() => void performanceQuery.refetch()}
        subject={`actions for ${portfolio.name}`}
      />
    );
  }
  if (rows.length === 0) return null;

  const clearTransient = () => {
    setSelected(new Set());
    setApproving(new Set());
  };

  const runApprove = (keys: string[]) => {
    if (writesBlocked || keys.length === 0) return;
    const rowsToApprove = keys
      .map((key) => rowByKey.get(key))
      .filter((row): row is QueueRow => Boolean(row) && isSelectableRow(row as QueueRow));

    const budgetIds = rowsToApprove
      .filter((row): row is BudgetQueueRow => row.route === 'budget')
      .map((row) => row.adsetId);
    const pauseIds = rowsToApprove
      .filter((row): row is RecQueueRow => row.route === 'pause')
      .map((row) => row.rec.id);
    // Fatigue and creative approvals both open a tracked task server-side (the fan-out RPC
    // decides task-vs-generation-job from the portfolio's autogen config); the FE flips the
    // status the same way for both and lets the backend route.
    const taskRecs = rowsToApprove.filter(
      (row): row is RecQueueRow => row.route === 'fatigue' || row.route === 'creative',
    );

    setExecuteNote(null);
    setApproving(new Set(rowsToApprove.map((row) => row.key)));

    const onDone = () => setApproving(new Set());
    const onFail = (label: string) => (err: unknown) => {
      setApproving(new Set());
      setExecuteNote(err instanceof Error ? err.message : `Could not approve ${label}.`);
    };

    if (budgetIds.length > 0 && runId) {
      requestApplyItems.mutate(
        { run_id: runId, adset_ids: budgetIds },
        { onError: onFail('budget moves'), onSettled: onDone },
      );
    }
    if (pauseIds.length > 0) {
      setStatuses.mutate(
        { rec_ids: pauseIds, status: 'approved' },
        { onError: onFail('pauses'), onSettled: onDone },
      );
    }
    // Creative + fatigue approvals open a request one at a time — the single-rec path. Route
    // is left unset so the backend follows the portfolio's autogen config.
    for (const row of taskRecs) {
      setStatus.mutate(
        { recommendation_id: row.rec.id, status: 'approved' },
        { onError: onFail('creative requests'), onSettled: onDone },
      );
    }
    setSelected(new Set());
  };

  const applyBudgets = () => {
    setConfirm(null);
    setExecuteNote(null);
    setFailedAdsets(new Set());
    applyApproved.mutate(
      {
        portfolio_id: portfolio.id,
        brandId,
        accountId: adAccountId,
        run_id: runId ?? undefined,
        dryRun: false,
      },
      {
        onSuccess: (data) => {
          if (!data?.ok) {
            setExecuteNote(applyFailureNote(data?.reason, data?.error, 'budget moves'));
            return;
          }
          recordFailures(data.results ?? [], setFailedAdsets);
          setExecuteNote(applySummary('Applied', data.applied, data.failed, data.deduped));
        },
        onError: (err) =>
          setExecuteNote(err instanceof Error ? err.message : 'Applying budget moves failed.'),
      },
    );
  };

  const pauseAdsets = () => {
    setConfirm(null);
    setExecuteNote(null);
    setFailedAdsets(new Set());
    applyAdsetStatus.mutate(
      { portfolio_id: portfolio.id, brandId, accountId: adAccountId, dryRun: false },
      {
        onSuccess: (data) => {
          if (!data?.ok) {
            setExecuteNote(applyFailureNote(data?.reason, data?.error, 'pauses'));
            return;
          }
          recordFailures(data.results ?? [], setFailedAdsets);
          setExecuteNote(applySummary('Paused', data.applied, data.failed, data.deduped));
        },
        onError: (err) =>
          setExecuteNote(err instanceof Error ? err.message : 'Pausing ad sets failed.'),
      },
    );
  };

  const allSelected =
    selectableVisible.length > 0 && selectableVisible.every((row) => selected.has(row.key));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableVisible.map((row) => row.key)));
    }
  };

  const toggleBudgetGroup = () => {
    if (writesBlocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of selectableBudgetRows) {
        if (budgetGroupSelected) next.delete(row.key);
        else next.add(row.key);
      }
      return next;
    });
  };

  const toggleRow = (row: QueueRow) => {
    if (!isSelectableRow(row) || writesBlocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });
  };

  const busyApprove = requestApplyItems.isPending || setStatuses.isPending || setStatus.isPending;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {portfolio.name}
          <Badge variant="secondary" className="text-3xs">
            {selectableVisible.length || rows.length}
          </Badge>
        </h3>
        <Input
          aria-label={`Search ${portfolio.name} actions`}
          className="h-7 w-full max-w-56 text-xs sm:w-56"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, id, kind, reason"
          value={search}
        />
      </div>

      <QueueToolbar
        activeFilters={routeFilters}
        allSelected={allSelected}
        applyApprovedPending={applyApproved.isPending}
        applyBudgetCount={approvedBudgetCount}
        approvedPauseCount={approvedPauseCount}
        busyApprove={busyApprove}
        hasSelection={selected.size > 0}
        onApproveAll={() => runApprove(selectableVisible.map((row) => row.key))}
        onApproveSelected={() => runApprove([...selected])}
        onExecuteBudgets={() => setConfirm('budget')}
        onExecutePauses={() => setConfirm('pause')}
        onToggleFilter={(route) =>
          setRouteFilters((prev) => {
            const next = new Set(prev);
            if (next.has(route)) next.delete(route);
            else next.add(route);
            return next;
          })
        }
        onToggleSelectAll={toggleSelectAll}
        pausePending={applyAdsetStatus.isPending}
        selectableCount={selectableVisible.length}
        selectionNetDelta={selectionNetDelta}
        writesBlocked={writesBlocked}
      />

      {writesBlocked ? (
        <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-2xs text-warning">
          {applyModeExplainer(portfolio.apply_mode)}
        </p>
      ) : null}

      {executeNote ? (
        <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-2xs text-muted-foreground">
          {executeNote}
        </p>
      ) : null}

      <ul className="space-y-2">
        {visibleRows.map((row, index) => (
          <React.Fragment key={row.key}>
            {/* The budget rows already sort into one contiguous block (queueRank gives them
                all 10, and Array.sort is stable), so the header goes in front of the first
                one rather than restructuring the queue. Gated on there being a real transfer
                to describe — a cycle that only raises has no donor and nothing to group. */}
            {attribution.transfers.length > 0 &&
            row.route === 'budget' &&
            visibleRows[index - 1]?.route !== 'budget' ? (
              <BudgetTransferHeader
                allSelected={budgetGroupSelected}
                attribution={attribution}
                currency={null}
                mode={report?.latest_run?.mode ?? null}
                nameById={transferNameById}
                onToggleGroup={toggleBudgetGroup}
                writesBlocked={writesBlocked}
              />
            ) : null}
            <QueueRowView
              brandId={brandId}
              counterparty={
                row.route === 'budget' ? (counterpartyById.get(row.adsetId) ?? null) : null
              }
              currency={null}
              expanded={expanded === row.key}
              failed={failedAdsets.has(row.adsetId)}
              approving={approving.has(row.key)}
              onToggleExpand={() => setExpanded(expanded === row.key ? null : row.key)}
              onToggleSelect={() => toggleRow(row)}
              row={row}
              selected={selected.has(row.key)}
              writesBlocked={writesBlocked}
            />
          </React.Fragment>
        ))}
      </ul>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'pause'
                ? `Pause ${approvedPauseCount} ad set${approvedPauseCount === 1 ? '' : 's'} on Meta?`
                : `Apply ${approvedBudgetCount} budget move${approvedBudgetCount === 1 ? '' : 's'} to Meta?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'pause'
                ? 'Pausing stops these ad sets from spending immediately. Every pause lands in Recently applied below, where one click unpauses it.'
                : 'This writes the approved daily budgets to Meta now. Every change lands in Recently applied below, where one click puts the prior budget back.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm === 'pause' ? pauseAdsets : applyBudgets}>
              {confirm === 'pause' ? 'Pause ad sets' : 'Apply budget moves'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PortfolioRecentActions
        brandId={brandId}
        portfolioId={portfolio.id}
        currency={null}
      />

      {/* Nothing above clears selection on refetch — a mutation's invalidate rebuilds the rows,
          and a stale key would silently point at nothing. */}
      <SelectionSweeper
        keys={rows.map((row) => row.key)}
        selected={selected}
        onSweep={clearTransient}
      />
    </section>
  );
}

/** How many recent ad-account writes this portfolio shows inline. Enough to undo the move
 *  you just made without leaving the queue; the whole trail is in Activity → Actions. */
const RECENT_ACTION_LIMIT = 5;

/**
 * The undo strip: this portfolio's most recent ad-account writes, each with one-click revert.
 *
 * Approving a change and undoing it used to live in two different places — the queue applied,
 * and the confirm dialog told you to go find the activity log if you changed your mind. The
 * write and its undo belong to the same moment, so the writes land here, under the queue that
 * made them.
 *
 * Eligibility is the RPC's `reversible`, never a guess from the row's shape: TRUE only for a
 * write that recorded a real prior value to restore. A row already undone says so instead of
 * offering the button twice. Settings and decisions are excluded outright — undoing a config
 * change is not one write against Meta, and a button that pretends otherwise is how one click
 * becomes an outage.
 */
function PortfolioRecentActions({
  brandId,
  portfolioId,
  currency,
}: {
  brandId: string;
  portfolioId: string;
  currency: string | null;
}) {
  const actionsQuery = useOptimizerActions(brandId);
  // A failed or empty action read must not push an error into the queue — the queue's own work
  // is unaffected by it. The full feed reports its own outage in Activity → Actions.
  const recent = actionsQuery.data
    .filter((row) => row.portfolio_id === portfolioId && row.family === 'money')
    .slice(0, RECENT_ACTION_LIMIT);

  if (recent.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recently applied
      </p>
      <ul className="space-y-2">
        {recent.map((row) => (
          <ActionRow key={row.id} row={row} brandId={brandId} currency={currency} />
        ))}
      </ul>
    </div>
  );
}

/** After a refetch rebuilds the queue, drop any selection/approving key that no longer maps to
 *  a row so a completed approve never leaves a phantom selection behind. */
function SelectionSweeper({
  keys,
  selected,
  onSweep,
}: {
  keys: string[];
  selected: Set<string>;
  onSweep: () => void;
}) {
  const keySet = React.useMemo(() => new Set(keys), [keys]);
  React.useEffect(() => {
    for (const key of selected) {
      if (!keySet.has(key)) {
        onSweep();
        return;
      }
    }
  }, [keySet, selected, onSweep]);
  return null;
}

function rowSearchText(row: QueueRow): string {
  const parts = [row.name ?? '', row.adsetId, row.route];
  if (row.route === 'budget') {
    parts.push('budget', 'reallocation');
  } else {
    parts.push(row.rec.kind, row.rec.reason ?? '', row.rec.severity ?? '', row.rec.trigger);
  }
  return parts.join(' ').toLowerCase();
}

function applySummary(verb: string, applied?: number, failed?: number, deduped?: number): string {
  return (
    `${verb} ${applied ?? 0}` +
    (failed ? ` · ${failed} failed` : '') +
    (deduped ? ` · ${deduped} already done` : '')
  );
}

function applyFailureNote(
  reason: string | undefined,
  error: string | undefined,
  label: string,
): string {
  if (reason === 'observe_mode') return 'Observe mode blocks Meta writes.';
  return error?.trim() || reason || `Applying ${label} failed.`;
}

function recordFailures(
  results: { adsetId: string; ok: boolean }[],
  set: React.Dispatch<React.SetStateAction<Set<string>>>,
): void {
  const failed = results.filter((result) => !result.ok).map((result) => result.adsetId);
  if (failed.length > 0) set(new Set(failed));
}

const ROUTE_FILTERS: { route: QueueRow['route']; label: string }[] = [
  { route: 'budget', label: 'Budget' },
  { route: 'pause', label: 'Pause' },
  { route: 'creative', label: 'Creative' },
  { route: 'fatigue', label: 'Fatigue' },
  { route: 'hidden', label: 'Ad-level' },
];

function QueueToolbar({
  activeFilters,
  allSelected,
  applyApprovedPending,
  applyBudgetCount,
  approvedPauseCount,
  busyApprove,
  hasSelection,
  onApproveAll,
  onApproveSelected,
  onExecuteBudgets,
  onExecutePauses,
  onToggleFilter,
  onToggleSelectAll,
  pausePending,
  selectableCount,
  selectionNetDelta,
  writesBlocked,
}: {
  activeFilters: Set<QueueRow['route']>;
  allSelected: boolean;
  applyApprovedPending: boolean;
  applyBudgetCount: number;
  approvedPauseCount: number;
  busyApprove: boolean;
  hasSelection: boolean;
  onApproveAll: () => void;
  onApproveSelected: () => void;
  onExecuteBudgets: () => void;
  onExecutePauses: () => void;
  onToggleFilter: (route: QueueRow['route']) => void;
  onToggleSelectAll: () => void;
  pausePending: boolean;
  selectableCount: number;
  /** Net daily-spend change if the current selection is approved. null when none is. */
  selectionNetDelta: number | null;
  writesBlocked: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
      <span className="flex items-center gap-1.5 pl-1 text-2xs text-muted-foreground">
        <Checkbox
          aria-label="Select all actionable"
          checked={allSelected}
          disabled={writesBlocked || selectableCount === 0}
          onCheckedChange={onToggleSelectAll}
        />
        All
      </span>

      <div className="flex flex-wrap items-center gap-1">
        {ROUTE_FILTERS.map((option) => (
          <button
            key={option.route}
            aria-pressed={activeFilters.has(option.route)}
            className={cn(
              'rounded-md border px-1.5 py-0.5 text-3xs font-medium transition-colors',
              activeFilters.has(option.route)
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/70 bg-card text-muted-foreground hover:bg-muted/50',
            )}
            onClick={() => onToggleFilter(option.route)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {/* A cycle's budget moves are conserved as a set, so approving a strict subset moves
            total spend. Sum the selection and say by how much rather than warning abstractly. */}
        {selectionNetDelta == null ? null : Math.abs(selectionNetDelta) < 0.5 ? (
          <span className="text-2xs text-muted-foreground">Spend stays flat</span>
        ) : (
          <span className="text-2xs text-warning tabular-nums">
            Net {selectionNetDelta > 0 ? '+' : '−'}
            {formatCurrency(Math.abs(selectionNetDelta), null)}/day
          </span>
        )}
        <Button
          className="h-7 px-2.5 text-xs"
          disabled={writesBlocked || !hasSelection || busyApprove}
          onClick={onApproveSelected}
          size="sm"
          type="button"
          variant="secondary"
        >
          {busyApprove ? <Loader2Icon className="mr-1 size-3.5 animate-spin" /> : null}
          Approve selected
        </Button>
        <Button
          className="h-7 px-2.5 text-xs"
          disabled={writesBlocked || selectableCount === 0 || busyApprove}
          onClick={onApproveAll}
          size="sm"
          type="button"
          variant="ghost"
        >
          Approve all
        </Button>
        {applyBudgetCount > 0 ? (
          <Button
            className="h-7 px-2.5 text-xs"
            disabled={writesBlocked || applyApprovedPending}
            onClick={onExecuteBudgets}
            size="sm"
            type="button"
          >
            {applyApprovedPending ? <Loader2Icon className="mr-1 size-3.5 animate-spin" /> : null}
            Apply {applyBudgetCount} budget move{applyBudgetCount === 1 ? '' : 's'}
          </Button>
        ) : null}
        {approvedPauseCount > 0 ? (
          <Button
            className="h-7 px-2.5 text-xs"
            disabled={writesBlocked || pausePending}
            onClick={onExecutePauses}
            size="sm"
            type="button"
            variant="destructive"
          >
            {pausePending ? <Loader2Icon className="mr-1 size-3.5 animate-spin" /> : null}
            Pause {approvedPauseCount} ad set{approvedPauseCount === 1 ? '' : 's'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The one decision the solver actually made, said once above the rows it produced.
 *
 *  Nothing pairwise is stored: the engine emits a complete allocation vector where every
 *  raise is already paid for by the cuts. Rendering that as N independent rows was the bug —
 *  an operator could not see that taking $15 off one ad set is what funds the other. The rows
 *  stay individually selectable, because approving a subset is legitimate; the header just
 *  makes the coupling visible, and the toolbar says what a partial approval costs. */
function BudgetTransferHeader({
  attribution,
  nameById,
  currency,
  mode,
  allSelected,
  onToggleGroup,
  writesBlocked,
}: {
  attribution: TransferAttribution;
  nameById?: Map<string, string> | null;
  currency: string | null;
  mode: string | null;
  allSelected: boolean;
  onToggleGroup: () => void;
  writesBlocked: boolean;
}) {
  const { donors, recipients, moved, net } = attribution;
  const name = (id: string) => resolveAdsetName({ adset_id: id }, nameById) ?? id;
  const pair = donors.length === 1 && recipients.length === 1;

  // net is ground truth for the items actually shown; mode only words the exception.
  const conservation =
    Math.abs(net) < 1
      ? 'Total daily spend unchanged.'
      : mode === 'scale'
        ? `Total daily spend ${net > 0 ? '+' : '−'}${formatCurrency(Math.abs(net), currency)}/day — this cycle grows the pool.`
        : `Total daily spend ${net > 0 ? '+' : '−'}${formatCurrency(Math.abs(net), currency)}/day — this is not a flat reallocation.`;

  return (
    <li className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <div className="flex items-start gap-2.5">
        <Checkbox
          aria-label="Select all budget moves in this cycle"
          checked={allSelected}
          className="mt-0.5"
          disabled={writesBlocked}
          onCheckedChange={onToggleGroup}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight">
            {pair ? (
              <>
                Moving <span className="tabular-nums">{formatCurrency(moved, currency)}/day</span>{' '}
                from {name(donors[0].adsetId)} into {name(recipients[0].adsetId)}
              </>
            ) : (
              <>
                Reallocating{' '}
                <span className="tabular-nums">{formatCurrency(moved, currency)}/day</span> —{' '}
                {donors.length} ad set{donors.length === 1 ? '' : 's'} fund {recipients.length}
              </>
            )}
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {conservation} These moves are one decision — approving only some of them changes the
            total.
          </p>
        </div>
      </div>
    </li>
  );
}

/** "← from Cold Lookalike $15" on a raised ad set, "→ to Retarget 30d $15" on a cut one. */
function CounterpartyLine({
  entry,
  currency,
  limit,
}: {
  entry: { direction: 'funds' | 'fundedBy'; parties: Counterparty[] };
  currency: string | null;
  limit: number;
}) {
  const shown = entry.parties.slice(0, limit);
  const rest = entry.parties.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <span className="text-3xs text-muted-foreground">
      {entry.direction === 'funds' ? '→ funds ' : '← funded by '}
      {shown
        .map((party) => `${party.name ?? party.adsetId} ${formatCurrency(party.amount, currency)}`)
        .join(' · ')}
      {rest > 0 ? ` +${rest} more` : ''}
    </span>
  );
}

function QueueRowView({
  row,
  brandId,
  currency,
  selected,
  approving,
  failed,
  expanded,
  writesBlocked,
  counterparty,
  onToggleSelect,
  onToggleExpand,
}: {
  row: QueueRow;
  brandId: string;
  currency: string | null;
  selected: boolean;
  approving: boolean;
  failed: boolean;
  expanded: boolean;
  writesBlocked: boolean;
  counterparty?: { direction: 'funds' | 'fundedBy'; parties: Counterparty[] } | null;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  const selectable = isSelectableRow(row);
  const hidden = row.route === 'hidden';

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the whole-row click is a pointer convenience; the accessible, keyboard-operable selection control is the Checkbox inside. Making the <li> a role=button would nest interactive controls (checkbox, expander, hover card).
    <li
      className={cn(
        'rounded-lg border bg-card px-3 py-2 transition-colors',
        selected ? 'border-primary/60 bg-accent/40 ring-1 ring-primary/40' : 'border-border/70',
        selectable && !writesBlocked && 'cursor-pointer hover:bg-muted/30',
      )}
      onClick={selectable ? onToggleSelect : undefined}
    >
      <div className="flex items-start gap-2.5">
        {hidden ? (
          <AdLevelDangerIcon />
        ) : (
          <Checkbox
            aria-label={selectionLabel(row)}
            checked={selected}
            className="mt-0.5"
            disabled={!selectable || writesBlocked}
            onCheckedChange={onToggleSelect}
            onClick={(event) => event.stopPropagation()}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <RowHeadline row={row} brandId={brandId} currency={currency} />
            {row.approved ? (
              <Badge variant="secondary" className="text-3xs uppercase">
                Approved
              </Badge>
            ) : null}
            {approving ? (
              <span className="inline-flex items-center gap-1 text-3xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" /> approving
              </span>
            ) : null}
            {failed ? (
              <Badge variant="destructive" className="text-3xs uppercase">
                Failed
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <AdSetIdLabel id={row.adsetId} />
            {row.route !== 'budget' && row.rec.severity ? (
              <Badge
                variant={severityBadgeVariant(row.rec.severity)}
                className="text-3xs uppercase"
              >
                {row.rec.severity}
              </Badge>
            ) : null}
            {counterparty ? (
              <CounterpartyLine currency={currency} entry={counterparty} limit={1} />
            ) : null}
          </div>
        </div>

        <button
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide detail' : 'Show detail'}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted/50"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand();
          }}
          type="button"
        >
          {expanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </button>
      </div>

      {expanded ? <RowDetail row={row} currency={currency} counterparty={counterparty} /> : null}
    </li>
  );
}

function RowHeadline({
  row,
  brandId,
  currency,
}: {
  row: QueueRow;
  brandId: string;
  currency: string | null;
}) {
  if (row.route === 'budget') {
    const changePct = row.item.change_pct != null ? row.item.change_pct * 100 : null;
    return (
      <span className="text-sm font-semibold tracking-tight">
        {row.name ?? 'Budget move'}{' '}
        <span className="font-normal text-muted-foreground">
          {formatCurrency(row.item.current_budget ?? 0, currency)} →{' '}
          {formatCurrency(row.item.final_budget ?? 0, currency)}
          {changePct != null ? ` (${changePct > 0 ? '+' : ''}${changePct.toFixed(0)}%)` : ''}
        </span>
      </span>
    );
  }
  if (row.route === 'hidden') {
    const { label, glyph } = recommendationLabel(row.rec.kind);
    return (
      <span className="text-sm font-semibold tracking-tight text-muted-foreground">
        {glyph} {label}
      </span>
    );
  }
  return (
    <span className="text-sm font-semibold tracking-tight">
      <RecommendationInsight
        adsetId={row.adsetId}
        brandId={brandId}
        id={row.rec.id}
        kind={row.rec.kind}
        reason={row.rec.reason ?? ''}
        severity={row.rec.severity}
        trigger={row.rec.trigger}
      />
    </span>
  );
}

function RowDetail({
  row,
  currency,
  counterparty,
}: {
  row: QueueRow;
  currency: string | null;
  counterparty?: { direction: 'funds' | 'fundedBy'; parties: Counterparty[] } | null;
}) {
  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-2xs text-muted-foreground">
      {row.route === 'budget' ? (
        <BudgetDetail item={row.item} currency={currency} counterparty={counterparty} />
      ) : row.route === 'hidden' ? (
        <p>{notImplementedMessage(row.rec.kind)}</p>
      ) : row.route === 'creative' ? (
        <CreativeBriefDetail rec={row.rec} />
      ) : (
        <RecDetail rec={row.rec} />
      )}
    </div>
  );
}

/** The creative request as a person reads it: what to make, what to keep, and the measured
 *  combinations it is grounded on. Rendered from the recommendation's seed by the shared
 *  builder — the same brief the request email and the swap worker receive. Falls back to the
 *  plain reason for an older rec that carries no seed. */
function CreativeBriefDetail({ rec }: { rec: RecommendationRow }) {
  const brief = creativeBriefForRec(rec);
  if (!brief) return <RecDetail rec={rec} />;
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-foreground">{brief.title}</p>
      <p className="leading-relaxed">{brief.brief}</p>
      {brief.groundedOn.length > 0 ? (
        <p>
          <span className="font-medium text-foreground">Grounded on:</span>{' '}
          {brief.groundedOn.join(' · ')}
        </p>
      ) : null}
      {rec.ad_id ? (
        <p>
          <span className="font-medium text-foreground">Winning ad:</span>{' '}
          <code className="text-3xs">{rec.ad_id}</code>
        </p>
      ) : null}
    </div>
  );
}

/** The three scoring windows behind a move, as "3d 1.20 / 7d 1.15 / 14d 1.31". Read straight
 *  off the persisted diagnostics — these are the NUMBERS, not the sentence. */
function scoreWindows(item: CycleItemRow): string | null {
  const diag = item.diagnostics ?? null;
  const parts = (
    [
      ['3d', diag?.score3d],
      ['7d', diag?.score7d],
      ['14d', diag?.score14d],
    ] as const
  )
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([label, value]) => `${label} ${(value as number).toFixed(2)}`);
  return parts.length > 0 ? parts.join(' / ') : null;
}

/** A budget move said as a sentence, then the numbers behind it.
 *
 *  The sentence is the one the ENGINE wrote at cycle time and persisted to
 *  optimizer.cycle_items.reason — the same string the apply copies into
 *  apply_audits.justification, so the queue and the money ledger cannot tell two different
 *  stories about one move. Absent on rows scored before the engine persisted it; the row
 *  then shows its numbers and no "Why", rather than a second explanation computed here. */
function BudgetDetail({
  item,
  currency,
  counterparty,
}: {
  item: CycleItemRow;
  currency: string | null;
  counterparty?: { direction: 'funds' | 'fundedBy'; parties: Counterparty[] } | null;
}) {
  const windowText = scoreWindows(item);
  const ci = item.diagnostics?.ci ?? null;
  const cpa = typeof ci?.cpa === 'number' && Number.isFinite(ci.cpa) ? ci.cpa : null;

  return (
    <>
      {item.reason ? (
        <p>
          <span className="font-medium text-foreground">Why:</span> {item.reason}
        </p>
      ) : null}
      <p>
        <span className="font-medium text-foreground">Before → after:</span>{' '}
        {formatCurrency(item.current_budget ?? 0, currency)} →{' '}
        {formatCurrency(item.final_budget ?? 0, currency)}
      </p>
      {windowText ? (
        <p>
          <span className="font-medium text-foreground">Score:</span> {windowText}
        </p>
      ) : null}
      {cpa != null ? (
        <p>
          <span className="font-medium text-foreground">Cost:</span>{' '}
          {formatCurrency(cpa, currency)}
          {typeof ci?.lo === 'number' && typeof ci?.hi === 'number'
            ? ` (likely ${formatCurrency(ci.lo, currency)}–${formatCurrency(ci.hi, currency)})`
            : ''}
          {typeof ci?.events === 'number' ? ` from ${ci.events} events` : ''}
        </p>
      ) : null}
      {counterparty ? (
        <p>
          <CounterpartyLine currency={currency} entry={counterparty} limit={2} />
        </p>
      ) : null}
    </>
  );
}

function RecDetail({ rec }: { rec: RecommendationRow }) {
  return (
    <>
      {rec.reason ? (
        <p>
          <span className="font-medium text-foreground">Why:</span> {rec.reason}
        </p>
      ) : null}
      <p>
        <Badge variant="outline" className="text-3xs">
          {rec.trigger}
        </Badge>
      </p>
    </>
  );
}

/** The read-only danger affordance on an ad-LEVEL row: found, but the app cannot execute it
 *  yet, so it is never a button — just a focusable icon whose tooltip says so on hover/focus.
 *  Replaces the standing AdLevelPreviewNotice banner. */
function AdLevelDangerIcon() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label="Ad-level execution is in progress — not yet surfaced here"
              className="mt-0.5 inline-flex text-amber-600 dark:text-amber-500"
              role="img"
            >
              <TriangleAlertIcon aria-hidden="true" className="size-4" />
            </span>
          }
        />
        <TooltipContent className="max-w-xs">
          Ad-level execution is in progress — not yet surfaced here.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
