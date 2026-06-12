"use client";

// Lightweight inline trend line for dense cards. Generalized from the paid-media
// MetricSparkline so it works on any numeric series without paid-media types.
// Renders a flat baseline when there are fewer than two points.

import * as React from "react";

import { cn } from "@/lib/utils";

export type SparklineTone = "positive" | "negative" | "flat";

const TONE_STROKE: Record<SparklineTone, string> = {
  positive: "oklch(72% 0.16 154)",
  negative: "oklch(64% 0.20 28)",
  flat: "oklch(60% 0.02 250)",
};

// Pure geometry for the polyline. Returns null when there are fewer than two
// finite points (the component then renders a flat baseline). Kept separate so
// it is unit-testable without a DOM.
export function sparklinePoints(
  values: number[],
  width: number,
  height: number
): { points: string; lastX: number; lastY: number } | null {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (clean.length < 2) return null;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const stepX = width / (clean.length - 1);
  const yFor = (value: number) => height - ((value - min) / span) * (height - 3) - 1.5;

  const points = clean.map((value, index) => `${(index * stepX).toFixed(2)},${yFor(value).toFixed(2)}`).join(" ");
  return { points, lastX: (clean.length - 1) * stepX, lastY: yFor(clean[clean.length - 1]) };
}

type SparklineProps = {
  values: number[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
};

export function Sparkline({
  values,
  tone = "flat",
  width = 120,
  height = 28,
  className,
  ariaLabel = "trend",
}: SparklineProps) {
  const geometry = React.useMemo(() => sparklinePoints(values, width, height), [values, width, height]);

  if (!geometry) {
    return (
      <div
        className={cn("inline-flex items-center text-muted-foreground/50", className)}
        style={{ width, height }}
        aria-hidden
      >
        <span className="block h-px w-full bg-current/40" />
      </div>
    );
  }

  const { points, lastX, lastY } = geometry;
  const stroke = TONE_STROKE[tone];

  return (
    <svg
      className={cn("inline-block align-middle", className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r={2} fill={stroke} />
    </svg>
  );
}
