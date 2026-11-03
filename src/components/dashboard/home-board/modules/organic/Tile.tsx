'use client';

// H11 Organic week, the tile: posts this week (published + scheduled), how they spread over the
// seven days, and how many drafts wait for approval. Approving happens in the expanded module.
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/home/format';
import { cn } from '@/lib/utils';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { type OrganicWeek, organicTileView } from './organicWeekModel';
import { useOrganicWeek } from './useOrganicWeek';

const Module = lazy(() => import('./Module'));

function waitingLine(waiting: number): string {
  if (waiting === 0) return 'Nothing waiting for approval';
  return `${waiting} ${waiting === 1 ? 'draft needs' : 'drafts need'} approval`;
}

function postsLabel(count: number): string {
  return count === 1 ? 'post this week' : 'posts this week';
}

function WeekBars({ week }: { week: OrganicWeek }) {
  const counts = week.days.map(
    (day) => day.published.length + day.scheduled.length + day.waiting.length,
  );
  const max = Math.max(1, ...counts);
  return (
    <ol aria-label="Posts per day" className="grid grid-cols-7 items-end gap-1">
      {week.days.map((day, index) => {
        const count = counts[index] ?? 0;
        return (
          <li className="flex min-w-0 flex-col items-center gap-1" key={day.dayId}>
            <span
              className={cn(
                'block w-full rounded-sm',
                count === 0 ? 'bg-muted' : 'bg-primary',
                day.isToday && 'ring-1 ring-foreground/40',
              )}
              data-day={day.dayId}
              data-count={count}
              style={{ height: `${6 + Math.round((count / max) * 20)}px` }}
            />
            <span
              className={cn(
                'text-2xs',
                day.isToday ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {day.label.slice(0, 1)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrganicTile({ ctx, tile }: HomeTileProps) {
  const load = useOrganicWeek(ctx.brandId, ctx.organicAccounts);
  const view = organicTileView({
    hasAccounts: ctx.organicAccounts.length > 0,
    loading: load.loading,
    failed: load.failed,
    week: load.week,
  });
  const week = view.state === 'ready' ? load.week : null;

  return (
    <HomeTileFrame
      badge={week ? `${formatCount(week.postsThisWeek)} ${postsLabel(week.postsThisWeek)}` : null}
      expanded={
        week ? <Module brandId={ctx.brandId} organicAccounts={ctx.organicAccounts} /> : undefined
      }
      expandedDescription="This week's published, scheduled and waiting posts."
      state={view.state}
      tile={tile}
    >
      {view.state === 'missing' ? <TileMissing>{view.missing}</TileMissing> : null}
      {view.state === 'loading' ? (
        <div aria-hidden="true" className="h-16 w-full animate-pulse rounded-md bg-muted/60" />
      ) : null}
      {view.state === 'error' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">Couldn't read this week's posts.</p>
          <Button className="h-7 px-2 text-xs" onClick={load.retry} size="sm" variant="outline">
            Retry
          </Button>
        </div>
      ) : null}
      {week ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-semibold text-2xl tabular-nums leading-none tracking-tight">
            <span data-testid="home-tile-organic-headline" data-value={week.postsThisWeek}>
              {formatCount(week.postsThisWeek)}
            </span>{' '}
            <span className="font-normal text-muted-foreground text-xs">
              {postsLabel(week.postsThisWeek)}
            </span>
          </p>
          {tile.size === 's' ? null : <WeekBars week={week} />}
          <p className="text-muted-foreground text-xs" data-testid="home-tile-organic-waiting">
            {waitingLine(week.waiting)}
          </p>
          {tile.size === 'l' ? (
            <p className="text-2xs text-muted-foreground tabular-nums">
              {formatCount(week.published)} published · {formatCount(week.scheduled)} scheduled
            </p>
          ) : null}
        </div>
      ) : null}
    </HomeTileFrame>
  );
}
