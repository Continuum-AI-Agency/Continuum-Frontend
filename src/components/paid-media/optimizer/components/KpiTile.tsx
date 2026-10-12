// A headline number with a label above it and a line under it. Two looks share one element:
//
// - `card` (the default): a framed tile whose verdict is a STATE on its top border — ok, warn,
//   bad, or none when the figure cannot be judged — never a chart and never a colour chosen by
//   magnitude. The platform tabs and the portfolio module still lay these out in a grid.
// - `inline`: one cell of the Overview's editorial row (KpiRow). No frame and no state border —
//   the row's cells are separated only by hairlines, and colour is spent on the one figure that
//   moved, by the caller, in `sub`. The state still travels on `data-state`.
//
// `emphasis` is for the inline row: `hero` is the row's one protagonist number, `decision` is the
// figure that asks for a decision and so takes the primary colour. The colours are theme tokens.

import { cn } from '@/lib/utils';
import type { FigureProps } from '../format';
import * as typeScale from '../typeScale';
import { HeroFigure } from './HeroFigure';

export type KpiTileState = 'ok' | 'warn' | 'bad' | 'none';

export type KpiTileVariant = 'card' | 'inline';

export type KpiTileEmphasis = 'hero' | 'decision';

const STATE_BORDER: Record<KpiTileState, string> = {
  ok: 'border-t-success',
  warn: 'border-t-warning',
  bad: 'border-t-destructive',
  none: 'border-t-border',
};

const EMPHASIS_FIGURE: Record<KpiTileEmphasis, string> = {
  hero: '',
  decision: 'text-primary-ink',
};

type KpiTileProps = {
  label: string;
  value: React.ReactNode;
  /** Provenance for the headline figure (see `figureProps` in ../format). */
  figure?: FigureProps;
  /** Drawn beside the figure at its size but OUTSIDE its node ("/4" after "3"), so the
   *  figure's text stays exactly its raw value for the parity oracle. */
  valueSuffix?: React.ReactNode;
  sub?: React.ReactNode;
  /** An optional third line under `sub`: how the figure splits, e.g. by platform. */
  breakdown?: React.ReactNode;
  chip?: React.ReactNode;
  action?: React.ReactNode;
  /** How the figure sits against what it is measured against. Defaults to `none`. */
  state?: KpiTileState;
  variant?: KpiTileVariant;
  emphasis?: KpiTileEmphasis;
  className?: string;
  testId?: string;
};

export function KpiTile({
  label,
  value,
  figure,
  valueSuffix,
  sub,
  breakdown,
  chip,
  action,
  state = 'none',
  variant = 'card',
  emphasis,
  className,
  testId,
}: KpiTileProps) {
  const inline = variant === 'inline';
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col',
        inline
          ? 'gap-1.5 py-1'
          : cn(
              'gap-1.5 rounded-lg border border-border/70 border-t-2 bg-card px-3 py-2.5',
              STATE_BORDER[state],
            ),
        className,
      )}
      data-emphasis={emphasis}
      data-state={state}
      data-testid={testId ?? 'kpi-tile'}
      data-variant={variant}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn(typeScale.label, 'text-muted-foreground', inline && 'font-semibold')}>
          {label}
        </span>
        {inline ? null : action}
      </div>
      <div className="min-w-0">
        {valueSuffix ? (
          <p className="flex min-w-0 items-baseline">
            <HeroFigure
              className={cn('truncate text-foreground', emphasis && EMPHASIS_FIGURE[emphasis])}
              kind={emphasis === 'hero' ? 'hero' : 'tile'}
              {...figure}
            >
              {value}
            </HeroFigure>
            <span
              className={cn(
                emphasis === 'hero' ? typeScale.figureHero : typeScale.figureTile,
                'text-muted-foreground/60',
              )}
            >
              {valueSuffix}
            </span>
          </p>
        ) : (
          <HeroFigure
            as="p"
            className={cn('truncate text-foreground', emphasis && EMPHASIS_FIGURE[emphasis])}
            kind={emphasis === 'hero' ? 'hero' : 'tile'}
            {...figure}
          >
            {value}
          </HeroFigure>
        )}
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
        {breakdown ? (
          <p className="mt-0.5 text-xs text-muted-foreground" data-testid="tile-breakdown">
            {breakdown}
          </p>
        ) : null}
        {inline && action ? <div className="mt-1">{action}</div> : null}
      </div>
      {chip ? <div className="flex flex-wrap gap-1.5">{chip}</div> : null}
    </div>
  );
}

type KpiRowProps = {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  /** Which producer the figures come from, carried as `data-source`. */
  source?: string;
};

/**
 * The Overview's editorial row: inline tiles side by side with no boxes, separated only by a
 * thin vertical hairline. The first cell is the hero and takes half again the width of the
 * others on a wide pane; on a narrow one the hero spans the row and the rest go two (then
 * three) to a row, with whitespace instead of hairlines.
 */
export function KpiRow({ children, className, testId, source }: KpiRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-5 gap-y-4 px-1 md:grid-cols-3',
        '[&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1',
        'lg:grid-flow-col lg:grid-cols-[minmax(0,1.5fr)] lg:auto-cols-[minmax(0,1fr)] lg:gap-x-0',
        'lg:[&>*]:pr-5 lg:[&>*+*]:border-l lg:[&>*+*]:border-border/60 lg:[&>*+*]:pl-5',
        className,
      )}
      data-source={source}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * A figure's move against the window before — "▼ 6%" — the one place the editorial row spends
 * colour. `better` says which way is good: a cost is better down, so a cheaper week reads
 * success and a dearer one destructive. `neutral` moves only in words (spend is neither good
 * nor bad by going up). Nothing when there is no move to show.
 */
export function KpiDelta({
  pct,
  better,
  title,
  testId,
}: {
  pct: number | null;
  better: 'down' | 'neutral';
  /** The prior figure, said in full on hover: "prev. week 48.10 MXN". */
  title?: string;
  testId?: string;
}) {
  if (pct == null) return null;
  const direction = pct < 0 ? 'down' : pct > 0 ? 'up' : 'flat';
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        better === 'down' && direction === 'down' && 'text-success',
        better === 'down' && direction === 'up' && 'text-destructive',
      )}
      data-direction={direction}
      data-testid={testId}
      title={title}
    >
      {kpiDeltaLabel(pct)}
    </span>
  );
}

/** "▲ 12%", "▼ 3%", "flat" — the window it is against travels in the title, not the words. */
export function kpiDeltaLabel(pct: number): string {
  if (pct === 0) return 'flat';
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
}
