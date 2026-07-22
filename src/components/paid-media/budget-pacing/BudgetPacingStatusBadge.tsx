'use client';

import { cn } from '@/lib/utils';

type PaceStatus = 'on_pace' | 'underspending' | 'overspending';

type Props = {
  status: PaceStatus;
  className?: string;
};

const statusConfig: Record<PaceStatus, { label: string; className: string }> = {
  on_pace: {
    label: 'On Pace',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  underspending: {
    label: 'Underspending',
    className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  overspending: {
    label: 'Overspending',
    className: 'bg-red-500/15 text-red-500 dark:text-red-400',
  },
};

export function BudgetPacingStatusBadge({ status, className }: Props) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
