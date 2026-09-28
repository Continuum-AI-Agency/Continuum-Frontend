// A headline number with room for a chip and a sparkline. The Overview's health strip is
// four of these; each reads at a glance and says its verdict in a chip, not a colour.

import { cn } from '@/lib/utils';
import type { FigureProps } from '../format';
import * as typeScale from '../typeScale';
import { HeroFigure } from './HeroFigure';
import { Sparkline } from './Sparkline';

type KpiTileProps = {
  label: string;
  value: string;
  /** Provenance for the headline figure (see `figureProps` in ../format). */
  figure?: FigureProps;
  sub?: React.ReactNode;
  chip?: React.ReactNode;
  spark?: number[];
  sparkColor?: string;
  action?: React.ReactNode;
  className?: string;
};

export function KpiTile({
  label,
  value,
  figure,
  sub,
  chip,
  spark,
  sparkColor,
  action,
  className,
}: KpiTileProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/70 bg-card px-3 py-2.5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`${typeScale.label} text-muted-foreground`}>{label}</span>
        {action}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <HeroFigure as="p" className="truncate text-foreground" kind="tile" {...figure}>
            {value}
          </HeroFigure>
          {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        {spark && spark.some((v) => v > 0) ? (
          <Sparkline label={`${label} by day`} stroke={sparkColor} values={spark} width={72} />
        ) : null}
      </div>
      {chip ? <div className="flex flex-wrap gap-1.5">{chip}</div> : null}
    </div>
  );
}
