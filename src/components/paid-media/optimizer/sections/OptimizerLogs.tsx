'use client';

// Logs sub-view — the durable, brand-scoped optimizer activity feed (cycles,
// applied/deduped budget writes, failures) teed from the service into
// optimizer.logs and read via optimizer-status ?view=logs. Compact, newest-first.

import type { OptimizerLogRow } from '@continuum/contracts';
import { ScrollTextIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useOptimizerLogs } from '../useOptimizerData';

type OptimizerLogsProps = { brandId: string };

const LEVEL_STYLES: Record<OptimizerLogRow['level'], string> = {
  info: 'border-border/70 bg-muted/40 text-muted-foreground',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
};

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

function summarizeFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([key]) => key !== 'portfolio' && key !== 'portfolioId')
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join('  ·  ');
}

function LogRow({ row }: { row: OptimizerLogRow }) {
  const fields = summarizeFields(row.fields ?? {});
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <span
        className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LEVEL_STYLES[row.level]}`}
      >
        {row.level}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="truncate text-sm font-medium tracking-tight">
            {humanizeEvent(row.event)}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(row.ts)}</span>
        </div>
        {row.portfolio_name ? (
          <span className="text-xs text-muted-foreground">{row.portfolio_name}</span>
        ) : null}
        {fields ? (
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{fields}</p>
        ) : null}
      </div>
    </li>
  );
}

export function OptimizerLogs({ brandId }: OptimizerLogsProps) {
  const logsQuery = useOptimizerLogs(brandId);

  if (logsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  const logs = logsQuery.data ?? [];
  if (logs.length === 0) {
    return (
      <div className="grid min-h-[16rem] place-items-center rounded-xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
        <div className="max-w-sm">
          <ScrollTextIcon className="mx-auto size-5 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-semibold tracking-tight">No optimizer activity yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Cycle results, budget changes, and any failures appear here after the optimizer runs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((row) => (
        <LogRow key={row.id} row={row} />
      ))}
    </ul>
  );
}
