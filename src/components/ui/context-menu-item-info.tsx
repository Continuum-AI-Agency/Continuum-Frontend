'use client';

import { InfoIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

interface ContextMenuItemInfoProps {
  description: string;
  className?: string;
}

export function ContextMenuItemInfo({ description, className }: ContextMenuItemInfoProps) {
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More information"
          tabIndex={-1}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className={cn(
            'ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className,
          )}
        >
          <InfoIcon className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" className="whitespace-nowrap py-1 text-xs">
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
