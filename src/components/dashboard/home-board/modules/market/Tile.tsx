'use client';

import Link from 'next/link';
// H12 Market radar, the tile: how many competitor moves the last seven days held, and the
// newest thing on the radar (a competitor move first, else the most recent, most confident
// trend). Competitor names are read in the expanded module only.
import { useLocale, useTranslations } from 'next-intl';
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/home/format';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import {
  groupMoves,
  marketTileView,
  moveSentence,
  movesInLastDays,
  orderTrends,
  shortDay,
} from './marketRadarModel';
import { useMarketRadar } from './useMarketRadar';

const Module = lazy(() => import('./Module'));

type Line = { key: string; text: string; meta: string };

export default function MarketTile({ ctx, tile }: HomeTileProps) {
  const uiText = useTranslations('dashboard');
  const uiLocale = useLocale();
  const movesLabel = (count: number) =>
    uiText('count_plural_one_competitor_move_in_7_days_ot_c6c2e61', {
      count,
    });
  const radar = useMarketRadar(ctx.brandId);
  const view = marketTileView(radar);
  const ready = view.state === 'ready';
  const headline = movesInLastDays(radar.moves, new Date());
  const lines: Line[] = ready
    ? [
        ...groupMoves(radar.moves).map((group) => ({
          key: group.key,
          text: moveSentence(group, null),
          meta: uiText('competitor_day_45da08c', { day: shortDay(group.day) }),
        })),
        ...orderTrends(radar.trends).map((trend) => ({
          key: trend.id,
          text: trend.title,
          meta: trend.day
            ? uiText('trend_day_2c5b27b', { day: shortDay(trend.day) })
            : uiText('trend_9e21771'),
        })),
      ].slice(0, tile.size === 'l' ? 3 : 1)
    : [];

  return (
    <HomeTileFrame
      badge={ready ? `${formatCount(headline, uiLocale)} ${movesLabel(headline)}` : null}
      expanded={ready ? <Module brandId={ctx.brandId} /> : undefined}
      expandedDescription={uiText('competitor_moves_first_then_trends_newest_fir_1f44d89')}
      state={view.state}
      tile={tile}
    >
      {view.state === 'missing' ? (
        <TileMissing>
          {view.missing}{' '}
          <Link className="underline underline-offset-2" href="/competitor-spy">
            {uiText('open_brand_spy_b553090')}
          </Link>
        </TileMissing>
      ) : null}
      {view.state === 'loading' ? (
        <div aria-hidden="true" className="h-16 w-full animate-pulse rounded-md bg-muted/60" />
      ) : null}
      {view.state === 'error' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">
            {uiText('couldn_t_read_the_market_radar_ffd6a44')}
          </p>
          <Button className="h-7 px-2 text-xs" onClick={radar.retry} size="sm" variant="outline">
            {uiText('retry_942087c')}
          </Button>
        </div>
      ) : null}
      {ready ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-semibold text-2xl tabular-nums leading-none tracking-tight">
            <span data-testid="home-tile-market-headline" data-value={headline}>
              {formatCount(headline, uiLocale)}
            </span>{' '}
            <span className="font-normal text-muted-foreground text-xs">
              {movesLabel(headline)}
            </span>
          </p>
          <ul className="flex min-w-0 flex-col gap-1.5">
            {lines.map((line) => (
              <li className="min-w-0" data-testid="home-tile-market-line" key={line.key}>
                <p className="line-clamp-2 text-xs leading-snug">{line.text}</p>
                <p className="text-2xs text-muted-foreground">{line.meta}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </HomeTileFrame>
  );
}
