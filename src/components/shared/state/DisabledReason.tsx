'use client';
import { useTranslations } from 'next-intl';

// Wraps a disabled control and explains WHY it is disabled plus what unlocks it
// (base for BUG-013/014/015). Disabled controls do not fire hover/focus events,
// so the wrapper span is the tooltip trigger and stays focusable. The reason is
// always exposed to assistive tech via aria-describedby — not only on hover.

import { type ReactNode, useId } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type DisabledReasonProps = {
  reason: string;
  children: ReactNode;
  unlocks?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
};

export function DisabledReason({
  reason,
  children,
  unlocks,
  side = 'top',
  className,
}: DisabledReasonProps) {
  const tUi = useTranslations('common');

  const descriptionId = useId();

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a disabled control is removed from the tab order and cannot receive focus/hover, so this wrapper must be focusable for keyboard users to reach the tooltip and discover why the control is disabled.
              tabIndex={0}
              aria-describedby={descriptionId}
              className={cn('inline-flex cursor-help', className)}
            >
              {children}
            </span>
          }
        />
        <TooltipContent side={side} className="max-w-xs">
          <p className="text-sm">{reason}</p>
          {unlocks !== undefined ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {tUi('m_896b841f3b')}
              {unlocks}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {unlocks !== undefined
          ? tUi('m_6c1017523d', { v0: String(reason), v1: String(unlocks) })
          : reason}
      </span>
    </TooltipProvider>
  );
}
