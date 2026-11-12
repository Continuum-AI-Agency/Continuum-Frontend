'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The campaign's trend (G11): its cost per result day by day as one thin line, the portfolio
// goal as a dashed line, the days it did not serve shaded, and what changed on it as dots on
// the days they happened — each channel in its own colour, listed under the chart in words.
// The last figure and the goal are written beside the chart, so it reads without the line.

import { motion, useReducedMotion } from 'motion/react';
import { formatCurrency } from '../../../format';
import { trendGeometry } from '../../board/marksModel';
import { BOARD_COLOR } from '../../board/palette';
import { dayLabel } from '../../google/campaignExplorerModel';
import {
  ACTOR_COLOR,
  ACTOR_WORDS,
  type CampaignTrend,
  type ChangeActor,
  type ChangeMark,
} from './campaignPageModel';

const W = 600;
const H = 140;

const pctX = (x: number) => `${(x / W) * 100}%`;
const pctY = (y: number) => `${(y / H) * 100}%`;

export function CampaignTrendChart({
  trend,
  marks,
  currency,
}: {
  trend: CampaignTrend;
  marks: readonly ChangeMark[];
  currency: string | null;
}) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  const points = trend.days.map((day) => ({ day: day.day, value: day.value }));
  const geometry = trendGeometry(points, trend.goal, W, H);
  const count = trend.days.length;
  const xOf = (index: number) => (count <= 1 ? W / 2 : (index / (count - 1)) * W);
  const indexOf = new Map(trend.days.map((day, index) => [day.day, index]));
  const slot = count > 1 ? W / (count - 1) : W;
  const first = trend.days[0];
  const lastDay = trend.days[count - 1];
  const money = (value: number) => formatCurrency(value, currency);
  const actors = [...new Set(marks.map((mark) => mark.actor))] as ChangeActor[];
  const summary = [
    trend.label,
    trend.last
      ? `last ${money(trend.last.value)} on ${dayLabel(trend.last.day)}`
      : 'nothing to price',
    trend.goal != null ? `goal ${money(trend.goal)}` : null,
    trend.darkDays > 0 ? `${trend.darkDays} days without ads` : null,
    marks.length > 0 ? `${marks.length} days with changes` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <figure className="min-w-0 space-y-2" data-testid="campaign-trend">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-semibold text-foreground text-xs">{trend.label}</span>
        <span className="font-mono text-xs tabular-nums" data-testid="campaign-trend-last">
          {trend.last ? (
            <>
              <span className="font-semibold text-foreground">{money(trend.last.value)}</span>
              <span className="text-muted-foreground"> · {dayLabel(trend.last.day)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{betaUiText('beta_2073b12d2059')}</span>
          )}
        </span>
      </figcaption>
      <div aria-label={summary} className="relative h-32 w-full" role="img">
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${W} ${H}`}
        >
          {trend.days.map((day, index) =>
            day.dark ? (
              <rect
                data-testid="campaign-trend-dark"
                fill="var(--destructive)"
                fillOpacity={0.08}
                height={H}
                key={day.day}
                width={slot}
                x={Math.max(0, xOf(index) - slot / 2)}
                y={0}
              />
            ) : null,
          )}
          {geometry.area ? (
            <path d={geometry.area} fill={BOARD_COLOR.search} fillOpacity={0.08} />
          ) : null}
          {geometry.goalY != null ? (
            <line
              data-testid="campaign-trend-goal"
              stroke="var(--foreground)"
              strokeDasharray="4 3"
              strokeOpacity={0.55}
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              x1={0}
              x2={W}
              y1={geometry.goalY}
              y2={geometry.goalY}
            />
          ) : null}
          {marks.map((mark) => {
            const index = indexOf.get(mark.day);
            if (index == null) return null;
            return (
              <line
                key={`${mark.day}:${mark.actor}`}
                stroke={ACTOR_COLOR[mark.actor]}
                strokeOpacity={0.55}
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
                x1={xOf(index)}
                x2={xOf(index)}
                y1={0}
                y2={H}
              />
            );
          })}
          {geometry.line ? (
            <motion.path
              animate={{ pathLength: 1 }}
              d={geometry.line}
              data-testid="campaign-trend-line"
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
        {marks.map((mark, order) => {
          const index = indexOf.get(mark.day);
          if (index == null) return null;
          return (
            <motion.span
              animate={{ scale: 1 }}
              className="absolute top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
              data-actor={mark.actor}
              data-testid="campaign-trend-mark"
              initial={reduce ? false : { scale: 0 }}
              key={`${mark.day}:${mark.actor}`}
              style={{
                left: pctX(xOf(index)),
                background: ACTOR_COLOR[mark.actor],
              }}
              title={`${dayLabel(mark.day)} · ${ACTOR_WORDS[mark.actor]}: ${mark.label}`}
              transition={{
                type: 'spring',
                visualDuration: 0.35,
                bounce: 0.3,
                delay: 0.4 + order * 0.07,
              }}
            />
          );
        })}
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
      <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
        <span>{first ? dayLabel(first.day) : ''}</span>
        <span>{lastDay ? dayLabel(lastDay.day) : ''}</span>
      </div>
      {/* The legend carries the goal and the dark days as text, off the plot, so a line that
          crosses the goal never runs through its label. */}
      {trend.goal != null || trend.darkDays > 0 || marks.length > 0 ? (
        <p
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs"
          data-testid="campaign-trend-legend"
        >
          {trend.goal != null ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-4 border-foreground/55 border-t-[1.5px] border-dashed"
              />
              {betaUiText('beta_0304523efff5')}{' '}
              <span className="font-medium text-foreground tabular-nums">{money(trend.goal)}</span>
            </span>
          ) : null}
          {trend.darkDays > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-destructive/15" />
              <span data-testid="campaign-trend-dark-days">
                {trend.darkDays}{' '}
                {trend.darkDays === 1
                  ? betaUiText('beta_944c27e5b97a')
                  : betaUiText('beta_ab51004e9d71')}{' '}
                {betaUiText('beta_37e9a2d44c9d')}
              </span>
            </span>
          ) : null}
          {marks.length > 0 ? <span>{betaUiText('beta_24b669fb5558')}</span> : null}
          {actors.map((actor) => (
            <span className="inline-flex items-center gap-1.5" key={actor}>
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: ACTOR_COLOR[actor] }}
              />
              {ACTOR_WORDS[actor]}
            </span>
          ))}
        </p>
      ) : null}
    </figure>
  );
}
