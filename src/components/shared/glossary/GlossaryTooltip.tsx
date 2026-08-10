'use client';

// Wraps an advanced term in a tooltip carrying its plain-English definition
// (IMP-018). Defaults its visible label to the canonical term name and marks the
// word with a dotted underline so users know a definition is available. The
// definition is exposed to assistive tech via aria-describedby — not hover-only —
// so keyboard and screen-reader users get the same explanation.

import { type ReactNode, useId } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GLOSSARY_TERMS, type GlossaryTermKey } from './terms';

type GlossaryTooltipProps = {
  termKey: GlossaryTermKey;
  children?: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
};

export function GlossaryTooltip({
  termKey,
  children,
  side = 'top',
  className,
}: GlossaryTooltipProps) {
  const entry = GLOSSARY_TERMS[termKey];
  const descriptionId = useId();

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a glossary term is inline text, not a native control, so the wrapper must be focusable for keyboard users to reach the tooltip and read the definition.
              tabIndex={0}
              aria-describedby={descriptionId}
              className={cn(
                'cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-2',
                className,
              )}
            >
              {children ?? entry.term}
            </span>
          }
        />
        <TooltipContent side={side} className="max-w-xs">
          <p className="text-sm font-medium">{entry.term}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{entry.short}</p>
        </TooltipContent>
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {`${entry.term}: ${entry.short}`}
      </span>
    </TooltipProvider>
  );
}
