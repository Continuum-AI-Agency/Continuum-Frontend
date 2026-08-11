'use client';

// Logs sub-view — the durable, brand-scoped optimizer activity feed. The stream
// unions three event families teed from the service: money writes (apply_executed,
// with prior/target + the Meta receipt), portfolio config audits (setting_changed,
// with setting/from/to/by), and cycle results. A family filter + a portfolio filter
// (both client-side over the loaded window) let an operator isolate one trail, and
// money/setting rows render their real fields — the budget move and the copyable
// fbtrace receipt — rather than a flat key:value summary. Compact, newest-first.

import type { OptimizerLogRow } from '@continuum/contracts';
import { ArrowRightIcon, CheckIcon, CopyIcon, ScrollTextIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/state/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useOptimizerLogs } from '../useOptimizerData';
import {
  ALL_PORTFOLIOS,
  classifyEvent,
  distinctPortfolioNames,
  type FamilyCounts,
  familyCounts,
  filterLogs,
  type LogFilter,
  type MoneyMove,
  readMoneyMove,
  readSettingChange,
  type SettingChange,
} from './logFilters';
import { OptimizerReadError } from './OptimizerReadError';
import { RevertApplyDialog } from './RevertApplyDialog';

type OptimizerLogsProps = { brandId: string };

const LEVEL_STYLES: Record<OptimizerLogRow['level'], string> = {
  info: 'border-border/70 bg-muted/40 text-muted-foreground',
  warn: 'border-warning/40 bg-warning/10 text-warning',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
};

const FILTERS: { value: LogFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'money', label: 'Money' },
  { value: 'settings', label: 'Settings' },
  { value: 'cycles', label: 'Cycles' },
];

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'];

function humanizeEvent(event: string): string {
  const spaced = event.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatWhen(ts: string): string {
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return ts;
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return Array.isArray(value) ? `[${value.length}]` : '{…}';
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function formatAmount(value: number | null): string {
  return value == null ? '—' : value.toLocaleString('en-US');
}

function summarizeFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([key]) => key !== 'portfolio' && key !== 'portfolioId')
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join('  ·  ');
}

function LevelBadge({ level }: { level: OptimizerLogRow['level'] }) {
  return (
    <span
      className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide ${LEVEL_STYLES[level]}`}
    >
      {level}
    </span>
  );
}

function RowHeader({ title, ts }: { title: string; ts: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <span className="truncate text-sm font-medium tracking-tight">{title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(ts)}</span>
    </div>
  );
}

/** The Meta trace id, one-click copyable — the money-row receipt an operator pastes
 *  into a Graph API support ticket. Clipboard access is optional-chained so a render
 *  environment without it (or a denied permission) never throws. */
function ReceiptToken({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value)?.catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy Meta trace id ${value}`}
      className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-muted-foreground transition-colors hover:bg-muted"
    >
      {copied ? (
        <CheckIcon aria-hidden="true" className="size-3 shrink-0 text-success" />
      ) : (
        <CopyIcon aria-hidden="true" className="size-3 shrink-0" />
      )}
      <span className="truncate">{value}</span>
    </button>
  );
}

function ActorBadge({ kind }: { kind: string }) {
  return (
    <span className="shrink-0 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
      {kind}
    </span>
  );
}

/** The immutable audit-row id the service stamps into an apply_executed log — the stable
 *  handle a one-click revert needs. Absent on rows written before the service logged it
 *  (and on convert_* money rows), in which case no Revert action is offered. */
function readAuditId(fields: Record<string, unknown>): string | null {
  const value = fields.auditId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The write's scope, when the service stamped it into the log fields. Drives the revert
 *  dialog's copy: 'adset_status' reads as "Unpause", everything else as "Revert budget".
 *  Absent on budget rows written before the field was added → the dialog defaults to budget. */
function readScope(fields: Record<string, unknown>): string | null {
  const value = fields.scope;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function MoneyLogRow({
  row,
  move,
  brandId,
}: {
  row: OptimizerLogRow;
  move: MoneyMove;
  brandId: string;
}) {
  const auditId = readAuditId(row.fields ?? {});
  const canRevert = auditId != null && row.portfolio_id != null;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <LevelBadge level={row.level} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <RowHeader title={humanizeEvent(row.event)} ts={row.ts} />
            {row.portfolio_name ? (
              <span className="text-xs text-muted-foreground">{row.portfolio_name}</span>
            ) : null}
          </div>
          {canRevert && auditId && row.portfolio_id ? (
            <RevertApplyDialog
              auditId={auditId}
              portfolioId={row.portfolio_id}
              brandId={brandId}
              scope={readScope(row.fields ?? {})}
            />
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {move.targetStatus != null ? (
            <>
              <span className="font-mono text-2xs text-muted-foreground">
                {move.priorStatus ?? '—'}
              </span>
              <ArrowRightIcon
                aria-hidden="true"
                className="size-3 shrink-0 text-muted-foreground"
              />
              <span className="font-mono text-2xs font-semibold">{move.targetStatus}</span>
            </>
          ) : (
            <>
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {formatAmount(move.prior)}
              </span>
              <ArrowRightIcon
                aria-hidden="true"
                className="size-3 shrink-0 text-muted-foreground"
              />
              <span className="font-mono text-2xs font-semibold tabular-nums">
                {formatAmount(move.target)}
              </span>
            </>
          )}
          {move.actorKind ? <ActorBadge kind={move.actorKind} /> : null}
        </div>
        {move.receipt ? <ReceiptToken value={move.receipt} /> : null}
      </div>
    </li>
  );
}

function SettingLogRow({ row, change }: { row: OptimizerLogRow; change: SettingChange }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <LevelBadge level={row.level} />
      <div className="min-w-0 flex-1">
        <RowHeader title={humanizeEvent(change.setting)} ts={row.ts} />
        {row.portfolio_name ? (
          <span className="text-xs text-muted-foreground">{row.portfolio_name}</span>
        ) : null}
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs">
          <span className="font-mono text-muted-foreground">{change.from ?? '—'}</span>
          <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
          <span className="font-mono font-semibold">{change.to ?? '—'}</span>
          {change.by ? <span className="text-muted-foreground">· {change.by}</span> : null}
        </p>
        {change.note ? (
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">{change.note}</p>
        ) : null}
      </div>
    </li>
  );
}

function GenericLogRow({ row }: { row: OptimizerLogRow }) {
  const fields = summarizeFields(row.fields ?? {});
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <LevelBadge level={row.level} />
      <div className="min-w-0 flex-1">
        <RowHeader title={humanizeEvent(row.event)} ts={row.ts} />
        {row.portfolio_name ? (
          <span className="text-xs text-muted-foreground">{row.portfolio_name}</span>
        ) : null}
        {fields ? (
          <p className="mt-0.5 truncate font-mono text-2xs text-muted-foreground">{fields}</p>
        ) : null}
      </div>
    </li>
  );
}

function LogRow({ row, brandId }: { row: OptimizerLogRow; brandId: string }) {
  const family = classifyEvent(row.event);
  if (family === 'money') {
    const move = readMoneyMove(row.fields ?? {});
    if (move) return <MoneyLogRow row={row} move={move} brandId={brandId} />;
  }
  if (family === 'settings') {
    const change = readSettingChange(row.fields ?? {});
    if (change) return <SettingLogRow row={row} change={change} />;
  }
  return <GenericLogRow row={row} />;
}

function FilterButton({
  value,
  label,
  count,
  active,
  onSelect,
}: {
  value: LogFilter;
  label: string;
  count: number;
  active: boolean;
  onSelect: (value: LogFilter) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border/70 bg-card text-muted-foreground hover:bg-muted/50',
      )}
    >
      {label}
      <span className="text-3xs tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function LogFilterBar({
  family,
  counts,
  onFamily,
  portfolioNames,
  portfolio,
  onPortfolio,
}: {
  family: LogFilter;
  counts: FamilyCounts;
  onFamily: (value: LogFilter) => void;
  portfolioNames: string[];
  portfolio: string;
  onPortfolio: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
        <legend className="sr-only">Filter by event type</legend>
        {FILTERS.map((option) => (
          <FilterButton
            key={option.value}
            value={option.value}
            label={option.label}
            count={counts[option.value]}
            active={family === option.value}
            onSelect={onFamily}
          />
        ))}
      </fieldset>
      {portfolioNames.length > 1 ? (
        <Select value={portfolio} onValueChange={onPortfolio}>
          <SelectTrigger className="h-7 w-44 text-xs" aria-label="Filter by portfolio">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PORTFOLIOS}>All portfolios</SelectItem>
            {portfolioNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

export function OptimizerLogs({ brandId }: OptimizerLogsProps) {
  const logsQuery = useOptimizerLogs(brandId);
  const [family, setFamily] = useState<LogFilter>('all');
  const [portfolio, setPortfolio] = useState<string>(ALL_PORTFOLIOS);

  if (logsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  // Before this branch existed, a failed read fell straight through to "No optimizer
  // activity yet" — the outage and the genuinely-quiet brand rendered identically.
  if (logsQuery.isError) {
    return (
      <OptimizerReadError
        error={logsQuery.error}
        onRetry={() => void logsQuery.refetch()}
        subject="the activity log"
      />
    );
  }

  const logs = logsQuery.data ?? [];
  if (logs.length === 0) {
    return (
      <EmptyState
        headline="No optimizer activity yet"
        media={<ScrollTextIcon aria-hidden="true" />}
        description="Cycle results, budget changes, and any failures appear here after the optimizer runs."
      />
    );
  }

  const portfolioNames = distinctPortfolioNames(logs);
  // A previously-chosen portfolio can vanish after a refetch; fall back to "all"
  // so the feed never silently renders empty against a stale selection.
  const effectivePortfolio = portfolioNames.includes(portfolio) ? portfolio : ALL_PORTFOLIOS;
  const counts = familyCounts(logs);
  const visible = filterLogs(logs, { family, portfolio: effectivePortfolio });

  return (
    <div className="space-y-3">
      <LogFilterBar
        family={family}
        counts={counts}
        onFamily={setFamily}
        portfolioNames={portfolioNames}
        portfolio={effectivePortfolio}
        onPortfolio={setPortfolio}
      />
      {visible.length === 0 ? (
        <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
          No matching activity in this window.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <LogRow key={row.id} row={row} brandId={brandId} />
          ))}
        </ul>
      )}
    </div>
  );
}
