'use client';
import { useTranslations as useBetaTranslations, useLocale } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

// G13's chart: the account's spend per day over the window, the days it showed no ad shaded, and
// one dot per event above the line, coloured by the hand that made it. Pointing at a dot lights its
// row in the list below (and a row lights its dot); choosing one scrolls its row into view.
//
// The drawing stretches to any width (a 0–100 viewBox, strokes that do not scale), and every dot
// is an HTML button over it, so the dots keep their size and stay reachable by keyboard on a
// phone. The figure the line stands for is written beside it: the window's spend, its daily
// average, and the days without ads.

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../../format';
import { PLATFORM_NAMES } from '../../platforms/platformTabsModel';
import {
  type ActivityDay,
  type ActivityMarker,
  activitySourceCopy,
  dayKeyLabel,
  MARKER_STACK,
  SOURCE_COLOR,
  type SpendSeries,
} from './activityModel';
import type { ChartAccount, SpendState } from './useActivitySpend';

/** The plot's height in px, and where its two bands sit: the dots on top, the line below. */
const PLOT_PX = 168;
const MARKER_TOP_PX = 4;
const MARKER_STEP_PX = 15;
const LINE_TOP_PX = MARKER_TOP_PX + (MARKER_STACK + 1) * MARKER_STEP_PX + 4;
const LINE_BOTTOM_PX = PLOT_PX - 6;
const pct = (px: number) => (px / PLOT_PX) * 100;

export type ActivitySpendChartProps = {
  days: readonly ActivityDay[];
  spend: SpendState;
  account: ChartAccount | null;
  /** The account choice, when the brand has more than one account to chart. */
  accountPicker?: ReactNode;
  /** The source filter, drawn on the card's second line: it is the chart's legend as well. */
  filter?: ReactNode;
  markers: readonly ActivityMarker[];
  overflow: readonly { column: number; count: number }[];
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
  /** A dot was chosen: bring its row into view. */
  onPick: (id: string) => void;
  /** What a read could not say, so the chart never passes for complete when it is not. */
  notes?: readonly string[];
};

function columnX(column: number, columns: number): number {
  return ((column + 0.5) / Math.max(1, columns)) * 100;
}

function SpendFigure({ spend }: { spend: SpendState }) {
  const betaUiText = useBetaTranslations('scale');
  const locale = useLocale() as UiLocale;

  if (spend.status !== 'ready') return null;
  const { series } = spend;
  const perDay = series.completeDays > 0 ? series.total / series.completeDays : null;
  return (
    <div className="shrink-0 sm:text-right" data-testid="activity-spend-figure">
      <p className="font-mono font-semibold text-foreground text-sm tabular-nums">
        {formatCurrency(series.total, series.currency, locale)}
      </p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {perDay != null
          ? betaUiText('beta_a2fa02fd878f', {
              value0: String(formatCurrency(perDay, series.currency, locale)),
            })
          : null}
        {series.darkDays > 0 ? betaUiText('beta_ba95b9d132e0', { value0: series.darkDays }) : null}
      </p>
    </div>
  );
}

function SpendLine({ series, columns }: { series: SpendSeries; columns: number }) {
  const betaUiText = useBetaTranslations('scale');
  const locale = useLocale() as UiLocale;

  const reduce = useReducedMotion();
  const ceiling = series.max > 0 ? series.max : 1;
  const top = pct(LINE_TOP_PX);
  const bottom = pct(LINE_BOTTOM_PX);
  const y = (value: number) => bottom - (value / ceiling) * (bottom - top);
  const points = series.days.flatMap((day, column) =>
    day.spend === null ? [] : [{ x: columnX(column, columns), y: y(day.spend), day }],
  );
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${first.x},${bottom} ${line} ${last.x},${bottom}`;

  return (
    <>
      <motion.div
        animate={{ clipPath: 'inset(0 0% 0 0)' }}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        initial={reduce ? false : { clipPath: 'inset(0 100% 0 0)' }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <title>{betaUiText('beta_59b8da891881')}</title>
          <polygon className="text-foreground" fill="currentColor" opacity={0.05} points={area} />
          <polyline
            className="text-foreground/70"
            data-testid="activity-spend-line"
            fill="none"
            points={line}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </motion.div>
      {/* The last complete day, dotted and written: the line's own figure. */}
      <span
        aria-hidden="true"
        className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute size-1.5 rounded-full bg-foreground"
        style={{ left: `${last.x}%`, top: `${last.y}%` }}
      />
      <span
        className="-translate-y-full pointer-events-none absolute pb-1 font-mono text-muted-foreground text-xs tabular-nums"
        data-testid="activity-spend-last"
        style={
          last.x > 60
            ? { right: `${100 - last.x}%`, top: `${last.y}%` }
            : { left: `${last.x}%`, top: `${last.y}%` }
        }
      >
        {formatCurrency(last.day.spend, series.currency, locale)}
      </span>
    </>
  );
}

function MarkerLabel({
  marker,
  columns,
  dayKey,
}: {
  marker: ActivityMarker;
  columns: number;
  dayKey: string;
}) {
  const betaUiText = useBetaTranslations('scale');
  const locale = useLocale() as UiLocale;
  const x = columnX(marker.column, columns);
  const align = x < 28 ? 'start' : x > 72 ? 'end' : 'center';
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-20 w-max max-w-56 rounded-md border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md',
        align === 'center' && '-translate-x-1/2',
        align === 'end' && '-translate-x-full',
      )}
      aria-hidden="true"
      data-testid="activity-marker-label"
      style={{
        left: `${x}%`,
        top: MARKER_TOP_PX + (marker.stack + 1) * MARKER_STEP_PX + 2,
      }}
    >
      <span className="text-muted-foreground">
        {dayKeyLabel(dayKey, locale)} · {activitySourceCopy(marker.source, betaUiText).label}
      </span>
      <span className="block text-foreground">{marker.label}</span>
    </div>
  );
}

function SpendNote({ spend }: { spend: SpendState }) {
  const betaUiText = useBetaTranslations('scale');
  const locale = useLocale() as UiLocale;

  if (spend.status === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="activity-spend-error">
        <span className="text-destructive">
          {betaUiText('beta_2bfda0e5f92d')} {spend.message}
        </span>
        <Button className="h-6 px-2 text-xs" onClick={spend.retry} size="sm" variant="ghost">
          {betaUiText('beta_942087cc2d41')}
        </Button>
      </div>
    );
  }
  if (spend.status === 'unreadable') {
    return (
      <p className="text-muted-foreground text-xs" data-testid="activity-spend-unreadable">
        {betaUiText('beta_c00ea6e7e6f6')}
      </p>
    );
  }
  if (spend.status === 'none') {
    return (
      <p className="text-muted-foreground text-xs" data-testid="activity-spend-none">
        {betaUiText('beta_bedd68a89d18')}
      </p>
    );
  }
  return null;
}

export function ActivitySpendChart({
  days,
  spend,
  account,
  accountPicker,
  filter,
  markers,
  overflow,
  highlightedId,
  onHighlight,
  onPick,
  notes = [],
}: ActivitySpendChartProps) {
  const betaUiText = useBetaTranslations('scale');
  const locale = useLocale() as UiLocale;

  const reduce = useReducedMotion();
  const columns = days.length;
  const complete = days.filter((day) => day.complete);
  const firstDay = complete[0]?.key ?? days[0]?.key ?? '';
  const lastDay = complete.at(-1)?.key ?? firstDay;
  const series = spend.status === 'ready' ? spend.series : null;
  const highlighted = markers.find((marker) => marker.id === highlightedId) ?? null;
  // One guide per day that holds events, in the colour of the day's first one.
  const guides = new Map<number, ActivityMarker>();
  for (const marker of markers) if (!guides.has(marker.column)) guides.set(marker.column, marker);

  return (
    <section
      aria-label={betaUiText('beta_55fbd9312592')}
      className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
      data-testid="activity-chart"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-semibold text-sm tracking-tight">
            {betaUiText('beta_59b8da891881')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {dayKeyLabel(firstDay, locale)} – {dayKeyLabel(lastDay, locale)}
            {account
              ? ` · ${PLATFORM_NAMES[account.platform]} · ${account.name?.trim() || account.id}`
              : null}
          </p>
        </div>
        <SpendFigure spend={spend} />
      </header>

      {filter || accountPicker ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {filter}
          {accountPicker ? <div className="ml-auto">{accountPicker}</div> : null}
        </div>
      ) : null}

      <div>
        <figure
          aria-label={betaUiText('beta_71527f077009', {
            value0: String(dayKeyLabel(firstDay, locale)),
            value1: String(dayKeyLabel(lastDay, locale)),
            value2: markers.length,
          })}
          className="relative m-0"
          onPointerLeave={() => onHighlight(null)}
          style={{ height: PLOT_PX }}
        >
          {/* The days without ads, as whole columns behind everything else. */}
          {series?.days.map((day, column) =>
            day.dark ? (
              <span
                aria-hidden="true"
                className="absolute top-0 bg-muted-foreground/12"
                data-day={day.key}
                data-testid="activity-dark-day"
                key={day.key}
                style={{
                  left: `${(column / columns) * 100}%`,
                  width: `${100 / columns}%`,
                  height: LINE_BOTTOM_PX,
                }}
              />
            ) : null,
          )}
          {/* The x axis the guides land on. */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 h-px bg-border"
            style={{ top: LINE_BOTTOM_PX }}
          />
          {spend.status === 'loading' ? (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 animate-pulse rounded-md bg-muted/70"
              data-testid="activity-spend-loading"
              style={{ top: LINE_TOP_PX, bottom: PLOT_PX - LINE_BOTTOM_PX }}
            />
          ) : null}
          {series ? <SpendLine columns={columns} series={series} /> : null}

          {[...guides.values()].map((marker) => (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute w-px"
              key={`guide-${marker.column}`}
              style={{
                left: `${columnX(marker.column, columns)}%`,
                top: MARKER_TOP_PX + 8,
                height: LINE_BOTTOM_PX - MARKER_TOP_PX - 8,
                background: SOURCE_COLOR[marker.source],
                opacity: 0.3,
              }}
            />
          ))}

          {markers.map((marker, index) => {
            const on = marker.id === highlightedId;
            const day = days[marker.column]?.key ?? '';
            return (
              <button
                aria-label={`${dayKeyLabel(day, locale)} · ${activitySourceCopy(marker.source, betaUiText).label}: ${marker.label}`}
                aria-pressed={on}
                className="-translate-x-1/2 absolute z-10 flex size-4 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-event-id={marker.id}
                data-source={marker.source}
                data-testid="activity-marker"
                key={marker.id}
                onBlur={() => onHighlight(null)}
                onClick={() => onPick(marker.id)}
                onFocus={() => onHighlight(marker.id)}
                onPointerEnter={() => onHighlight(marker.id)}
                style={{
                  left: `${columnX(marker.column, columns)}%`,
                  top: MARKER_TOP_PX + marker.stack * MARKER_STEP_PX,
                }}
                type="button"
              >
                {/* The dot arrives once, after the line; lighting it is a plain transform, so a
                    pointer never waits on the entrance. */}
                <motion.span
                  animate={{ scale: 1, opacity: 1 }}
                  className="block"
                  initial={reduce ? false : { scale: 0, opacity: 0 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          type: 'spring',
                          visualDuration: 0.35,
                          bounce: 0.2,
                          delay: 0.3 + index * 0.04,
                        }
                  }
                >
                  <span
                    className={cn(
                      'block size-2.5 rounded-full ring-2 ring-card transition-transform duration-150 motion-reduce:transition-none',
                      on && 'scale-150',
                    )}
                    data-marker-dot=""
                    style={{ background: SOURCE_COLOR[marker.source] }}
                  />
                </motion.span>
              </button>
            );
          })}

          {overflow.map((extra) => (
            <span
              className="-translate-x-1/2 pointer-events-none absolute font-mono text-muted-foreground text-xs tabular-nums"
              data-testid="activity-marker-overflow"
              key={`overflow-${extra.column}`}
              style={{
                left: `${columnX(extra.column, columns)}%`,
                top: MARKER_TOP_PX + MARKER_STACK * MARKER_STEP_PX - 2,
              }}
            >
              +{extra.count}
            </span>
          ))}

          {highlighted ? (
            <MarkerLabel
              columns={columns}
              dayKey={days[highlighted.column]?.key ?? ''}
              marker={highlighted}
            />
          ) : null}
        </figure>

        <div className="mt-1 flex justify-between gap-2 font-mono text-muted-foreground text-xs tabular-nums">
          <span>{dayKeyLabel(days[0]?.key ?? '', locale)}</span>
          <span>{betaUiText('beta_2b065c7c9ce4')}</span>
        </div>
      </div>

      {series && series.darkDays > 0 ? (
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-3 rounded-[2px] bg-muted-foreground/25"
          />
          {betaUiText('beta_2f24926f8d72')}
        </p>
      ) : null}
      <SpendNote spend={spend} />
      {notes.map((note) => (
        <p className="text-muted-foreground text-xs" data-testid="activity-chart-note" key={note}>
          {note}
        </p>
      ))}
    </section>
  );
}
