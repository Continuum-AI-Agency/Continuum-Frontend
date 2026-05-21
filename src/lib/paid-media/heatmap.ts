import type { CampaignPerformanceMetricKey } from "@/lib/paid-media/performance-types";

export type MatrixMetricDirection = "higher" | "lower" | "neutral";

export type MatrixMetric = {
  key: CampaignPerformanceMetricKey;
  label: string;
  shortLabel: string;
  direction: MatrixMetricDirection;
};

export const MATRIX_METRICS: MatrixMetric[] = [
  { key: "spend", label: "Spend", shortLabel: "Spend", direction: "neutral" },
  { key: "roas", label: "ROAS", shortLabel: "ROAS", direction: "higher" },
  { key: "ctr", label: "CTR", shortLabel: "CTR", direction: "higher" },
  { key: "cpc", label: "CPC", shortLabel: "CPC", direction: "lower" },
  { key: "cpa", label: "CPA", shortLabel: "CPA", direction: "lower" },
  { key: "impressions", label: "Impressions", shortLabel: "Impr.", direction: "neutral" },
  { key: "clicks", label: "Clicks", shortLabel: "Clicks", direction: "neutral" },
];

export type HeatmapPaint = { light: string; dark: string };

export function percentile(values: number[], value: number): number {
  const sorted = values.filter(Number.isFinite).toSorted((left, right) => left - right);
  if (sorted.length <= 1) return 0.5;
  const index = sorted.findLastIndex((candidate) => candidate <= value);
  return Math.max(0, Math.min(1, index / (sorted.length - 1)));
}

export function heatmapPaint(metric: MatrixMetric, percentileRank: number): HeatmapPaint {
  if (metric.direction === "neutral") {
    const lightL = 96 - percentileRank * 16;
    const darkL = 18 + percentileRank * 12;
    return {
      light: `oklch(${lightL}% 0.018 250)`,
      dark: `oklch(${darkL}% 0.025 250)`,
    };
  }

  const score = metric.direction === "lower" ? 1 - percentileRank : percentileRank;

  if (score >= 0.72) {
    return {
      light: `oklch(${94 - score * 12}% 0.075 154)`,
      dark: `oklch(${24 + score * 14}% 0.11 154)`,
    };
  }
  if (score <= 0.28) {
    return {
      light: `oklch(${96 - (1 - score) * 12}% 0.075 28)`,
      dark: `oklch(${24 + (1 - score) * 14}% 0.11 28)`,
    };
  }
  return {
    light: "oklch(96% 0.012 95)",
    dark: "oklch(26% 0.025 95)",
  };
}

export function paintToStyle(paint: HeatmapPaint): {
  "--hm-bg-light": string;
  "--hm-bg-dark": string;
} {
  return { "--hm-bg-light": paint.light, "--hm-bg-dark": paint.dark };
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CURRENCY_FORMATTER_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const STANDARD_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number): string {
  return value >= 100 ? CURRENCY_FORMATTER.format(value) : CURRENCY_FORMATTER_PRECISE.format(value);
}

export function formatCompactNumber(value: number): string {
  return value >= 100_000
    ? COMPACT_NUMBER_FORMATTER.format(value)
    : STANDARD_NUMBER_FORMATTER.format(value);
}

export function formatMetric(
  metric: CampaignPerformanceMetricKey,
  value: number | undefined
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (metric === "spend" || metric === "cpc" || metric === "cpa") return formatCurrency(value);
  if (metric === "roas") return value.toFixed(2);
  if (metric === "ctr") return `${value.toFixed(2)}%`;
  return formatCompactNumber(value);
}

export function formatDeltaPct(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? "+" : ""}${rounded}%`;
}

export function getMetric(key: CampaignPerformanceMetricKey): MatrixMetric {
  const found = MATRIX_METRICS.find((metric) => metric.key === key);
  if (!found) {
    return { key, label: key.toUpperCase(), shortLabel: key.toUpperCase(), direction: "neutral" };
  }
  return found;
}

export function deltaTone(
  metric: MatrixMetric,
  deltaPct: number | undefined
): "positive" | "negative" | "flat" {
  if (typeof deltaPct !== "number" || !Number.isFinite(deltaPct) || Math.abs(deltaPct) < 0.5) {
    return "flat";
  }
  if (metric.direction === "neutral") return deltaPct > 0 ? "positive" : "negative";
  const isUp = deltaPct > 0;
  const isHigherBetter = metric.direction === "higher";
  return isUp === isHigherBetter ? "positive" : "negative";
}
