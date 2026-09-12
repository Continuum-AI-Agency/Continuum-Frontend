// A dependency-free inline sparkline: one polyline, an area under it, and a dot on the
// last point. Small enough to sit inside a KPI tile and render in tests without a
// ResizeObserver, unlike the visx chart kit.

import { cn } from '@/lib/utils';

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  /** CSS colour; defaults to the primary data-viz colour. */
  stroke?: string;
  className?: string;
  /** Accessible summary, e.g. "Daily spend, last 7 days". */
  label?: string;
};

export function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const pad = 2;
  return values
    .map((value, index) => {
      const x = values.length > 1 ? index * stepX : width / 2;
      const y = height - pad - ((value - min) / span) * (height - pad * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function Sparkline({
  values,
  width = 96,
  height = 28,
  stroke = 'var(--chart-1)',
  className,
  label,
}: SparklineProps) {
  const path = sparklinePath(values, width, height);
  if (!path) return null;
  const last = values[values.length - 1];
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const lastX = values.length > 1 ? width : width / 2;
  const lastY = height - 2 - ((last - min) / span) * (height - 4);
  return (
    <svg
      aria-label={label}
      className={cn('block overflow-visible', className)}
      height={height}
      role={label ? 'img' : undefined}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <path d={`${path} L${lastX},${height} L0,${height} Z`} fill={stroke} fillOpacity={0.12} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <circle cx={lastX} cy={lastY} fill={stroke} r={2} />
    </svg>
  );
}
