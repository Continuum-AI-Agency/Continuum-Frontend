'use client';

// A row of figures read at a glance: label above, figure below, each tile its own borderless
// module on the neutral fill (`modules.ts`), separated from the next by the gap alone. The
// metric grid is this; a chart that does not earn its space degrades to this. One drawing so
// a tile is a tile wherever it appears.
//
// A tile whose figure moved against its prior or its target carries a `tone`: the module takes
// a faint green or red wash from the top and the FIGURE takes the colour — never the card.
//
// A J2 tile carries two more lines under the figure: the prior period it is compared with
// ("vs 24,214 · Sep 14–20") and the one-word read of that comparison, coloured by what it
// means. Both are optional so the chart-degrade tile, which has neither, stays the same tile.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { JAINA_TYPE, type Judgement } from '../reading';
import { MODULE_TINT } from './modules';

export type MetricTileRead = {
  /** The word the reader sees, in the answer's language. */
  word: string;
  /** The judgement colour the word carries. */
  className: string;
  /** The hover text: the label and the judgement, for readers who cannot see the colour. */
  title: string;
};

export type MetricTile = {
  key: string;
  label: string;
  value: string;
  /** The judgement colour, when something judged the figure. Ink otherwise. */
  valueClassName?: string;
  /** The hover word for the colour, for readers who cannot see it. */
  title?: string;
  /** Drawn after the figure (a delta badge). */
  trailing?: ReactNode;
  /** The prior period's figure and window, drawn under the figure. */
  prior?: string | null;
  /** The one-word read against the target or the prior, coloured by state. */
  read?: MetricTileRead | null;
  /** The judged direction of the figure vs its prior or target; tints the module. */
  tone?: Judgement | null;
};

/** The tile's figure: large, mono, tabular — the protagonist of its module. */
export const TILE_FIGURE = `${JAINA_TYPE.figure} text-xl leading-tight [overflow-wrap:anywhere]`;

export function MetricTiles({
  tiles,
  ...rest
}: { tiles: ReadonlyArray<MetricTile> } & Omit<React.ComponentProps<'dl'>, 'children'>) {
  return (
    <dl
      {...rest}
      className={cn('grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3', rest.className)}
    >
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className={cn(
            'flex flex-col gap-1 rounded-xl p-3 sm:p-4',
            MODULE_TINT[tile.tone ?? 'unjudged'],
          )}
          data-jaina-tile={tile.tone ?? 'unjudged'}
        >
          <dt className={cn(JAINA_TYPE.label, 'text-muted-foreground')}>{tile.label}</dt>
          <dd className="flex flex-wrap items-baseline gap-x-1.5">
            <span
              className={cn(TILE_FIGURE, tile.valueClassName ?? 'text-foreground')}
              title={tile.title}
            >
              {tile.value}
            </span>
            {tile.trailing}
          </dd>
          {tile.prior ? (
            <dd
              className={cn(JAINA_TYPE.table, 'text-muted-foreground tabular-nums')}
              data-testid="metric-prior"
            >
              {tile.prior}
            </dd>
          ) : null}
          {tile.read ? (
            <dd
              className={cn(JAINA_TYPE.table, 'font-medium', tile.read.className)}
              data-testid="metric-read"
              title={tile.read.title}
            >
              {tile.read.word}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
