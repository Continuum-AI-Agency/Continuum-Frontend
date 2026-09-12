'use client';

// One semantic chip for every "state" the optimizer shows — pacing, target, delivery,
// health — on the canonical kibo Pill. Colour says the verdict, the label says it in
// words, and an optional hint says why on hover. Colour by STATE, never by magnitude, so
// a non-expert reads "Above target" the same way on every panel.

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import type { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>['variant']>;

const PILL_VARIANT: Record<StatusTone, BadgeVariant> = {
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
  info: 'teal',
  muted: 'muted',
};

const INDICATOR: Record<StatusTone, 'success' | 'warning' | 'error' | 'info' | null> = {
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
  muted: null,
};

type StatusChipProps = {
  tone: StatusTone;
  children: React.ReactNode;
  /** Plain-language reason, shown as the native tooltip. */
  hint?: string;
  className?: string;
};

export function StatusChip({ tone, children, hint, className }: StatusChipProps) {
  const indicator = INDICATOR[tone];
  return (
    <Pill className={cn('gap-1.5 text-2xs', className)} title={hint} variant={PILL_VARIANT[tone]}>
      {indicator ? (
        <PillIndicator variant={indicator} />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground" />
      )}
      {children}
    </Pill>
  );
}
