'use client';

// A month-by-month chart with ONE value axis (docs/05: one axis per chart). Bars and lines
// share that axis; a bar can be solid (real), faded (month still open) or outlined (goal),
// and a line can be dashed (floor, ceiling, goal). Hand-built SVG rather than the BKLit kit:
// the pilot needs overlaid bars in one slot (a goal outline over a partial month), which the
// kit's grouped/stacked bars do not express. Each mark carries a <title> for its tooltip and
// the legend names every series in words, so nothing is read from colour alone.

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type BarStyle = 'solid' | 'faded' | 'outline';

export type ChartSeries =
  | {
      kind: 'bar';
      label: string;
      color: string;
      values: readonly (number | null)[];
      style?: BarStyle;
    }
  | {
      kind: 'line';
      label: string;
      color: string;
      values: readonly (number | null)[];
      dashed?: boolean;
    };

export type BarLayout = 'overlay' | 'grouped' | 'stacked';

type ColumnChartProps = {
  title: string;
  categories: readonly string[];
  series: readonly ChartSeries[];
  formatValue: (value: number) => string;
  layout?: BarLayout;
  height?: number;
  /** Fixed top of the axis (e.g. 100 for a percentage). */
  maxValue?: number;
  /** Extra tooltip line per category (e.g. "% del total"). */
  categoryNote?: (index: number) => string | null;
};

const MARGIN = { top: 12, right: 12, bottom: 28, left: 52 };
const FALLBACK_WIDTH = 640;

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** 4–5 round ticks from zero up past `max`. */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let tick = 0; tick < max + step * 0.999; tick += step) ticks.push(tick);
  return ticks;
}

function stackedTop(series: readonly ChartSeries[], index: number): number {
  return series.filter((s) => s.kind === 'bar').reduce((sum, s) => sum + (s.values[index] ?? 0), 0);
}

function dataMax(series: readonly ChartSeries[], categories: number, layout: BarLayout): number {
  let max = 0;
  for (let index = 0; index < categories; index++) {
    if (layout === 'stacked') max = Math.max(max, stackedTop(series, index));
    for (const s of series) max = Math.max(max, s.values[index] ?? 0);
  }
  return max;
}

export function ColumnChart({
  title,
  categories,
  series,
  formatValue,
  layout = 'overlay',
  height = 240,
  maxValue,
  categoryNote,
}: ColumnChartProps) {
  const { ref, width } = useMeasuredWidth();
  const ticks = niceTicks(maxValue ?? dataMax(series, categories.length, layout));
  const top = maxValue ?? ticks[ticks.length - 1] ?? 1;
  const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const band = plotWidth / Math.max(1, categories.length);
  const y = (value: number) => MARGIN.top + plotHeight - (plotHeight * value) / top;
  const bars = series.filter((s) => s.kind === 'bar');
  const lines = series.filter((s) => s.kind === 'line');
  const barWidth = Math.min(34, band * 0.62);
  const groupedWidth = barWidth / Math.max(1, layout === 'grouped' ? bars.length : 1);
  const labelEvery = Math.ceil(categories.length / Math.max(1, Math.floor(plotWidth / 44)));

  const tooltip = (index: number) => {
    const rows = series
      .filter((s) => s.values[index] != null)
      .map((s) => `${s.label}: ${formatValue(s.values[index] as number)}`);
    const note = categoryNote?.(index);
    return [categories[index], ...rows, ...(note ? [note] : [])].join('\n');
  };

  return (
    <figure className="m-0 min-w-0 space-y-2">
      <div ref={ref} className="w-full">
        <svg
          aria-label={title}
          className="block w-full overflow-visible"
          height={height}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                stroke="var(--border)"
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="fill-muted-foreground font-mono text-[11px]"
                dominantBaseline="middle"
                textAnchor="end"
                x={MARGIN.left - 6}
                y={y(tick)}
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {categories.map((category, index) => {
            const center = MARGIN.left + band * index + band / 2;
            let stackBase = 0;
            return (
              <g data-category={category} key={`${index}-${category}`}>
                <title>{tooltip(index)}</title>
                <rect
                  fill="transparent"
                  height={plotHeight}
                  width={band}
                  x={center - band / 2}
                  y={MARGIN.top}
                />
                {bars.map((bar, barIndex) => {
                  const value = bar.values[index];
                  if (value == null) return null;
                  const style = bar.style ?? 'solid';
                  const x =
                    layout === 'grouped'
                      ? center - barWidth / 2 + groupedWidth * barIndex
                      : center - barWidth / 2;
                  const base = layout === 'stacked' ? stackBase : 0;
                  if (layout === 'stacked') stackBase += value;
                  const yTop = y(base + value);
                  return (
                    <rect
                      data-series={bar.label}
                      fill={style === 'outline' ? 'transparent' : bar.color}
                      fillOpacity={style === 'faded' ? 0.55 : 1}
                      height={Math.max(0, y(base) - yTop)}
                      key={bar.label}
                      rx={3}
                      stroke={style === 'outline' ? bar.color : 'none'}
                      strokeWidth={style === 'outline' ? 2 : 0}
                      width={layout === 'grouped' ? groupedWidth - 2 : barWidth}
                      x={x}
                      y={yTop}
                    />
                  );
                })}
                {index % labelEvery === 0 ? (
                  <text
                    className="fill-muted-foreground text-[11px]"
                    textAnchor="middle"
                    x={center}
                    y={height - 8}
                  >
                    {category}
                  </text>
                ) : null}
              </g>
            );
          })}
          {lines.map((line) => {
            const points = line.values.map((value, index) =>
              value == null ? null : { x: MARGIN.left + band * index + band / 2, y: y(value) },
            );
            const segments: string[] = [];
            let current = '';
            for (const point of points) {
              if (!point) {
                if (current) segments.push(current);
                current = '';
                continue;
              }
              current += `${current ? 'L' : 'M'}${point.x},${point.y}`;
            }
            if (current) segments.push(current);
            return (
              <g data-series={line.label} key={line.label} pointerEvents="none">
                {segments.map((d) => (
                  <path
                    d={d}
                    fill="none"
                    key={d}
                    stroke={line.color}
                    strokeDasharray={line.dashed ? '5 4' : undefined}
                    strokeWidth={2}
                  />
                ))}
                {points.map((point, index) =>
                  point ? (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill={line.color}
                      // biome-ignore lint/suspicious/noArrayIndexKey: one point per category slot
                      key={index}
                      r={line.dashed ? 2 : 3}
                      stroke="var(--card)"
                    />
                  ) : null,
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <span className="inline-flex items-center gap-1.5" key={s.label}>
            <ChartSwatch series={s} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function ChartSwatch({ series }: { series: ChartSeries }) {
  if (series.kind === 'line') {
    return (
      <svg aria-hidden="true" height="10" width="16">
        <line
          stroke={series.color}
          strokeDasharray={series.dashed ? '4 3' : undefined}
          strokeWidth="2"
          x1="0"
          x2="16"
          y1="5"
          y2="5"
        />
      </svg>
    );
  }
  const style = series.style ?? 'solid';
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2.5 rounded-sm', style === 'outline' && 'border-2')}
      style={{
        background: style === 'outline' ? 'transparent' : series.color,
        borderColor: series.color,
        opacity: style === 'faded' ? 0.55 : 1,
      }}
    />
  );
}
