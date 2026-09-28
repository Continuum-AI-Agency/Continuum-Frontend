'use client';

// A row of figures read at a glance: label above, figure below, each in its own cell of one
// bordered grid. The metric grid is this; a chart that does not earn its space degrades to
// this. One drawing so a tile is a tile wherever it appears.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { JAINA_TYPE } from '../reading';

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
};

export function MetricTiles({
  tiles,
  ...rest
}: { tiles: ReadonlyArray<MetricTile> } & Omit<React.ComponentProps<'dl'>, 'children'>) {
  return (
    <dl
      {...rest}
      className={cn(
        'grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-px overflow-hidden rounded-lg border border-border/60 bg-border/40',
        rest.className,
      )}
    >
      {tiles.map((tile) => (
        <div key={tile.key} className="flex flex-col gap-1 bg-background px-3 py-2.5">
          <dt className={cn(JAINA_TYPE.label, 'text-muted-foreground')}>{tile.label}</dt>
          <dd className="flex items-baseline gap-1.5">
            <span
              className={cn(JAINA_TYPE.figure, tile.valueClassName ?? 'text-foreground')}
              title={tile.title}
            >
              {tile.value}
            </span>
            {tile.trailing}
          </dd>
        </div>
      ))}
    </dl>
  );
}
