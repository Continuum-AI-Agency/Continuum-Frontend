'use client';
import { useLocale } from 'next-intl';

// The board's three marks, drawn from marksModel: a bullet (a cost against its goal), a ring (a
// count against what it should be) and a trend line with its goal. Marks are thin, their data
// ends round, and their colours come from BOARD_COLOR. Every label is HTML at the type scale's
// 12px floor, never SVG text that shrinks with its box, and the figure a mark draws is always
// written beside it by the caller. Motion draws each mark in once; under reduced motion it is
// simply there.

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { bulletScale, ringFraction, type TrendPoint, trendGeometry } from './marksModel';
import { BOARD_COLOR } from './palette';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** A cost on a track: the band under the goal, the goal's dashed tick, and the cost's dot in
 *  `color` (the diverging tone of marksModel.divergingColor). */
export function BulletMark({
  value,
  goal,
  color,
  label,
  className,
  testId = 'board-bullet',
}: {
  value: number | null | undefined;
  goal: number | null | undefined;
  color: string;
  /** What the bullet says, for a screen reader: the figure and the goal in words. */
  label: string;
  className?: string;
  testId?: string;
}) {
  const reduce = useReducedMotion();
  const scale = bulletScale(value, goal);
  return (
    <div
      aria-label={label}
      className={cn('relative h-6 min-w-0', className)}
      data-clipped={scale.clipped ? 'true' : undefined}
      data-testid={testId}
      role="img"
    >
      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
      {scale.goalPct != null ? (
        <>
          <span
            className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full"
            data-testid={`${testId}-band`}
            style={{
              width: `${scale.goalPct}%`,
              background: BOARD_COLOR.below,
              opacity: 0.22,
            }}
          />
          <span
            className="absolute inset-y-0 border-foreground/55 border-l-[1.5px] border-dashed"
            data-testid={`${testId}-goal`}
            style={{ left: `${scale.goalPct}%` }}
          />
        </>
      ) : null}
      {scale.valuePct != null ? (
        <motion.span
          animate={{ left: `${scale.valuePct}%` }}
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
          data-testid={`${testId}-value`}
          initial={reduce ? false : { left: '0%' }}
          style={{ left: `${scale.valuePct}%`, background: color }}
          transition={{ type: 'spring', visualDuration: 0.6, bounce: 0.15 }}
        />
      ) : null}
    </div>
  );
}

/** A count against the count it is measured by, as a ring with its own figure in the middle. */
export function RingMark({
  part,
  whole,
  color,
  label,
  children,
  className,
}: {
  part: number | null | undefined;
  whole: number | null | undefined;
  color: string;
  label: string;
  /** The figure and its words, drawn in the middle of the ring. */
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const fraction = ringFraction(part, whole);
  return (
    <div
      aria-label={label}
      className={cn('relative aspect-square w-44 shrink-0', className)}
      data-fraction={fraction.toFixed(3)}
      data-testid="board-ring"
      role="img"
    >
      <svg aria-hidden="true" className="size-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" fill="none" r="52" stroke="var(--muted)" strokeWidth="10" />
        {fraction > 0 ? (
          <motion.circle
            animate={{ pathLength: fraction }}
            cx="60"
            cy="60"
            fill="none"
            initial={reduce ? false : { pathLength: 0 }}
            r="52"
            stroke={color}
            strokeLinecap="round"
            strokeWidth="10"
            transition={{ duration: 1, ease: EASE_OUT, delay: 0.1 }}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-content-center justify-items-center gap-0.5 px-7 text-center">
        {children}
      </div>
    </div>
  );
}

const TREND_W = 600;
const TREND_H = 120;

/** A trend over days, with the goal's dashed line and the last value marked and written. */
export function TrendLine({
  points,
  goal,
  formatValue,
  label,
  goalLabel,
  lastLabel = dayLabel,
  className,
}: {
  points: readonly TrendPoint[];
  goal: number | null | undefined;
  formatValue: (value: number) => string;
  /** The chart in words, for a screen reader. */
  label: string;
  /** "goal $45": written over the goal line. */
  goalLabel?: string;
  /** How the last point's day reads beside its figure ("Nov 1", "cycle of Nov 2"). */
  lastLabel?: (day: string) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const uiLocale = useLocale();
  const geometry = trendGeometry(points, goal, TREND_W, TREND_H);
  const first = points[0];
  const lastDay = points[points.length - 1];
  const pctX = (x: number) => `${(x / TREND_W) * 100}%`;
  const pctY = (y: number) => `${(y / TREND_H) * 100}%`;
  return (
    <figure className={cn('min-w-0 space-y-1', className)} data-testid="board-trend">
      <div aria-label={label} className="relative h-28 w-full" role="img">
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${TREND_W} ${TREND_H}`}
        >
          {geometry.area ? (
            <path d={geometry.area} fill={BOARD_COLOR.search} fillOpacity={0.08} />
          ) : null}
          {geometry.goalY != null ? (
            <line
              stroke="var(--foreground)"
              strokeDasharray="4 3"
              strokeOpacity={0.55}
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              x1={0}
              x2={TREND_W}
              y1={geometry.goalY}
              y2={geometry.goalY}
            />
          ) : null}
          {geometry.line ? (
            <motion.path
              animate={{ pathLength: 1 }}
              d={geometry.line}
              data-testid="board-trend-line"
              fill="none"
              initial={reduce ? false : { pathLength: 0 }}
              stroke={BOARD_COLOR.search}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              transition={{ duration: 0.9, ease: [0.33, 1, 0.68, 1] }}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {geometry.goalY != null && goalLabel ? (
          <span
            className="absolute left-0 -translate-y-full rounded-sm bg-card/85 px-1 pb-0.5 text-muted-foreground text-xs"
            style={{ top: pctY(geometry.goalY) }}
          >
            {goalLabel}
          </span>
        ) : null}
        {geometry.last ? (
          <span
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
            style={{
              left: pctX(geometry.last.x),
              top: pctY(geometry.last.y),
              background: BOARD_COLOR.search,
            }}
          />
        ) : null}
      </div>
      <figcaption className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
        <span>{first ? dayLabel(first.day, uiLocale) : ''}</span>
        {geometry.last ? (
          <span className="font-medium text-foreground tabular-nums" data-testid="board-trend-last">
            {formatValue(geometry.last.value)}
            <span className="font-normal text-muted-foreground">
              {' '}
              ·{' '}
              {lastDay
                ? lastLabel === dayLabel
                  ? dayLabel(lastDay.day, uiLocale)
                  : lastLabel(lastDay.day)
                : ''}
            </span>
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

/** "Oct 31", from a YYYY-MM-DD day read as UTC. */
export function dayLabel(day: string, locale: string = 'en-US'): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
