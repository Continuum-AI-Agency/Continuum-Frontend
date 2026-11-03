'use client';

// One action of the Overnight log: what changed, where, who did it, and what its own row proves
// about the outcome.

import { cn } from '@/lib/utils';
import type { ActionOutcome, OvernightRow } from './overnightModel';

const OUTCOME_TONE: Record<ActionOutcome['kind'], string> = {
  applied: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  sent: 'bg-muted text-muted-foreground',
  unconfirmed: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'bg-destructive/10 text-destructive-ink',
  recorded: 'bg-muted text-muted-foreground',
};

function timeOf(ts: string): string {
  const date = new Date(ts);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function OvernightRowItem({
  row,
  compact = false,
}: {
  row: OvernightRow;
  compact?: boolean;
}) {
  return (
    <li
      className="min-w-0 space-y-0.5"
      data-outcome={row.outcome.kind}
      data-testid="home-overnight-row"
    >
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="min-w-0 font-medium text-foreground">{row.change}</span>
        <span
          className={cn('rounded-full px-1.5 py-0.5 text-[0.7rem]', OUTCOME_TONE[row.outcome.kind])}
        >
          {row.outcome.label}
        </span>
      </p>
      <p className="truncate text-muted-foreground text-[0.7rem]">
        <time dateTime={row.ts}>{timeOf(row.ts)}</time> · {row.actor}
        {row.portfolioName ? ` · ${row.portfolioName}` : ''}
      </p>
      {!compact && row.why ? (
        <p className="text-muted-foreground text-xs leading-snug">{row.why}</p>
      ) : null}
    </li>
  );
}
