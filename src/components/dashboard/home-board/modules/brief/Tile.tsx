'use client';

// H05 Jaina brief: the daily read the Optimizer's worker stored for the brand's ad accounts,
// shown as written (in the account's language) and always dated, so a read the worker stopped
// writing never looks like today's. No model runs here. The expanded module lists every
// account's read.
//
// Headline: the tile has no number. `data-value` is the ISO day of the newest stored read; the
// direct read is in briefModel.ts's header (the bench anchor).

import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { BRIEF_MISSING, briefView, staleLabel } from './briefModel';
import { useBriefReads } from './useBriefReads';

const Module = lazy(() => import('./Module'));

const CLAMP: Record<HomeTileProps['tile']['size'], string> = {
  s: 'line-clamp-3',
  m: 'line-clamp-4',
  l: 'line-clamp-6',
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default function BriefTile({ ctx, tile }: HomeTileProps) {
  const { reads, retry } = useBriefReads(ctx.brandId, ctx.adAccounts);
  const view = briefView(reads, new Date());

  if (view.state === 'loading') {
    return (
      <HomeTileFrame state="loading" tile={tile}>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-full" />
        </div>
      </HomeTileFrame>
    );
  }
  if (view.state === 'missing') {
    return (
      <HomeTileFrame state="missing" tile={tile}>
        <TileMissing>{BRIEF_MISSING}</TileMissing>
      </HomeTileFrame>
    );
  }
  if (view.state === 'error') {
    return (
      <HomeTileFrame state="error" tile={tile}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">Jaina’s daily read could not be loaded.</p>
          <Button onClick={retry} size="sm" type="button" variant="outline">
            Retry
          </Button>
        </div>
      </HomeTileFrame>
    );
  }

  const [lead] = view.entries;
  if (!lead) return null;
  const age = staleLabel(lead);
  const others = view.entries.length - 1;

  return (
    <HomeTileFrame
      badge={plural(view.entries.length, 'stored read', 'stored reads')}
      expanded={<Module entries={view.entries} failed={view.failed} />}
      expandedDescription="The daily read Jaina stored for each ad account, as written."
      state="ready"
      tile={tile}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <p
          className="flex flex-wrap items-center gap-x-1.5 font-medium text-xs"
          data-testid="home-tile-brief-headline"
          data-value={view.headline.day}
        >
          <time dateTime={view.headline.day}>{view.headline.label}</time>
          {age ? <span className="text-warning">· {age}</span> : null}
          {view.entries.length > 1 ? (
            <span className="truncate text-muted-foreground">· {lead.accountName}</span>
          ) : null}
        </p>
        <p className={cn('break-words text-sm leading-snug', CLAMP[tile.size])}>{lead.narrative}</p>
        {others > 0 ? (
          <p className="text-muted-foreground text-xs">
            +{plural(others, 'more account', 'more accounts')} in the brief
          </p>
        ) : null}
        {view.failed > 0 ? (
          <p className="text-muted-foreground text-xs">
            {plural(view.failed, 'account’s read', 'accounts’ reads')} could not be loaded.
          </p>
        ) : null}
      </div>
    </HomeTileFrame>
  );
}
