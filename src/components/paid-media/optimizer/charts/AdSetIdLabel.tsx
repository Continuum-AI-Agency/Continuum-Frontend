'use client';

// The dense ad-set label — the single name chokepoint for every optimizer table
// and chart (kpiColumns, ReallocationFlow, PortfolioPreview, CpaConfidenceBar).
// Name-first: when a human ad-set name is known it reads in normal text; absent a
// name it falls back to the mono raw id (the debug-looking but honest default).
//
// The raw id (and campaign, when supplied) is exposed through a shadcn Tooltip so
// the surface never has to carry the id inline. A native `title` is kept as the
// clipped-text hover for the truncated case and for callers that read it — a belt
// the tooltip's suspenders don't remove.

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// This leaf is dropped into tables and charts all over the surface, including
// contexts that do not sit under a TooltipProvider (isolated tests, ad-hoc
// panels). It self-provides so it can never throw "Tooltip must be used within
// TooltipProvider" on a caller that forgot one — nesting a provider is harmless.
export function AdSetIdLabel({
  id,
  name,
  campaignName,
  className,
}: {
  id: string;
  name?: string;
  campaignName?: string;
  className?: string;
}) {
  const hasName = Boolean(name);
  const surface = hasName ? name : id;
  const title = hasName ? `${name} · ${id}` : id;
  const detail = campaignName ? `${campaignName} · ${id}` : id;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            title={title}
            className={cn(
              'block w-40 shrink-0 truncate text-2xs text-muted-foreground',
              !hasName && 'font-mono',
              className,
            )}
          >
            {surface}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <span className="font-mono text-2xs">{detail}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
