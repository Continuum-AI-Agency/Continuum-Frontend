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
  useOptimizerEnrolledAdsets,
  useOptimizerMutations,
  useOptimizerPerformance,
} from '../useOptimizerData';
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

  if (performanceQuery.isLoading) return <Skeleton className="h-28 rounded-lg" />;
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
        {visibleRows.map((row) => (
          <QueueRowView
            key={row.key}
            brandId={brandId}
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
                ? 'Pausing stops these ad sets from spending immediately. Every pause is logged and can be reverted (unpaused) from the activity log.'
                : 'This writes the approved daily budgets to Meta now. Every change is logged and can be reverted from the activity log.'}
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

function QueueRowView({
  row,
  brandId,
  currency,
  selected,
  approving,
  failed,
  expanded,
  writesBlocked,
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
            aria-label={`Select ${row.name ?? row.adsetId}`}
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
          <div className="mt-1 flex items-center gap-2">
            <AdSetIdLabel id={row.adsetId} />
            {row.route !== 'budget' && row.rec.severity ? (
              <Badge
                variant={severityBadgeVariant(row.rec.severity)}
                className="text-3xs uppercase"
              >
                {row.rec.severity}
              </Badge>
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

      {expanded ? <RowDetail row={row} currency={currency} /> : null}
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

function RowDetail({ row, currency }: { row: QueueRow; currency: string | null }) {
  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-2xs text-muted-foreground">
      {row.route === 'budget' ? (
        <BudgetDetail item={row.item} currency={currency} />
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

function BudgetDetail({ item, currency }: { item: CycleItemRow; currency: string | null }) {
  const diag = item.diagnostics ?? null;
  const ci = diag?.ci ?? null;
  return (
    <>
      <p>
        <span className="font-medium text-foreground">Before → after:</span>{' '}
        {formatCurrency(item.current_budget ?? 0, currency)} →{' '}
        {formatCurrency(item.final_budget ?? 0, currency)}
      </p>
      {diag?.score3d != null || diag?.score7d != null ? (
        <p>
          <span className="font-medium text-foreground">Score:</span>{' '}
          {diag?.score3d != null ? `3d ${diag.score3d.toFixed(2)}` : ''}
          {diag?.score3d != null && diag?.score7d != null ? ' · ' : ''}
          {diag?.score7d != null ? `7d ${diag.score7d.toFixed(2)}` : ''}
        </p>
      ) : null}
      {ci?.cpa != null ? (
        <p>
          <span className="font-medium text-foreground">Cost:</span>{' '}
          {formatCurrency(ci.cpa, currency)}
          {ci.lo != null && ci.hi != null
            ? ` (likely ${formatCurrency(ci.lo, currency)}–${formatCurrency(ci.hi, currency)})`
            : ''}
          {ci.events != null ? ` from ${ci.events} events` : ''}
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
        <TooltipTrigger asChild>
          <span
            aria-label="Ad-level execution is in progress — not yet surfaced here"
            className="mt-0.5 inline-flex text-amber-600 dark:text-amber-500"
            role="img"
          >
            <TriangleAlertIcon aria-hidden="true" className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          Ad-level execution is in progress — not yet surfaced here.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
