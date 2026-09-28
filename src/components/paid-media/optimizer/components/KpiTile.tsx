// A headline number with a label above it and a line under it. The Overview's radiography is
// four to six of these. Each carries its verdict as a STATE on its top border — ok, warn,
// bad, or none when the figure cannot be judged — never as a chart and never as a colour
// chosen by magnitude. The colours are the theme's own tokens.

import { cn } from '@/lib/utils';
import type { FigureProps } from '../format';
import * as typeScale from '../typeScale';
import { HeroFigure } from './HeroFigure';

export type KpiTileState = 'ok' | 'warn' | 'bad' | 'none';

const STATE_BORDER: Record<KpiTileState, string> = {
  ok: 'border-t-success',
  warn: 'border-t-warning',
  bad: 'border-t-destructive',
  none: 'border-t-border',
};

type KpiTileProps = {
  label: string;
  value: string;
  /** Provenance for the headline figure (see `figureProps` in ../format). */
  figure?: FigureProps;
  sub?: React.ReactNode;
  chip?: React.ReactNode;
  action?: React.ReactNode;
  /** How the figure sits against what it is measured against. Defaults to `none`. */
  state?: KpiTileState;
  className?: string;
  testId?: string;
};

export function KpiTile({
  label,
  value,
  figure,
  sub,
  chip,
  action,
  state = 'none',
  className,
  testId,
}: KpiTileProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/70 border-t-2 bg-card px-3 py-2.5',
        STATE_BORDER[state],
        className,
      )}
      data-state={state}
      data-testid={testId ?? 'kpi-tile'}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`${typeScale.label} text-muted-foreground`}>{label}</span>
        {action}
      </div>
      <div className="min-w-0">
        <HeroFigure as="p" className="truncate text-foreground" kind="tile" {...figure}>
          {value}
        </HeroFigure>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      {chip ? <div className="flex flex-wrap gap-1.5">{chip}</div> : null}
    </div>
  );
}
