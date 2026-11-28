'use client';

// Small custom indicators shared across the optimizer viz — the momentum arrow
// (trajectoryState) and the ad-set status dot. Kept tiny and token-driven so they
// read consistently wherever a metric or a chart hover row needs a directional or
// categorical cue, instead of each call site re-picking an icon and a color.

import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusColor, trajectoryColor } from './vizTokens';

export function TrajectoryIndicator({
  state,
  className,
}: {
  state: string | null | undefined;
  className?: string;
}) {
  const normalized = (state ?? 'neutral').toLowerCase();
  const Icon =
    normalized === 'positive'
      ? TrendingUpIcon
      : normalized === 'negative'
        ? TrendingDownIcon
        : MinusIcon;
  return (
    <Icon
      aria-hidden="true"
      className={cn('size-3.5 shrink-0', className)}
      style={{ color: trajectoryColor(normalized) }}
    />
  );
}

export function StatusDot({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: statusColor(status) }}
    />
  );
}
