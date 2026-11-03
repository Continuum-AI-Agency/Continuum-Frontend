'use client';

// H12 Market radar, the tile: how many competitor moves the last seven days held, and the
// newest thing on the radar (a competitor move first, else the most recent, most confident
// trend). Competitor names are read in the expanded module only.
import Link from 'next/link';
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

function movesLabel(count: number): string {
  return count === 1 ? 'competitor move in 7 days' : 'competitor moves in 7 days';
}

export default function MarketTile({ ctx, tile }: HomeTileProps) {
  const radar = useMarketRadar(ctx.brandId);
  const view = marketTileView(radar);
  const ready = view.state === 'ready';
  const headline = movesInLastDays(radar.moves, new Date());
  const lines: Line[] = ready
    ? [
        ...groupMoves(radar.moves).map((group) => ({
          key: group.key,
          text: moveSentence(group, null),
          meta: `Competitor · ${shortDay(group.day)}`,
        })),
        ...orderTrends(radar.trends).map((trend) => ({
          key: trend.id,
          text: trend.title,
          meta: trend.day ? `Trend · ${shortDay(trend.day)}` : 'Trend',
        })),
      ].slice(0, tile.size === 'l' ? 3 : 1)
    : [];

  return (
    <HomeTileFrame
      badge={ready ? `${formatCount(headline)} ${movesLabel(headline)}` : null}
      expanded={ready ? <Module brandId={ctx.brandId} /> : undefined}
      expandedDescription="Competitor moves first, then trends — newest first."
      state={view.state}
      tile={tile}
    >
      {view.state === 'missing' ? (
        <TileMissing>
          {view.missing}{' '}
          <Link className="underline underline-offset-2" href="/competitor-spy">
            Open Brand Spy
          </Link>
        </TileMissing>
      ) : null}
      {view.state === 'loading' ? (
        <div aria-hidden="true" className="h-16 w-full animate-pulse rounded-md bg-muted/60" />
      ) : null}
      {view.state === 'error' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">Couldn't read the market radar.</p>
          <Button className="h-7 px-2 text-xs" onClick={radar.retry} size="sm" variant="outline">
            Retry
          </Button>
        </div>
      ) : null}
      {ready ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-semibold text-2xl tabular-nums leading-none tracking-tight">
            <span data-testid="home-tile-market-headline" data-value={headline}>
              {formatCount(headline)}
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
