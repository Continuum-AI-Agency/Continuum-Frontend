'use client';

// The seven shapes, drawn.
//
// Each one renders ONLY the figures the detector put in the chart — no second reading of the
// data, no scale invented to make a bar look better. Every axis label names a value the
// drawing actually reaches, and text takes its colour from the theme tokens so both themes
// read. Plain SVG and flex: a library here would buy nothing and cost a runtime fetch the
// artifact CSP would refuse anyway.
//
// `rates` and `interval` are readable by POINTER AND BY KEYBOARD. A chart whose figures only
// a mouse can reach is a chart half the readers cannot check, so every mark a reader can
// interrogate is a real <button> with its own accessible name: the date, the label and the
// value with its unit. A readout line above the plot carries the same three facts in the
// same place whether the reader is hovering, tabbing or sitting still — no popup that
// appears and vanishes, and no layout that shifts when it does.
//
// The reference is NOT a second series. A `b` that never moves across the window is the line
// the series is being read against, and it is drawn as a labelled rule rather than a second
// polyline a reader has to decode from a legend. Which of the two a chart carries is read
// off the data itself — never assumed, never configured.

import type { AccountChart } from '@continuum/contracts';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';

const DAY_SHORT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const DAY_FULL = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  weekday: 'long',
  year: 'numeric',
});

/**
 * A point's own `t`, read as a day when it is one.
 *
 * `t` is a free string in the contract — most detectors put a date in it, some put a week
 * label. Anything that does not parse is returned untouched: the axis says what the data
 * says, and a date nobody supplied is never invented to fill the slot.
 */
function dayLabel(t: string, formatter: Intl.DateTimeFormat): string {
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(t) ? Date.parse(`${t}T00:00:00Z`) : Date.parse(t);
  return Number.isNaN(ms) ? t : formatter.format(ms);
}

/** ~5s, and it neither sweeps nor shines: the newest point breathes so "today" is findable. */
const beaconVariants: Variants = {
  still: { opacity: 0, scale: 1 },
  breathing: {
    opacity: [0, 0.4, 0],
    scale: [1, 2.4, 2.4],
    transition: { duration: 5, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY },
  },
};

type Fmt = (n: number) => string;

const fmtFor = (unit: string | undefined, currency: string | null): Fmt => {
  if (unit === 'currency') return (n) => formatCurrency(n, currency);
  if (unit === 'ratio') return (n) => `${Math.round(n * 100) / 100}`;
  return (n) => `${Math.round(n * 100) / 100}`;
};

const pctText = (share: number): string => `${Math.round(share * 100)}%`;

/** A column whose height is a share of the tallest value in its own chart. */
function Bar({
  value,
  max,
  tone,
  label,
  caption,
}: {
  value: number;
  max: number;
  tone: 'accent' | 'muted' | 'warn';
  label: string;
  caption: string;
}) {
  const height = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span className="font-mono text-2xs tabular-nums text-foreground">{caption}</span>
      <div className="flex h-24 w-full items-end justify-center">
        <div
          className={cn(
            'w-full max-w-[52px] rounded-t',
            tone === 'accent' && 'bg-primary/80',
            tone === 'muted' && 'bg-muted-foreground/30',
            tone === 'warn' && 'bg-amber-500/70',
          )}
          style={{ height: `${height}%` }}
        />
      </div>
      <span className="w-full truncate text-center text-3xs text-muted-foreground" title={label}>
        {label}
      </span>
    </div>
  );
}

function Transfer({
  chart,
  currency,
}: {
  chart: Extract<AccountChart, { shape: 'transfer' }>;
  currency: string | null;
}) {
  const fmt = fmtFor(chart.unit, currency);
  const max = Math.max(chart.from.cost_per_result, chart.to.cost_per_result);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-4">
        <Bar
          value={chart.from.cost_per_result}
          max={max}
          tone="warn"
          label={chart.from.label}
          caption={fmt(chart.from.cost_per_result)}
        />
        <div className="flex flex-col items-center gap-0.5 pb-8 text-center">
          <span className="text-3xs text-muted-foreground">moves</span>
          <span className="font-mono text-xs tabular-nums text-foreground">
            {fmt(chart.movable_per_day)}
          </span>
          <span className="text-3xs text-muted-foreground">/day →</span>
        </div>
        <Bar
          value={chart.to.cost_per_result}
          max={max}
          tone="accent"
          label={chart.to.label}
          caption={fmt(chart.to.cost_per_result)}
        />
      </div>
      <p className="text-center text-2xs text-muted-foreground">
        the same results at the cheaper price keeps{' '}
        <span className="font-mono font-semibold text-foreground">{fmt(chart.saving_per_day)}</span>{' '}
        a day
      </p>
    </div>
  );
}

function Threshold({
  chart,
  currency,
}: {
  chart: Extract<AccountChart, { shape: 'threshold' }>;
  currency: string | null;
}) {
  const fmt = fmtFor(chart.unit, currency);
  const max = Math.max(
    chart.threshold,
    ...chart.bars.map((b) => b.value),
    chart.combined?.value ?? 0,
  );
  const linePct = max > 0 ? Math.round((chart.threshold / max) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="relative flex items-end gap-3">
        {/* The line every bar is being read against, drawn once across all of them. */}
        <div
          className="pointer-events-none absolute right-0 left-0 border-foreground/40 border-t border-dashed"
          style={{ bottom: `calc(1.5rem + ${linePct}% * 0.96)` }}
        >
          <span className="-top-4 absolute right-0 text-3xs text-muted-foreground">
            {chart.threshold_label} {fmt(chart.threshold)}
          </span>
        </div>
        {chart.bars.map((bar) => (
          <Bar
            key={bar.label}
            value={bar.value}
            max={max}
            tone="muted"
            label={bar.label}
            caption={fmt(bar.value)}
          />
        ))}
        {chart.combined ? (
          <Bar
            value={chart.combined.value}
            max={max}
            tone="accent"
            label={chart.combined.label}
            caption={fmt(chart.combined.value)}
          />
        ) : null}
      </div>
    </div>
  );
}

function Share({
  chart,
  currency,
}: {
  chart: Extract<AccountChart, { shape: 'share' }>;
  currency: string | null;
}) {
  const fmt = fmtFor('currency', currency);
  return (
    <div className="space-y-2">
      <div className="flex h-7 w-full overflow-hidden rounded border border-border/60">
        {chart.slices.map((slice) => (
          <div
            key={slice.label}
            className={cn(
              'flex items-center justify-center overflow-hidden',
              slice.label === chart.focus_label ? 'bg-primary/70' : 'bg-muted-foreground/20',
            )}
            style={{ width: `${Math.max(2, slice.share * 100)}%` }}
            title={`${slice.label} · ${pctText(slice.share)} · ${fmt(slice.value)}/day`}
          >
            {slice.share > 0.12 ? (
              <span className="truncate px-1 text-3xs text-foreground">{pctText(slice.share)}</span>
            ) : null}
          </div>
        ))}
      </div>
      {chart.band ? (
        <div className="relative h-4">
          <div
            className="absolute h-1.5 rounded-sm border border-foreground/40 border-dashed"
            style={{
              left: `${chart.band.low * 100}%`,
              width: `${Math.max(2, (chart.band.high - chart.band.low) * 100)}%`,
            }}
          />
          <span
            className="absolute top-2 text-3xs text-muted-foreground"
            style={{ left: `${chart.band.low * 100}%` }}
          >
            {chart.band_label}
          </span>
        </div>
      ) : null}
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 pt-2">
        {chart.slices.map((slice) => (
          <li key={slice.label} className="text-3xs text-muted-foreground">
            <span
              className={cn(slice.label === chart.focus_label && 'font-semibold text-foreground')}
            >
              {slice.label}
            </span>{' '}
            {pctText(slice.share)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Two series over the same days — or one series against the line it is read against.
 *
 * The readout above the plot is the whole point: it names the label, the value with its
 * unit and the DAY, and it is present before anyone touches anything (it opens on the
 * newest point). Pointer moves it; ArrowLeft/ArrowRight/Home/End move it too, because the
 * points are real buttons under a roving tabindex rather than SVG a screen reader skips.
 */
function Rates({
  chart,
  currency,
}: {
  chart: Extract<AccountChart, { shape: 'rates' }>;
  currency: string | null;
}) {
  const reduce = useReducedMotion();
  const fmt = fmtFor(chart.unit, currency);
  const points = chart.points;
  const lastIndex = points.length - 1;
  const [active, setActive] = React.useState<number | null>(null);
  const cursor = active != null && active >= 0 && active <= lastIndex ? active : lastIndex;
  const shown = points[cursor];

  // A `b` that never moves is the LINE the series is measured against; a `b` that moves is a
  // second series. Read off the data, never assumed — the shape carries both.
  const bs = points.map((point) => point.b);
  const firstB = bs.find((value) => value != null) ?? null;
  const reference = firstB != null && bs.every((value) => value === firstB) ? firstB : null;
  const bIsSeries = reference == null && bs.some((value) => value != null);

  const values = [...points.map((point) => point.a), ...bs.filter((v): v is number => v != null)];
  // The same scale the drawing has always used. A chart that re-bases to flatter its own
  // series is the failure this module exists to prevent, so the domain stays put.
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => (lastIndex > 0 ? (i / lastIndex) * 100 : 50);
  const y = (v: number) => 100 - ((v - min) / span) * 100;
  const line = (pick: (p: (typeof points)[number]) => number | null) =>
    points
      .map((point, i) => {
        const v = pick(point);
        return v == null ? null : `${x(i)},${y(v)}`;
      })
      .filter((s): s is string => s !== null)
      .join(' ');
  const projectedAt = chart.projected_from
    ? points.findIndex((point) => point.t === chart.projected_from)
    : -1;

  const plot = React.useRef<HTMLElement | null>(null);
  const dots = React.useRef<(HTMLButtonElement | null)[]>([]);
  const pickAt = (clientX: number) => {
    const el = plot.current;
    if (!el || lastIndex < 1) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    setActive(Math.min(lastIndex, Math.max(0, Math.round(ratio * lastIndex))));
  };
  const focusPoint = (to: number) => {
    const i = Math.min(lastIndex, Math.max(0, to));
    setActive(i);
    dots.current[i]?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      focusPoint(i + step);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusPoint(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusPoint(lastIndex);
    }
  };

  const secondLine =
    reference != null
      ? `${chart.b_label} ${fmt(reference)}`
      : shown.b != null
        ? `${chart.b_label} ${fmt(shown.b)}`
        : chart.b_label;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-3xs text-muted-foreground">{chart.a_label}</p>
          <p
            className="font-mono text-foreground text-sm tabular-nums"
            data-testid="rates-readout-value"
          >
            {fmt(shown.a)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xs text-muted-foreground" data-testid="rates-readout-day">
            {dayLabel(shown.t, DAY_SHORT)}
          </p>
          <p className="font-mono text-3xs text-muted-foreground tabular-nums">{secondLine}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {/* The value axis, named where it is read rather than in a legend somewhere else. */}
        <div className="flex w-12 shrink-0 flex-col justify-between text-right font-mono text-3xs text-muted-foreground tabular-nums">
          <span>{fmt(max)}</span>
          <span>{fmt(min)}</span>
        </div>
        {/* A figure rather than a labelled div: the region has to be announced when a reader
            tabs into the points, and a div with an aria-label alone is announced by nothing. */}
        <figure
          aria-label={`${chart.a_label}, ${dayLabel(points[0].t, DAY_SHORT)} to ${dayLabel(points[lastIndex].t, DAY_SHORT)}`}
          className="relative m-0 h-24 flex-1"
          onPointerLeave={() => setActive(null)}
          onPointerMove={(event) => pickAt(event.clientX)}
          ref={plot}
        >
          {/* The drawing is decorative: every figure in it is reachable as text below and as
              an accessible name on each point. */}
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <title>{`${chart.a_label} against ${chart.b_label}`}</title>
            {bIsSeries ? (
              <polyline
                className="text-muted-foreground"
                fill="none"
                points={line((point) => point.b)}
                stroke="currentColor"
                strokeDasharray="3 3"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <polyline
              className="text-primary"
              fill="none"
              points={line((point) => point.a)}
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {projectedAt >= 0 ? (
              <line
                className="text-muted-foreground/60"
                stroke="currentColor"
                strokeDasharray="2 2"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                x1={x(projectedAt)}
                x2={x(projectedAt)}
                y1={0}
                y2={100}
              />
            ) : null}
          </svg>

          {reference != null ? (
            <div
              className="-translate-y-1/2 pointer-events-none absolute inset-x-0 flex items-center"
              data-testid="rates-reference"
              style={{ top: `${y(reference)}%` }}
            >
              <span className="flex-1 border-muted-foreground/70 border-t border-dashed" />
              <span className="ml-1 whitespace-nowrap font-mono text-3xs text-muted-foreground tabular-nums">
                {chart.b_label} {fmt(reference)}
              </span>
            </div>
          ) : null}

          {points.map((point, i) => (
            <button
              aria-label={`${dayLabel(point.t, DAY_FULL)} — ${chart.a_label} ${fmt(point.a)}${
                point.b != null ? `, ${chart.b_label} ${fmt(point.b)}` : ''
              }`}
              className="-translate-x-1/2 -translate-y-1/2 absolute flex size-5 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-point={point.t}
              key={`${point.t}-${i}`}
              onBlur={() => setActive(null)}
              onFocus={() => setActive(i)}
              onKeyDown={(event) => onKeyDown(event, i)}
              ref={(el) => {
                dots.current[i] = el;
              }}
              style={{ left: `${x(i)}%`, top: `${y(point.a)}%` }}
              tabIndex={i === cursor ? 0 : -1}
              type="button"
            >
              {i === lastIndex ? (
                <motion.div
                  animate={reduce || active != null ? 'still' : 'breathing'}
                  className="pointer-events-none absolute size-2 rounded-full bg-primary"
                  initial="still"
                  variants={beaconVariants}
                />
              ) : null}
              <span
                className={cn(
                  'relative size-1.5 rounded-full bg-primary transition-transform duration-150',
                  i === cursor ? 'scale-150' : 'opacity-60',
                )}
              />
            </button>
          ))}
        </figure>
      </div>

      {/* WHEN. The window's own ends, so any figure above can be checked against a date. */}
      <div className="flex justify-between gap-2 pl-14 font-mono text-3xs text-muted-foreground tabular-nums">
        <span>{dayLabel(points[0].t, DAY_SHORT)}</span>
        <span>{dayLabel(points[lastIndex].t, DAY_SHORT)}</span>
      </div>

      {bIsSeries ? (
        <div className="flex flex-wrap items-baseline gap-x-3 text-3xs text-muted-foreground">
          <span>
            <span className="inline-block h-0.5 w-3 bg-primary align-middle" /> {chart.a_label}
          </span>
          <span>
            <span className="inline-block h-0.5 w-3 bg-muted-foreground align-middle" />{' '}
            {chart.b_label}
          </span>
        </div>
      ) : null}

      {chart.gap_per_day != null ? (
        <p className="text-2xs text-muted-foreground">
          gap{' '}
          <span className="font-mono font-semibold text-foreground">{fmt(chart.gap_per_day)}</span>{' '}
          a day
        </p>
      ) : null}
    </div>
  );
}

/**
 * An estimate with its uncertainty, against the line it has to beat.
 *
 * The shape carries no name for its value axis — only `unit` and `reference_label` — so the
 * axis is named by what the drawing actually reaches: its two ends, printed as money. The
 * two marks a reader can interrogate (the interval, and the reference) are buttons, so the
 * readout can be opened with a pointer or with the Tab key.
 */
function Interval({
  chart,
  currency,
}: {
  chart: Extract<AccountChart, { shape: 'interval' }>;
  currency: string | null;
}) {
  const fmt = fmtFor(chart.unit, currency);
  const max = Math.max(chart.high, chart.reference ?? 0) || 1;
  const left = (chart.low / max) * 100;
  const width = Math.max(4, ((chart.high - chart.low) / max) * 100);
  const [active, setActive] = React.useState<'band' | 'reference' | null>(null);

  const bounds = chart.no_results
    ? `at least ${fmt(chart.low)} — no results to divide by, so no upper bound`
    : `between ${fmt(chart.low)} and ${fmt(chart.high)}`;
  const bandReading = chart.estimate != null ? `${fmt(chart.estimate)}, ${bounds}` : bounds;
  const referenceLabel = chart.reference_label ?? 'reference';
  const referenceReading =
    chart.reference != null ? `${referenceLabel} ${fmt(chart.reference)}` : null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-foreground text-xs" data-testid="interval-readout">
          {active === 'reference' && referenceReading ? referenceReading : bandReading}
        </p>
        {chart.at_stake_per_day != null ? (
          <p className="shrink-0 text-3xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {fmt(chart.at_stake_per_day)}
            </span>{' '}
            a day at stake
          </p>
        ) : null}
      </div>

      <div className="relative h-11">
        <div className="absolute top-7 h-2 w-full rounded bg-muted-foreground/15" />
        <button
          aria-label={`the interval: ${bandReading}`}
          className="absolute top-6 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onBlur={() => setActive(null)}
          onFocus={() => setActive('band')}
          onPointerEnter={() => setActive('band')}
          onPointerLeave={() => setActive(null)}
          style={{ left: `${left}%`, width: `${width}%` }}
          type="button"
        >
          <span
            className={cn(
              'block h-4 rounded',
              chart.no_results ? 'bg-amber-500/60' : 'bg-primary/70',
              active === 'band' && 'ring-1 ring-foreground/50',
            )}
          />
        </button>
        {chart.estimate != null ? (
          <span
            aria-hidden
            className="-translate-x-1/2 absolute top-6 h-4 w-0.5 rounded bg-foreground"
            style={{ left: `${(chart.estimate / max) * 100}%` }}
          />
        ) : null}
        {chart.no_results ? (
          <span
            aria-hidden
            className="absolute top-6 text-foreground text-xs"
            style={{ left: `calc(${Math.min(96, left + width)}%)` }}
          >
            →
          </span>
        ) : null}
        {chart.reference != null ? (
          // The line, and identifiable as one: a dashed rule wearing its own name and value,
          // never a second bar a reader has to tell apart from the interval.
          <button
            aria-label={referenceReading ?? referenceLabel}
            className="-translate-x-1/2 absolute top-0 flex h-11 w-4 flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="interval-reference"
            onBlur={() => setActive(null)}
            onFocus={() => setActive('reference')}
            onPointerEnter={() => setActive('reference')}
            onPointerLeave={() => setActive(null)}
            style={{ left: `${(chart.reference / max) * 100}%` }}
            type="button"
          >
            <span
              className={cn(
                '-translate-x-1/2 absolute top-0 left-1/2 whitespace-nowrap font-mono text-3xs tabular-nums',
                active === 'reference' ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {referenceLabel} {fmt(chart.reference)}
            </span>
            <span className="mt-4 w-px flex-1 border-foreground/60 border-l border-dashed" />
          </button>
        ) : null}
      </div>

      {/* The axis, named by the two ends the drawing actually reaches. */}
      <div className="flex justify-between font-mono text-3xs text-muted-foreground tabular-nums">
        <span>{fmt(0)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}

function Headroom({
  chart,
  currency,
}: {
  chart: Extract<AccountChart, { shape: 'headroom' }>;
  currency: string | null;
}) {
  const fmt = fmtFor(chart.unit, currency);
  return (
    <div className="space-y-2.5">
      {chart.gauges.map((gauge) => {
        const filled = gauge.ceiling > 0 ? Math.min(100, (gauge.value / gauge.ceiling) * 100) : 0;
        const good = gauge.good_when_low
          ? gauge.value <= gauge.ceiling
          : gauge.value >= gauge.ceiling;
        return (
          <div className="space-y-1" key={gauge.label}>
            <div className="flex items-baseline justify-between text-2xs">
              <span className="text-muted-foreground">{gauge.label}</span>
              <span className="font-mono tabular-nums text-foreground">
                {fmt(gauge.value)} / {fmt(gauge.ceiling)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-muted-foreground/15">
              <div
                className={cn('h-full rounded', good ? 'bg-primary/70' : 'bg-amber-500/70')}
                style={{ width: `${filled}%` }}
              />
            </div>
          </div>
        );
      })}
      {chart.step_per_day != null ? (
        <p className="text-2xs text-muted-foreground">
          room for{' '}
          <span className="font-mono font-semibold text-foreground">
            {formatCurrency(chart.step_per_day, currency)}
          </span>{' '}
          a day
        </p>
      ) : null}
    </div>
  );
}

function Quadrant({ chart }: { chart: Extract<AccountChart, { shape: 'quadrant' }> }) {
  const xs = chart.points.map((p) => p.x);
  const ys = chart.points.map((p) => p.y);
  const xMax = Math.max(...xs, chart.x_split) || 1;
  const yMax = Math.max(...ys, chart.y_split) || 1;
  const inFocus = (p: { x: number; y: number }) =>
    chart.focus_corner === 'x_high_y_low'
      ? p.x > chart.x_split && p.y < chart.y_split
      : chart.focus_corner === 'xy_high'
        ? p.x > chart.x_split && p.y > chart.y_split
        : chart.focus_corner === 'x_low_y_high'
          ? p.x < chart.x_split && p.y > chart.y_split
          : p.x < chart.x_split && p.y < chart.y_split;
  return (
    <div className="space-y-1.5">
      <div className="relative h-32 w-full rounded border border-border/60">
        <div
          className="absolute top-0 bottom-0 border-foreground/30 border-l border-dashed"
          style={{ left: `${(chart.x_split / xMax) * 100}%` }}
        />
        <div
          className="absolute right-0 left-0 border-foreground/30 border-t border-dashed"
          style={{ top: `${100 - (chart.y_split / yMax) * 100}%` }}
        />
        {chart.points.map((point) => (
          <span
            className={cn(
              'absolute size-2 rounded-full',
              inFocus(point) ? 'bg-amber-500' : 'bg-muted-foreground/40',
            )}
            key={`${point.label}-${point.x}-${point.y}`}
            style={{
              left: `calc(${(point.x / xMax) * 100}% - 4px)`,
              top: `calc(${100 - (point.y / yMax) * 100}% - 4px)`,
            }}
            title={`${point.label} · ${chart.x_label} ${point.x} · ${chart.y_label} ${point.y}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-3xs text-muted-foreground">
        <span>{chart.x_label} →</span>
        <span>↑ {chart.y_label}</span>
      </div>
    </div>
  );
}

/** Draws whichever shape the detector produced. */
export function AccountChartView({
  chart,
  currency,
}: {
  chart: AccountChart;
  currency: string | null;
}) {
  switch (chart.shape) {
    case 'transfer':
      return <Transfer chart={chart} currency={currency} />;
    case 'threshold':
      return <Threshold chart={chart} currency={currency} />;
    case 'share':
      return <Share chart={chart} currency={currency} />;
    case 'rates':
      return <Rates chart={chart} currency={currency} />;
    case 'interval':
      return <Interval chart={chart} currency={currency} />;
    case 'headroom':
      return <Headroom chart={chart} currency={currency} />;
    case 'quadrant':
      return <Quadrant chart={chart} />;
    default:
      return null;
  }
}
