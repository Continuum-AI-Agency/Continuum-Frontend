'use client';

// "Why?" — every number the optimizer shows can open its own explanation. One trigger
// style, one panel style, so an expert can skip it and a non-expert can trust it.
// Content is plain language first, evidence second (the numbers, the window, the rule).

import { HelpCircleIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type ExplainPopoverProps = {
  /** What is being explained, e.g. "Cost per lead". */
  title: string;
  /** The explanation: a sentence or two, then evidence rows. */
  children: React.ReactNode;
  /** Trigger label; defaults to an icon-only "Why?" button. */
  label?: string;
  className?: string;
  align?: 'start' | 'center' | 'end';
};

export function ExplainPopover({
  title,
  children,
  label,
  className,
  align = 'start',
}: ExplainPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Why: ${title}`}
        className={cn(
          'inline-flex items-center gap-1 rounded text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        type="button"
      >
        <HelpCircleIcon aria-hidden className="size-3.5" />
        {label ? <span>{label}</span> : null}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 space-y-2 p-3 text-xs">
        <p className="font-semibold text-foreground">{title}</p>
        <div className="space-y-1.5 text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** A labelled evidence row inside an ExplainPopover. */
export function ExplainRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}
