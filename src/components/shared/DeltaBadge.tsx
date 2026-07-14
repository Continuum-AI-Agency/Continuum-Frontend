import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Period-over-period delta. Emerald up / red down, monospace tabular so columns
// of deltas align. Shared across every dashboard, panel, and metric strip. Pass
// isPercent={false} for absolute deltas (no trailing %).
export function DeltaBadge({
  value,
  isPercent = true,
  className,
}: {
  value: number;
  isPercent?: boolean;
  className?: string;
}) {
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const magnitude = Math.abs(Math.round(value));
  const ariaLabel =
    direction === 'up'
      ? `Up ${magnitude}${isPercent ? '%' : ''}`
      : direction === 'down'
        ? `Down ${magnitude}${isPercent ? '%' : ''}`
        : 'No change';

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-end gap-0.5 font-mono text-xs tabular-nums',
        direction === 'up' && 'text-success',
        direction === 'down' && 'text-destructive',
        direction === 'neutral' && 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3" />
      {magnitude}
      {isPercent ? '%' : ''}
    </span>
  );
}
