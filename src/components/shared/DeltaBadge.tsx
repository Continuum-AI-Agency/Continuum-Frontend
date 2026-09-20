import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { JUDGEMENT_LABEL, judgeDelta } from '@/components/paid-media/jaina/reading';
import { cn } from '@/lib/utils';

// Period-over-period delta, monospace tabular so columns of deltas align. Shared across
// every dashboard, panel, and metric strip.
//
// THE ARROW SHOWS DIRECTION; THE COLOUR SHOWS JUDGEMENT, and they are not the same thing.
// This used to colour by sign alone — up green, down red — which is exactly backwards for
// every cost metric in the product: a cost per result that FELL rendered red. Pass
// `goodWhenDown` for a metric whose falling is the good outcome (cost per result, CPM,
// bounce rate). The default keeps the old behaviour, so no existing call site changes
// meaning by accident; the ones that were wrong are wrong until they opt in, and now they
// have something to opt into.
//
// Pass isPercent={false} for absolute deltas (no trailing %).
export function DeltaBadge({
  value,
  isPercent = true,
  goodWhenDown = false,
  className,
}: {
  value: number;
  isPercent?: boolean;
  goodWhenDown?: boolean;
  className?: string;
}) {
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  const judgement = judgeDelta({ change: value, goodWhenDown });
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const magnitude = Math.abs(Math.round(value));
  // A screen reader used to get "Up 12%" and no way to know whether that was welcome. The
  // colour carried the judgement and colour is exactly what it cannot see.
  const movement =
    direction === 'up'
      ? `Up ${magnitude}${isPercent ? '%' : ''}`
      : direction === 'down'
        ? `Down ${magnitude}${isPercent ? '%' : ''}`
        : 'No change';
  const ariaLabel =
    judgement === 'unjudged' ? movement : `${movement}, ${JUDGEMENT_LABEL[judgement]}`;

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-end gap-0.5 font-mono text-xs tabular-nums',
        judgement === 'positive' && 'text-success',
        judgement === 'risk' && 'text-destructive',
        judgement === 'watch' && 'text-warning',
        (judgement === 'neutral' || judgement === 'unjudged') && 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3" />
      {magnitude}
      {isPercent ? '%' : ''}
    </span>
  );
}
