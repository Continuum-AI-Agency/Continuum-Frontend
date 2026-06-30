// Shared organic-analytics number/percent/date formatters. Extracted from
// OrganicMetricsDashboard so the post cards (StatTile, DeltaBadge, PostQuickLook)
// and the dashboard render numbers identically. Compact formatting reuses the
// canonical jaina formatValue helper.

import { formatValue } from "@/lib/jaina/formatValue";

export type TrendDirection = "up" | "down" | "flat";
export type DeltaTone = "positive" | "negative" | "flat";

// Full grouped number (e.g. 12,431). "-" when absent.
export function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat().format(value);
}

// Compact number (e.g. 12.4K). "-" when absent.
export function formatCompactNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return formatValue(value, "compact");
}

// A 0-100 rate rendered as a percent (e.g. 4.1%). "-" when absent.
export function formatRate(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return formatValue(value, "percent");
}

// Signed percentage change (e.g. "+12.3%). The window it describes is supplied
// by the adjacent label; the account KPI cards pair this with "vs previous
// period" since the headline comparison is period-over-period.
export function formatPercentChange(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "--";
  const magnitude = `${Math.abs(value).toFixed(1)}%`;
  return `${value >= 0 ? "+" : "-"}${magnitude}`;
}

export function trendDirection(value: number | undefined): TrendDirection {
  if (value === undefined || Number.isNaN(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

export function deltaTone(value: number | undefined): DeltaTone {
  const direction = trendDirection(value);
  if (direction === "up") return "positive";
  if (direction === "down") return "negative";
  return "flat";
}

export function formatShortDate(date: string | undefined): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
