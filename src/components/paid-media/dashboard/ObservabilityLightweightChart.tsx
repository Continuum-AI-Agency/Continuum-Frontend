"use client";

import * as React from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export type ObservabilityChartPoint = {
  time: UTCTimestamp;
  value: number;
};

export type ObservabilityChartSeries = {
  id: string;
  label: string;
  color: string;
  points: ObservabilityChartPoint[];
  variant?: "area" | "line";
  emphasized?: boolean;
  dashed?: boolean;
};

type ObservabilityLightweightChartProps = {
  series: ObservabilityChartSeries[];
  className?: string;
  compact?: boolean;
};

type SupportedSeriesType = "Area" | "Line";

type RegisteredSeries = {
  api: ISeriesApi<SupportedSeriesType>;
  variant: "area" | "line";
};

function toRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(14,165,233,${alpha})`;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r},${g},${b},${alpha})`;
}

function sanitizePoints(points: ObservabilityChartPoint[]): ObservabilityChartPoint[] {
  const byTime = new Map<number, number>();

  points.forEach((point) => {
    if (!Number.isFinite(point.value)) return;
    byTime.set(Number(point.time), point.value);
  });

  return Array.from(byTime.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

export function ObservabilityLightweightChart({
  series,
  className,
  compact = false,
}: ObservabilityLightweightChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesMapRef = React.useRef<Map<string, RegisteredSeries>>(new Map());
  const { appearance } = useTheme();
  const isDark = appearance === "dark";

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#8f9ab2" : "#5d6679",
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        fontSize: compact ? 10 : 11,
        attributionLogo: false,
      },
      grid: compact
        ? {
            vertLines: { visible: false },
            horzLines: { visible: false },
          }
        : {
            vertLines: { visible: false },
            horzLines: { color: isDark ? "rgba(71, 85, 105, 0.25)" : "rgba(148, 163, 184, 0.25)" },
          },
      timeScale: {
        visible: !compact,
        timeVisible: true,
        secondsVisible: false,
        borderVisible: !compact,
        borderColor: isDark ? "rgba(51, 65, 85, 0.5)" : "rgba(203, 213, 225, 0.8)",
        ticksVisible: !compact,
      },
      rightPriceScale: {
        visible: !compact,
        borderVisible: !compact,
        borderColor: isDark ? "rgba(51, 65, 85, 0.5)" : "rgba(203, 213, 225, 0.8)",
        scaleMargins: compact
          ? { top: 0.16, bottom: 0.16 }
          : { top: 0.12, bottom: 0.12 },
      },
      leftPriceScale: { visible: false },
      crosshair: compact
        ? {
            mode: CrosshairMode.Hidden,
          }
        : {
            mode: CrosshairMode.Normal,
            vertLine: {
              color: isDark ? "rgba(148, 163, 184, 0.55)" : "rgba(71, 85, 105, 0.45)",
              style: LineStyle.Dashed,
              width: 1,
            },
            horzLine: {
              color: isDark ? "rgba(148, 163, 184, 0.55)" : "rgba(71, 85, 105, 0.45)",
              style: LineStyle.Dashed,
              width: 1,
            },
          },
      handleScroll: !compact,
      handleScale: !compact,
    });
    container.querySelectorAll("#tv-attr-logo").forEach((node) => node.remove());

    chartRef.current = chart;

    return () => {
      seriesMapRef.current.clear();
      chart.remove();
      chartRef.current = null;
    };
  }, [compact, isDark]);

  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const activeIds = new Set(series.map((entry) => entry.id));

    seriesMapRef.current.forEach((registered, id) => {
      if (activeIds.has(id)) return;
      chart.removeSeries(registered.api);
      seriesMapRef.current.delete(id);
    });

    series.forEach((entry, index) => {
      const variant = entry.variant ?? (index === 0 ? "area" : "line");
      const isPrimary = entry.emphasized ?? index === 0;
      const lineColor = entry.color;
      const topColor = toRgba(lineColor, isPrimary ? 0.22 : 0.14);
      const bottomColor = toRgba(lineColor, 0.01);

      const existing = seriesMapRef.current.get(entry.id);
      if (existing && existing.variant !== variant) {
        chart.removeSeries(existing.api);
        seriesMapRef.current.delete(entry.id);
      }

      let registered = seriesMapRef.current.get(entry.id);
      if (!registered) {
        const api =
          variant === "area"
            ? chart.addSeries(AreaSeries, {
                lineColor,
                topColor,
                bottomColor,
                lineType: LineType.WithSteps,
                lineWidth: isPrimary ? 2 : 1,
                crosshairMarkerVisible: !compact,
                lastValueVisible: !compact,
                priceLineVisible: false,
              })
            : chart.addSeries(LineSeries, {
                color: lineColor,
                lineType: LineType.WithSteps,
                lineStyle: entry.dashed ? LineStyle.Dashed : LineStyle.Solid,
                lineWidth: isPrimary ? 2 : 1,
                crosshairMarkerVisible: !compact,
                lastValueVisible: !compact,
                priceLineVisible: false,
              });

        registered = { api, variant };
        seriesMapRef.current.set(entry.id, registered);
      }

      if (registered.variant === "area") {
        registered.api.applyOptions({
          lineColor,
          topColor,
          bottomColor,
          lineType: LineType.WithSteps,
          lineWidth: isPrimary ? 2 : 1,
        });
      } else {
        registered.api.applyOptions({
          color: lineColor,
          lineType: LineType.WithSteps,
          lineStyle: entry.dashed ? LineStyle.Dashed : LineStyle.Solid,
          lineWidth: isPrimary ? 2 : 1,
        });
      }

      registered.api.setData(sanitizePoints(entry.points));
    });

    chart.timeScale().fitContent();
  }, [compact, series]);

  return <div ref={containerRef} className={cn("h-full w-full [&_a#tv-attr-logo]:hidden", className)} />;
}
