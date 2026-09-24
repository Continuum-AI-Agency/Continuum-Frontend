'use client';

import type { TemplateSourceEvent } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import type { Ref } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { fetchTemplateEvents } from '@/lib/library/templateSources';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { FORGE_STALE_MS, forgeQueryKeys } from './queryKeys';

// What happened to this template on its way in, newest first: the parse, fonts found or still
// missing, each build stop and why. The checks say where it stands; this says how it got there.

const LEVEL_TONE: Record<TemplateSourceEvent['level'], string> = {
  info: 'text-muted-foreground',
  warn: 'text-warning',
  error: 'text-destructive',
};

export const templateEventsKey = (brandId: string, assetId: string) =>
  [...forgeQueryKeys.brand(brandId), 'template-events', assetId] as const;

export function TemplateActivity({
  brandId,
  assetId,
  open,
  onOpenChange,
  ref,
}: {
  brandId: string;
  assetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const { data: events, isError } = useQuery({
    queryKey: templateEventsKey(brandId, assetId),
    queryFn: () => fetchTemplateEvents(brandId, assetId),
    staleTime: FORGE_STALE_MS.active,
  });
  const latest = events?.[0];

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="text-xs">
      <CollapsibleTrigger
        ref={ref}
        className="flex w-full items-center justify-between gap-2 px-[var(--card-pad)] py-2 text-left hover:bg-muted/30"
      >
        <span className="font-mono text-2xs uppercase tracking-wide text-muted-foreground">
          Activity
        </span>
        <span
          className={cn('truncate', latest ? LEVEL_TONE[latest.level] : 'text-muted-foreground')}
        >
          {isError ? "Couldn't load" : latest ? latest.message : events ? 'Nothing yet' : '…'}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol
          className="flex flex-col gap-1 px-[var(--card-pad)] pb-3"
          aria-label="Template activity"
        >
          {(events ?? []).map((event) => (
            <li key={event.id} className="grid grid-cols-[5.5rem_4rem_minmax(0,1fr)] gap-2">
              <time dateTime={event.at} className="font-mono tabular-nums text-muted-foreground">
                {formatRelativeTime(event.at)}
              </time>
              <span className="font-mono uppercase text-muted-foreground">{event.stage}</span>
              <span className={LEVEL_TONE[event.level]}>{event.message}</span>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
