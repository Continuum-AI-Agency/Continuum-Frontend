"use client";

import * as React from "react";
import {
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  type IChartApi,
  type ISeriesApi,
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
  scopeType?: string;
  actionCount?: number;
  status?: "APPROVED" | "FAILED" | "PENDING" | "SUCCESS";
};

type ObservabilityLightweightChartProps = {
  series: ObservabilityChartSeries[];
  className?: string;
  compact?: boolean;
  visibleWindowSeconds?: number | null;
};

type SupportedSeriesType = "Line";

type RegisteredSeries = {
  api: ISeriesApi<SupportedSeriesType, Time>;
};

type HoverState = {
  x: number;
  y: number;
  timeLabel: string;
  rows: Array<{ id: string; label: string; color: string; value: string }>;
};

type OverlayMarker = {
  key: string;
  time: UTCTimestamp;
  x: number;
  label: string;
  detail?: string;
  color: string;
  scopeType?: string;
  actionCount: number;
  status?: "APPROVED" | "FAILED" | "PENDING" | "SUCCESS";
};

type OverlayBookmark = {
  key: string;
  x: number;
  label: string;
  detail?: string;
};

type OverlayGeometry = {
  lineTop: number;
  lineBottom: number;
};

type AnnotationHover = {
  id: string;
  x: number;
  y: number;
  label: string;
  detail?: string;
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

function getSeriesTimeBounds(series: ObservabilityChartSeries[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  series.forEach((entry) => {
    entry.points.forEach((point) => {
      const time = Number(point.time);
      if (!Number.isFinite(time)) return;
      if (time < min) min = time;
      if (time > max) max = time;
    });
  });

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function bookmarkScopeLabel(scopes: Set<string>): string {
  const hasAdset = scopes.has("ADSET");
  const hasAd = scopes.has("AD");
  if (hasAdset && hasAd) return "Adset/Ad";
  if (hasAdset) return "Adset";
  if (hasAd) return "Ad";
  return "Entity";
}

function buildBottomBookmarks(markers: OverlayMarker[], minSpacingPx: number): OverlayBookmark[] {
  const nestedMarkers = markers
    .filter((marker) => marker.scopeType === "ADSET" || marker.scopeType === "AD")
    .sort((left, right) => left.x - right.x);

  if (nestedMarkers.length === 0) return [];

  type Cluster = {
    markers: OverlayMarker[];
    count: number;
    scopeTypes: Set<string>;
    weightedX: number;
    weight: number;
  };

  const clusters: Cluster[] = [];

  nestedMarkers.forEach((marker) => {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster) {
      clusters.push({
        markers: [marker],
        count: marker.actionCount,
        scopeTypes: new Set(marker.scopeType ? [marker.scopeType] : []),
        weightedX: marker.x * marker.actionCount,
        weight: marker.actionCount,
      });
      return;
    }

    const currentX = lastCluster.weightedX / Math.max(1, lastCluster.weight);
    if (Math.abs(marker.x - currentX) > minSpacingPx) {
      clusters.push({
        markers: [marker],
        count: marker.actionCount,
        scopeTypes: new Set(marker.scopeType ? [marker.scopeType] : []),
        weightedX: marker.x * marker.actionCount,
        weight: marker.actionCount,
      });
      return;
    }

    lastCluster.markers.push(marker);
    lastCluster.count += marker.actionCount;
    lastCluster.weight += marker.actionCount;
    lastCluster.weightedX += marker.x * marker.actionCount;
    if (marker.scopeType) lastCluster.scopeTypes.add(marker.scopeType);
  });

  return clusters.map((cluster, index) => {
    const scopeLabel = bookmarkScopeLabel(cluster.scopeTypes);
    const x = cluster.weightedX / Math.max(1, cluster.weight);
    const label = `${cluster.count} action${cluster.count === 1 ? "" : "s"} in ${scopeLabel}`;
    const details = Array.from(new Set(cluster.markers.map((marker) => marker.label))).slice(0, 3).join("\n");

    return {
      key: `bookmark:${index}:${Math.round(x)}`,
      x,
      label,
      detail: details || undefined,
    };
  });
}

export function ObservabilityLightweightChart({
  series,
  className,
  compact = false,
  visibleWindowSeconds = null,
}: ObservabilityLightweightChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesMapRef = React.useRef<Map<string, RegisteredSeries>>(new Map());

  const [hover, setHover] = React.useState<HoverState | null>(null);
  const [overlayMarkers, setOverlayMarkers] = React.useState<OverlayMarker[]>([]);
  const [overlayBookmarks, setOverlayBookmarks] = React.useState<OverlayBookmark[]>([]);
  const [overlayGeometry, setOverlayGeometry] = React.useState<OverlayGeometry>({ lineTop: 8, lineBottom: 8 });
  const [annotationHover, setAnnotationHover] = React.useState<AnnotationHover | null>(null);

  const { appearance } = useTheme();
  const isDark = appearance === "dark";

  const recalcOverlays = React.useCallback(() => {
    const chart = chartRef.current;
    const container = containerRef.current;

    if (!chart || !container || compact) {
      setOverlayMarkers([]);
      setOverlayBookmarks([]);
      setOverlayGeometry({ lineTop: 8, lineBottom: 8 });
      return;
    }

    const lineTop = 8;
    const lineBottom = Math.max(lineTop + 24, container.clientHeight - 28);
    const mergedMarkers = new Map<string, Omit<OverlayMarker, "key" | "x">>();

    series.forEach((entry) => {
      (entry.markers ?? []).forEach((marker) => {
        const markerKey = `${marker.id}:${marker.time}`;
        if (mergedMarkers.has(markerKey)) return;
        mergedMarkers.set(markerKey, {
          time: marker.time,
          label: marker.label,
          detail: marker.detail,
          color: marker.color ?? entry.color,
          scopeType: marker.scopeType,
          actionCount: Math.max(1, marker.actionCount ?? 1),
          status: marker.status,
        });
      });
    });

    const positioned = Array.from(mergedMarkers.entries()).reduce<OverlayMarker[]>((acc, [key, marker]) => {
      const coordinate = chart.timeScale().timeToCoordinate(marker.time as Time);
      if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) return acc;
      if (coordinate < -12 || coordinate > container.clientWidth + 12) return acc;

      acc.push({
        key,
        x: Number(coordinate),
        ...marker,
      });
      return acc;
    }, []);
    positioned.sort((left, right) => left.time - right.time);

    setOverlayMarkers(positioned);
    setOverlayBookmarks(buildBottomBookmarks(positioned, 72));
    setOverlayGeometry({ lineTop, lineBottom });
  }, [compact, series]);

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
        scaleMargins: compact ? { top: 0.16, bottom: 0.16 } : { top: 0.12, bottom: 0.12 },
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

        registered = { api };
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
    });

    const bounds = getSeriesTimeBounds(series);
    if (bounds && typeof visibleWindowSeconds === "number" && visibleWindowSeconds > 0) {
      const to = bounds.max;
      const from = Math.max(bounds.min, to - visibleWindowSeconds);
      chart.timeScale().setVisibleRange({
        from: from as UTCTimestamp,
        to: to as UTCTimestamp,
      });
    } else {
      chart.timeScale().fitContent();
    }
    recalcOverlays();
  }, [compact, recalcOverlays, series, visibleWindowSeconds]);

  React.useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container || compact) {
      return;
    }

    const handleVisibleRangeChange = () => {
      recalcOverlays();
    };

    const resizeObserver = new ResizeObserver(() => {
      recalcOverlays();
    });

    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    resizeObserver.observe(container);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
      resizeObserver.disconnect();
    };
  }, [compact, recalcOverlays]);

  React.useEffect(() => {
    setAnnotationHover(null);
  }, [series]);

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

      if (rows.length === 0) {
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
      {!compact ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          {overlayMarkers.map((marker) => (
            <React.Fragment key={marker.key}>
              <div
                className="absolute w-px"
                style={{
                  left: marker.x,
                  top: overlayGeometry.lineTop,
                  height: Math.max(0, overlayGeometry.lineBottom - overlayGeometry.lineTop),
                  backgroundColor: marker.color,
                  opacity: 0.45,
                }}
              />
              <button
                type="button"
                className="pointer-events-auto absolute h-2.5 w-2.5 rounded-[2px] border border-background/60 shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"
                style={{
                  left: marker.x - 5,
                  top: overlayGeometry.lineTop - 4,
                  backgroundColor: marker.status === "PENDING" ? "transparent" : marker.color,
                  borderColor: marker.color,
                }}
                aria-label={marker.label}
                onMouseEnter={() => {
                  setAnnotationHover({
                    id: marker.key,
                    x: Math.min(marker.x + 10, (containerRef.current?.clientWidth ?? 0) - 240),
                    y: overlayGeometry.lineTop + 12,
                    label: marker.label,
                    detail: marker.detail,
                  });
                }}
                onMouseLeave={() => {
                  setAnnotationHover((current) => (current?.id === marker.key ? null : current));
                }}
                onFocus={() => {
                  setAnnotationHover({
                    id: marker.key,
                    x: Math.min(marker.x + 10, (containerRef.current?.clientWidth ?? 0) - 240),
                    y: overlayGeometry.lineTop + 12,
                    label: marker.label,
                    detail: marker.detail,
                  });
                }}
                onBlur={() => {
                  setAnnotationHover((current) => (current?.id === marker.key ? null : current));
                }}
              />
            </React.Fragment>
          ))}

          {overlayBookmarks.map((bookmark) => (
            <button
              key={bookmark.key}
              type="button"
              className="pointer-events-auto absolute inline-flex max-w-[180px] -translate-x-1/2 items-center gap-1 rounded-[5px] border border-amber-500/40 bg-amber-500/14 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 shadow-sm dark:text-amber-200"
              style={{
                left: bookmark.x,
                top: overlayGeometry.lineBottom + 4,
              }}
              onMouseEnter={() => {
                const containerWidth = containerRef.current?.clientWidth ?? 0;
                setAnnotationHover({
                  id: bookmark.key,
                  x: Math.min(bookmark.x + 10, containerWidth - 240),
                  y: overlayGeometry.lineBottom - 54,
                  label: bookmark.label,
                  detail: bookmark.detail,
                });
              }}
              onMouseLeave={() => {
                setAnnotationHover((current) => (current?.id === bookmark.key ? null : current));
              }}
              onFocus={() => {
                const containerWidth = containerRef.current?.clientWidth ?? 0;
                setAnnotationHover({
                  id: bookmark.key,
                  x: Math.min(bookmark.x + 10, containerWidth - 240),
                  y: overlayGeometry.lineBottom - 54,
                  label: bookmark.label,
                  detail: bookmark.detail,
                });
              }}
              onBlur={() => {
                setAnnotationHover((current) => (current?.id === bookmark.key ? null : current));
              }}
            >
              <span className="h-2 w-2 rounded-[1px] bg-amber-500" />
              <span className="truncate">{bookmark.label}</span>
            </button>
          ))}
        </div>
      ) : null}

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
        </div>
      ) : null}

      {!compact && annotationHover ? (
        <div
          className="pointer-events-none absolute z-30 max-w-[240px] rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-800 shadow-sm dark:text-amber-200"
          style={{
            left: Math.max(8, annotationHover.x),
            top: Math.max(8, annotationHover.y),
          }}
        >
          <div className="font-semibold">{annotationHover.label}</div>
          {annotationHover.detail ? <div className="mt-0.5 whitespace-pre-line">{annotationHover.detail}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
