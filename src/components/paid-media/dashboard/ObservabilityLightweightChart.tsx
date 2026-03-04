"use client";

import * as React from "react";
import {
  ColorType,
  createSeriesMarkers,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type Time,
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
  markers?: ObservabilityChartMarker[];
  variant?: "line";
  emphasized?: boolean;
  dashed?: boolean;
};

export type ObservabilityChartMarker = {
  id: string;
  time: UTCTimestamp;
  label: string;
  detail?: string;
  color?: string;
  text?: string;
  shape?: "circle" | "square" | "arrowUp" | "arrowDown";
  position?: "aboveBar" | "belowBar" | "inBar";
};

type ObservabilityLightweightChartProps = {
  series: ObservabilityChartSeries[];
  className?: string;
  compact?: boolean;
};

type SupportedSeriesType = "Line";

type RegisteredSeries = {
  api: ISeriesApi<SupportedSeriesType, Time>;
  markersApi: ISeriesMarkersPluginApi<Time>;
};

type HoverState = {
  x: number;
  y: number;
  timeLabel: string;
  rows: Array<{ id: string; label: string; color: string; value: string }>;
  markerLabel?: string;
  markerDetail?: string;
};

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
  const markerMetaRef = React.useRef<Map<string, { label: string; detail?: string }>>(new Map());
  const [hover, setHover] = React.useState<HoverState | null>(null);
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
      markerMetaRef.current.clear();
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

    markerMetaRef.current.clear();
    series.forEach((entry, index) => {
      const isPrimary = entry.emphasized ?? index === 0;
      const lineColor = entry.color;

      let registered = seriesMapRef.current.get(entry.id);
      if (!registered) {
        const api = chart.addSeries(LineSeries, {
          color: lineColor,
          lineType: LineType.Curved,
          lineStyle: entry.dashed ? LineStyle.Dashed : LineStyle.Solid,
          lineWidth: isPrimary ? 2 : 1,
          pointMarkersVisible: true,
          pointMarkersRadius: compact ? 1.5 : 2.25,
          crosshairMarkerVisible: !compact,
          lastValueVisible: !compact,
          priceLineVisible: false,
        });

        const markersApi = createSeriesMarkers(api, []);
        registered = { api, markersApi };
        seriesMapRef.current.set(entry.id, registered);
      }

      registered.api.applyOptions({
        color: lineColor,
        lineType: LineType.Curved,
        lineStyle: entry.dashed ? LineStyle.Dashed : LineStyle.Solid,
        lineWidth: isPrimary ? 2 : 1,
        pointMarkersVisible: true,
        pointMarkersRadius: compact ? 1.5 : 2.25,
      });

      registered.api.setData(sanitizePoints(entry.points));

      const markers = (entry.markers ?? []).map((marker) => {
        const markerId = `${entry.id}::${marker.id}`;
        markerMetaRef.current.set(markerId, {
          label: marker.label,
          detail: marker.detail,
        });
        return {
          id: markerId,
          time: marker.time,
          position: marker.position ?? "aboveBar",
          shape: marker.shape ?? "square",
          color: marker.color ?? entry.color,
          text: marker.text ?? "F",
        };
      });
      registered.markersApi.setMarkers(markers);
    });

    chart.timeScale().fitContent();
  }, [compact, series]);

  React.useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container || compact) {
      setHover(null);
      return;
    }

    const handleMove = (param: MouseEventParams<Time>) => {
      if (
        !param.point ||
        param.time === undefined ||
        param.point.x < 0 ||
        param.point.y < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y > container.clientHeight
      ) {
        setHover(null);
        return;
      }

      const rows = series
        .map((entry) => {
          const registered = seriesMapRef.current.get(entry.id);
          if (!registered) return null;
          const data = param.seriesData.get(registered.api) as { value?: number; close?: number } | undefined;
          const value = typeof data?.value === "number" ? data.value : data?.close;
          if (typeof value !== "number" || !Number.isFinite(value)) return null;
          return {
            id: entry.id,
            label: entry.label,
            color: entry.color,
            value: value.toLocaleString("en-US", { maximumFractionDigits: 2 }),
          };
        })
        .filter((row): row is { id: string; label: string; color: string; value: string } => Boolean(row));

      const markerInfo = param.hoveredObjectId
        ? markerMetaRef.current.get(String(param.hoveredObjectId))
        : undefined;
      if (rows.length === 0 && !markerInfo) {
        setHover(null);
        return;
      }

      const timeLabel =
        typeof param.time === "number"
          ? new Date(param.time * 1000).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : String(param.time);

      const x = Math.min(param.point.x + 12, Math.max(8, container.clientWidth - 248));
      const y = Math.max(8, param.point.y - 14);
      setHover({
        x,
        y,
        timeLabel,
        rows,
        markerLabel: markerInfo?.label,
        markerDetail: markerInfo?.detail,
      });
    };

    chart.subscribeCrosshairMove(handleMove);
    return () => {
      chart.unsubscribeCrosshairMove(handleMove);
      setHover(null);
    };
  }, [compact, series]);

  return (
    <div ref={containerRef} className={cn("relative h-full w-full [&_a#tv-attr-logo]:hidden", className)}>
      {!compact && hover ? (
        <div
          className="pointer-events-none absolute z-20 max-w-[240px] rounded-md border border-border/80 bg-background/95 px-2 py-1.5 text-[11px] shadow-md backdrop-blur-sm"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="mb-1 font-medium text-foreground">{hover.timeLabel}</div>
          <div className="space-y-0.5">
            {hover.rows.map((row) => (
              <div key={`hover-row-${row.id}`} className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="truncate text-muted-foreground">{row.label}</span>
                </span>
                <span className="font-medium text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
          {hover.markerLabel ? (
            <div className="mt-1.5 rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-700 dark:text-amber-300">
              <div className="font-medium">{hover.markerLabel}</div>
              {hover.markerDetail ? <div className="mt-0.5 line-clamp-3">{hover.markerDetail}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
