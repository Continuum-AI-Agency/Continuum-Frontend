// A status always carries its words: the tone colours the chip, the text says what it means,
// so nothing is read from colour alone (docs/05).

import type { ReactNode } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { cn } from '@/lib/utils';
import type { ChipTone } from '../dashboardModel';

const TONE_CLASS: Record<ChipTone, string> = {
  good: 'border-success/30 bg-success/10 text-success',
  warn: 'border-warning/30 bg-warning/10 text-warning',
  bad: 'border-destructive/30 bg-destructive/10 text-destructive',
  neutral: 'border-border bg-muted text-muted-foreground',
};

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Pill
      className={cn('border tabular-nums', TONE_CLASS[tone], className)}
      data-tone={tone}
      variant="outline"
    >
      {children}
    </Pill>
  );
}
