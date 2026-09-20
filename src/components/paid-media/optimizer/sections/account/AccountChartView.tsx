'use client';

// The seven shapes, drawn.
//
// Each one renders ONLY the figures the detector put in the chart — no second reading of the
// data, no scale invented to make a bar look better. Every axis label names a value the
// drawing actually reaches, and text takes its colour from the theme tokens so both themes
// read. Plain SVG and flex: a library here would buy nothing and cost a runtime fetch the
// artifact CSP would refuse anyway.

import type { AccountChart } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';

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

function Rates({
  chart,
  currency,
}: {
  chart: Extract<AccountChart, { shape: 'rates' }>;
  currency: string | null;
}) {
  const fmt = fmtFor(chart.unit, currency);
  const values = chart.points.flatMap((p) => [p.a, p.b ?? p.a]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => (chart.points.length > 1 ? (i / (chart.points.length - 1)) * 100 : 50);
  const y = (v: number) => 100 - ((v - min) / span) * 100;
  const line = (pick: (p: (typeof chart.points)[number]) => number | null) =>
    chart.points
      .map((p, i) => {
        const v = pick(p);
        return v == null ? null : `${x(i)},${y(v)}`;
      })
      .filter((s): s is string => s !== null)
      .join(' ');
  const projectedAt = chart.projected_from
    ? chart.points.findIndex((p) => p.t === chart.projected_from)
    : -1;

  return (
    <div className="space-y-1.5">
      {/* viewBox leaves no room for labels on purpose: they are DOM text beside it, so they
          can never be clipped by the drawing's own bounds. */}
      <svg aria-hidden className="h-24 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <title>{`${chart.a_label} against ${chart.b_label}`}</title>
        <polyline
          fill="none"
          points={line((p) => p.b)}
          stroke="currentColor"
          strokeDasharray="3 3"
          strokeWidth="1.5"
          className="text-muted-foreground"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          fill="none"
          points={line((p) => p.a)}
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary"
          vectorEffect="non-scaling-stroke"
        />
        {projectedAt >= 0 ? (
          <line
            stroke="currentColor"
            strokeDasharray="2 2"
            strokeWidth="1"
            x1={x(projectedAt)}
            x2={x(projectedAt)}
            y1={0}
            y2={100}
            className="text-muted-foreground/60"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-3xs text-muted-foreground">
        <span>
          <span className="inline-block h-0.5 w-3 bg-primary align-middle" /> {chart.a_label}
        </span>
        <span>
          <span className="inline-block h-0.5 w-3 bg-muted-foreground align-middle" />{' '}
          {chart.b_label}
        </span>
        <span className="font-mono tabular-nums">
          {fmt(min)} – {fmt(max)}
        </span>
      </div>
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
  return (
    <div className="space-y-2">
      <div className="relative h-10">
        <div className="absolute top-4 h-2 w-full rounded bg-muted-foreground/15" />
        <div
          className={cn(
            'absolute top-3.5 h-3 rounded',
            chart.no_results ? 'bg-amber-500/60' : 'bg-primary/70',
          )}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        {chart.no_results ? (
          <span
            className="absolute top-3 text-foreground text-xs"
            style={{ left: `calc(${Math.min(96, left + width)}% )` }}
          >
            →
          </span>
        ) : null}
        {chart.reference != null ? (
          <div
            className="absolute top-2 h-6 border-foreground/60 border-l"
            style={{ left: `${(chart.reference / max) * 100}%` }}
          >
            <span className="-top-3 absolute whitespace-nowrap text-3xs text-muted-foreground">
              {chart.reference_label} {fmt(chart.reference)}
            </span>
          </div>
        ) : null}
      </div>
      <p className="text-2xs text-muted-foreground">
        {chart.no_results
          ? 'no results yet, so the true cost has no upper bound to draw'
          : `between ${fmt(chart.low)} and ${fmt(chart.high)}`}
        {chart.at_stake_per_day != null ? (
          <>
            {' · '}
            <span className="font-mono font-semibold text-foreground">
              {fmt(chart.at_stake_per_day)}
            </span>{' '}
            a day at stake
          </>
        ) : null}
      </p>
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
