'use client';

// One semantic chip for every "state" the optimizer shows — pacing, target, delivery,
// health. Colour says the verdict, the label says it in words, and an optional hint
// says why on hover. Colour by STATE, never by magnitude, so a non-expert reads
// "Above target" the same way on every panel.

import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'border-success/30 bg-success/10 text-emerald-800 dark:text-emerald-300',
  warning: 'border-warning/30 bg-warning/10 text-amber-800 dark:text-amber-300',
  danger: 'border-destructive/30 bg-destructive/10 text-red-800 dark:text-red-300',
  info: 'border-secondary/30 bg-secondary/10 text-sky-800 dark:text-sky-300',
  muted: 'border-border/60 bg-muted/40 text-muted-foreground',
};

const DOT_CLASS: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-secondary',
  muted: 'bg-muted-foreground',
};

type StatusChipProps = {
  tone: StatusTone;
  children: React.ReactNode;
  /** Plain-language reason, shown as the native tooltip. */
  hint?: string;
  className?: string;
  size?: 'xs' | 'sm';
};

export function StatusChip({ tone, children, hint, className, size = 'xs' }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'xs' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
        TONE_CLASS[tone],
        className,
      )}
      title={hint}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', DOT_CLASS[tone])} />
      {children}
    </span>
  );
}
