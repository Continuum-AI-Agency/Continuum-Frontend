'use client';

// H11 Organic week, the tile: posts this week (published + scheduled), how they spread over the
// seven days, and how many drafts wait for approval. Approving happens in the expanded module. The
// Backend's organic week adds the week's top post by reach; without it the tile is as above.
import { useLocale, useTranslations } from 'next-intl';
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/home/format';
import { cn } from '@/lib/utils';
import { HomeDots } from '../../HomeDots';
import { useHomeDraft } from '../../HomePresentationContext';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import { organicDotItems } from '../../homeDotItems';
import type { HomeTileProps } from '../../types';
import { type OrganicWeek, organicTileView } from './organicWeekModel';
import { topPostLine } from './organicWeekRead';
import { useOrganicWeek } from './useOrganicWeek';
import { useOrganicWeekRead } from './useOrganicWeekRead';

const Module = lazy(() => import('./Module'));

function WeekBars({ week }: { week: OrganicWeek }) {
  const uiText = useTranslations('dashboard');
  const counts = week.days.map(
    (day) => day.published.length + day.scheduled.length + day.waiting.length,
  );
  const max = Math.max(1, ...counts);
  return (
    <ol aria-label={uiText('posts_per_day_b47a04a')} className="grid grid-cols-7 items-end gap-1">
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

function WeekDots({ week }: { week: OrganicWeek }) {
  const uiText = useTranslations('dashboard');
  const items = organicDotItems(week, uiText);
  return (
    <HomeDots
      limit={42}
      columns={week.days.map((day) => day.dateLabel)}
      items={items}
      label={uiText('posts_by_day_each_dot_is_a_published_post_sch_8fd15ce')}
    />
  );
}

export default function OrganicTile({ ctx, tile }: HomeTileProps) {
  const uiText = useTranslations('dashboard');
  const uiLocale = useLocale();
  const postsLabel = (count: number) =>
    uiText('count_plural_one_post_this_week_other_posts_t_a36abb9', { count });
  const waitingLine = (waiting: number) =>
    waiting === 0
      ? uiText('nothing_waiting_for_approval_8cbe922')
      : uiText('count_plural_one_draft_needs_approval_other_d_5e30762', { count: waiting });
  const draft = useHomeDraft();
  const load = useOrganicWeek(ctx.brandId, ctx.organicAccounts);
  const read = useOrganicWeekRead(ctx.brandId, ctx.organicAccounts.length > 0);
  const topPost = read.data ? topPostLine(read.data) : null;
  const view = organicTileView({
    hasAccounts: ctx.organicAccounts.length > 0,
    loading: load.loading,
    failed: load.failed,
    week: load.week,
  });
  const week = view.state === 'ready' ? load.week : null;

  return (
    <HomeTileFrame
      badge={
        week
          ? `${formatCount(week.postsThisWeek, uiLocale)} ${postsLabel(week.postsThisWeek)}`
          : null
      }
      expanded={
        week ? <Module brandId={ctx.brandId} organicAccounts={ctx.organicAccounts} /> : undefined
      }
      expandedDescription={uiText('this_week_s_published_scheduled_and_waiting_p_7b0a64c')}
      state={view.state}
      tile={tile}
    >
      {view.state === 'missing' ? <TileMissing>{view.missing}</TileMissing> : null}
      {view.state === 'loading' ? (
        <div aria-hidden="true" className="h-16 w-full animate-pulse rounded-md bg-muted/60" />
      ) : null}
      {view.state === 'error' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">
            {uiText('couldn_t_read_this_week_s_posts_28c6fd9')}
          </p>
          <Button className="h-7 px-2 text-xs" onClick={load.retry} size="sm" variant="outline">
            {uiText('retry_942087c')}
          </Button>
        </div>
      ) : null}
      {week ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-semibold text-2xl tabular-nums leading-none tracking-tight">
            <span data-testid="home-tile-organic-headline" data-value={week.postsThisWeek}>
              {formatCount(week.postsThisWeek, uiLocale)}
            </span>{' '}
            <span className="font-normal text-muted-foreground text-xs">
              {draft
                ? uiText('published_or_scheduled_this_week_45acbda')
                : postsLabel(week.postsThisWeek)}
            </span>
          </p>
          {draft ? <WeekDots week={week} /> : tile.size === 's' ? null : <WeekBars week={week} />}
          <p className="text-muted-foreground text-xs" data-testid="home-tile-organic-waiting">
            {waitingLine(week.waiting)}
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
              {uiText('published_published_scheduled_scheduled_eb4e2a7', {
                published: formatCount(week.published, uiLocale),
                scheduled: formatCount(week.scheduled, uiLocale),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </HomeTileFrame>
  );
}
