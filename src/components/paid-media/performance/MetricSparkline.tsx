"use client";

import * as React from "react";

import type { DailyMetric } from "@/types/timeline";
import type { CampaignPerformanceMetricKey } from "@/lib/paid-media/performance-types";
import { cn } from "@/lib/utils";

type MetricSparklineProps = {
  trends: DailyMetric[] | undefined;
  metric: CampaignPerformanceMetricKey;
  tone?: "positive" | "negative" | "flat";
  width?: number;
  height?: number;
  className?: string;
};

// Maps each chartable campaign metric onto its per-day field. GA4 keys
// (gaSessions/gaConversions) are brand/property-level, absent from the per-campaign
// DailyMetric series and never selectable in the matrix — they map to nothing and
// fall through to the flat placeholder below.
const TREND_FIELD_BY_METRIC: Partial<Record<CampaignPerformanceMetricKey, keyof DailyMetric>> = {
  spend: "spend",
  roas: "roas",
  ctr: "ctr_pct",
  cpc: "cpc",
  cpa: "cpa",
  impressions: "impressions",
  clicks: "clicks",
};

const TONE_STROKE: Record<"positive" | "negative" | "flat", string> = {
  positive: "oklch(72% 0.16 154)",
  negative: "oklch(64% 0.20 28)",
  flat: "oklch(60% 0.02 250)",
};

export function MetricSparkline({
  trends,
  metric,
  tone = "flat",
  width = 80,
  height = 20,
  className,
}: MetricSparklineProps) {
  const field = TREND_FIELD_BY_METRIC[metric];

  const values = React.useMemo(() => {
    if (!trends || !field || trends.length < 2) return [];
    return trends
      .map((point) => point[field])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  }, [trends, field]);

  if (values.length < 2) {
    return (
      <div
        className={cn("inline-flex items-center text-muted-foreground/60", className)}
        style={{ width, height }}
        aria-hidden
      >
        <span className="block h-px w-full bg-current/30" />
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length === 1 ? 0 : width / (values.length - 1);

  const points = values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / span) * (height - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const lastIndex = values.length - 1;
  const lastX = lastIndex * stepX;
  const lastY = height - ((values[lastIndex] - min) / span) * (height - 2) - 1;

  return (
    <svg
      className={cn("inline-block align-middle", className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${metric} trend`}
    >
      <polyline
        fill="none"
        stroke={TONE_STROKE[tone]}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r={1.5} fill={TONE_STROKE[tone]} />
    </svg>
  );
}
