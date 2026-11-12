'use client';
import {
  useTranslations as useBetaTranslations,
  useTranslations as useExtraTranslations,
  useLocale as useHomeLocale,
  useLocale as useNumberLocale,
} from 'next-intl';

// H11 Organic week, the tile: posts this week (published + scheduled), how they spread over the
// seven days, and how many drafts wait for approval. Approving happens in the expanded module. The
// Backend's organic week adds the week's top post by reach; without it the tile is as above.
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/home/format';
import { cn } from '@/lib/utils';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { type OrganicWeek, organicTileView } from './organicWeekModel';
import { topPostLine } from './organicWeekRead';
import { useOrganicWeek } from './useOrganicWeek';
import { useOrganicWeekRead } from './useOrganicWeekRead';

const Module = lazy(() => import('./Module'));

function waitingLine(waiting: number): string {
  if (waiting === 0) return 'Nothing waiting for approval';
  return `${waiting} ${waiting === 1 ? 'draft needs' : 'drafts need'} approval`;
}

function postsLabel(count: number): string {
  return count === 1 ? 'post this week' : 'posts this week';
}

function WeekBars({ week }: { week: OrganicWeek }) {
  const betaUiText = useBetaTranslations('organic');
  const homeLocale = useHomeLocale();

  const counts = week.days.map(
    (day) => day.published.length + day.scheduled.length + day.waiting.length,
  );
  const max = Math.max(1, ...counts);
  return (
    <ol aria-label={betaUiText('beta_b47a04a9622a')} className="grid grid-cols-7 items-end gap-1">
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
  const extraUiText = useExtraTranslations('dashboard');

  const numberLocale = useNumberLocale();

  const betaUiText = useBetaTranslations('organic');
  const homeLocale = useHomeLocale();

  const load = useOrganicWeek(ctx.brandId, ctx.organicAccounts);
  const read = useOrganicWeekRead(ctx.brandId, ctx.organicAccounts.length > 0);
  const topPost = read.data ? topPostLine(read.data, betaUiText, homeLocale) : null;
  const view = organicTileView(
    {
      hasAccounts: ctx.organicAccounts.length > 0,
      loading: load.loading,
      failed: load.failed,
      week: load.week,
    },
    betaUiText,
  );
  const week = view.state === 'ready' ? load.week : null;

  return (
    <HomeTileFrame
      badge={
        week
          ? `${formatCount(week.postsThisWeek, numberLocale)} ${betaUiText('homePosts', { count: week.postsThisWeek })}`
          : null
      }
      expanded={
        week ? <Module brandId={ctx.brandId} organicAccounts={ctx.organicAccounts} /> : undefined
      }
      expandedDescription={extraUiText('home_7b0a64c1d707')}
      state={view.state}
      tile={tile}
    >
      {view.state === 'missing' ? <TileMissing>{view.missing}</TileMissing> : null}
      {view.state === 'loading' ? (
        <div aria-hidden="true" className="h-16 w-full animate-pulse rounded-md bg-muted/60" />
      ) : null}
      {view.state === 'error' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">{betaUiText('beta_28c6fd9b30ed')}</p>
          <Button className="h-7 px-2 text-xs" onClick={load.retry} size="sm" variant="outline">
            {betaUiText('beta_942087cc2d41')}
          </Button>
        </div>
      ) : null}
      {week ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-semibold text-2xl tabular-nums leading-none tracking-tight">
            <span data-testid="home-tile-organic-headline" data-value={week.postsThisWeek}>
              {formatCount(week.postsThisWeek, numberLocale)}
            </span>{' '}
            <span className="font-normal text-muted-foreground text-xs">
              {betaUiText('homePosts', { count: week.postsThisWeek })}
            </span>
          </p>
          {tile.size === 's' ? null : <WeekBars week={week} />}
          <p className="text-muted-foreground text-xs" data-testid="home-tile-organic-waiting">
            {betaUiText('homeWaiting', { count: week.waiting })}
          </p>
          {topPost ? (
            <p
              className="font-medium text-xs tabular-nums"
              data-reach={read.data?.topPost?.reach}
              data-testid="home-tile-organic-top-post"
            >
              {topPost}
            </p>
          ) : null}
          {tile.size === 'l' ? (
            <p className="text-2xs text-muted-foreground tabular-nums">
              {formatCount(week.published, numberLocale)} {betaUiText('beta_7116a8bdbeb1')}{' '}
              {formatCount(week.scheduled, numberLocale)} {betaUiText('beta_6aef76c6cb35')}
            </p>
          ) : null}
        </div>
      ) : null}
    </HomeTileFrame>
  );
}
