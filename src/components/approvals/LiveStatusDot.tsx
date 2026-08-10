'use client';

import * as React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  isDryRun: boolean;
  isFetching?: boolean;
};

function LiveStatusDotImpl({ isDryRun, isFetching }: Props) {
  // emerald-500 / amber-500 in oklch, matched to the rest of the paid-media surface.
  const color = isDryRun ? 'oklch(76% 0.17 80)' : 'oklch(70% 0.17 162)';
  const label = isDryRun
    ? 'Simulation mode — approvals will not hit Meta.'
    : 'Live — approvals execute against Meta on approve.';

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center"
              role="status"
              aria-label={label}
            >
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-70 live-pulse"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ backgroundColor: color, opacity: isFetching ? 1 : 0.9 }}
                aria-hidden="true"
              />
            </span>
          }
        />
        <TooltipContent side="bottom" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const LiveStatusDot = React.memo(LiveStatusDotImpl);
