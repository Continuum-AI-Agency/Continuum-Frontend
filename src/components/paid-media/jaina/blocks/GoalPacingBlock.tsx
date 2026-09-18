'use client';

// Budget against time: two bars on one scale — how much of the period has elapsed and how
// much of the budget is spent — with the projected end. Pacing is a temporal fact, and a
// number in a card cannot show that the money is ahead of the calendar; two bars can.

import { formatValue } from '@/lib/jaina/formatValue';
import type { GoalPacingBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';

type GoalPacingBlockProps = { block: GoalPacingBlockV2; isStreaming: boolean };

const STATUS_META: Record<GoalPacingBlockV2['status'], { label: string; className: string }> = {
  on_track: { label: 'On track', className: 'text-emerald-600 dark:text-emerald-400' },
  underpacing: { label: 'Behind plan', className: 'text-amber-600 dark:text-amber-400' },
  overpacing: { label: 'Ahead of plan', className: 'text-red-600 dark:text-red-400' },
};

export default function GoalPacingBlock({ block }: GoalPacingBlockProps) {
  const money = (value: number) =>
    block.currency_code
      ? formatValue(value, 'currency', { currency: block.currency_code })
      : formatValue(value, 'number');
  const spentPct = block.budget > 0 ? Math.min(1, block.spent / block.budget) : 0;
  const meta = STATUS_META[block.status];
  return (
    <div data-testid="goal-pacing-block">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold text-foreground text-sm">{block.title}</h4>
        <span className={cn('font-medium text-xs', meta.className)}>
          {meta.label} · {Math.round(block.pace_ratio * 100)}% of plan
        </span>
      </div>
      <div className="space-y-1.5 text-xs">
        <Bar
          label="Time elapsed"
          pct={block.elapsed_pct}
          value={`${Math.round(block.elapsed_pct * 100)}%`}
        />
        <Bar
          label="Budget spent"
          pct={spentPct}
          value={`${money(block.spent)} of ${money(block.budget)}`}
          tone={block.status}
        />
      </div>
      <p className="mt-1.5 text-muted-foreground text-xs">
        {block.period_start} → {block.period_end}
        {block.projected_end != null
          ? ` · projected at period end: ${money(block.projected_end)}`
          : ''}
      </p>
    </div>
  );
}

function Bar({
  label,
  pct,
  value,
  tone,
}: {
  label: string;
  pct: number;
  value: string;
  tone?: GoalPacingBlockV2['status'];
}) {
  const fill =
    tone === 'overpacing'
      ? 'bg-red-500/70'
      : tone === 'underpacing'
        ? 'bg-amber-500/70'
        : 'bg-primary/70';
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/50">
        <span
          className={cn('absolute inset-y-0 left-0 rounded-sm', fill)}
          style={{ width: `${Math.max(1, pct * 100)}%` }}
        />
      </span>
      <span className="w-40 shrink-0 text-right text-foreground tabular-nums">{value}</span>
    </div>
  );
}
