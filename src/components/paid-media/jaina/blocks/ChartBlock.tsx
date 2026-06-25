"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ChartBlockV2 } from "@/lib/jaina/schemas";

type ChartBlockProps = { block: ChartBlockV2; isStreaming: boolean };

// Compact, human line for a datapoint's harness metadata (entity, source) —
// shown under the axis label in the tooltip when the chart is dataset-backed.
function formatDatapointMeta(meta: Record<string, unknown>, categoryKey: string): string | null {
  const entityType = typeof meta.entity_type === "string" ? meta.entity_type : null;
  const entityId = typeof meta.entity_id === "string" ? meta.entity_id : null;
  if (entityType && entityId) return `${entityType} · ${entityId}`;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (key === categoryKey) continue;
    if (typeof value === "string" || typeof value === "number") parts.push(`${key}: ${value}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function ChartBlock({ block }: ChartBlockProps) {
  // Index the per-point metadata by its category value so the tooltip can look
  // it up from the hovered row. Empty when the chart is not dataset-backed.
  const metaByCategory = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const entry of block.data_meta ?? []) {
      if (!entry || typeof entry !== "object") continue;
      const key = (entry as Record<string, unknown>)[block.category_key];
      if (typeof key === "string" || typeof key === "number") {
        map.set(String(key), entry as Record<string, unknown>);
      }
    }
    return map;
  }, [block.data_meta, block.category_key]);

  const tooltipContent =
    metaByCategory.size > 0 ? (
      <ChartTooltipContent
        labelFormatter={(value, payload) => {
          const categoryValue = payload?.[0]?.payload?.[block.category_key];
          const meta = categoryValue != null ? metaByCategory.get(String(categoryValue)) : undefined;
          const detail = meta ? formatDatapointMeta(meta, block.category_key) : null;
          return (
            <span className="flex flex-col gap-0.5">
              <span>{String(value ?? categoryValue ?? "")}</span>
              {detail ? (
                <span className="text-2xs font-normal text-muted-foreground">{detail}</span>
              ) : null}
            </span>
          );
        }}
      />
    ) : (
      <ChartTooltipContent />
    );

  const chartConfig: ChartConfig = Object.fromEntries(
    Object.entries(block.chart_config).map(([key, entry]) => [
      key,
      { label: entry.label, color: entry.color },
    ]),
  );

  const configKeys = Object.keys(block.chart_config);

  const sharedCartesian = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey={block.category_key} />
      <YAxis />
      <ChartTooltip content={tooltipContent} />
    </>
  );

  let chart: React.ReactNode;

  if (block.chart_type === "line") {
    chart = (
      <LineChart data={block.data}>
        {sharedCartesian}
        {configKeys.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            dot={false}
          />
        ))}
      </LineChart>
    );
  } else if (block.chart_type === "bar" || block.chart_type === "stacked_bar") {
    const isStacked = block.chart_type === "stacked_bar";
    chart = (
      <BarChart data={block.data}>
        {sharedCartesian}
        {configKeys.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`var(--color-${key})`}
            stackId={isStacked ? "stack" : undefined}
          />
        ))}
      </BarChart>
    );
  } else if (block.chart_type === "area") {
    chart = (
      <AreaChart data={block.data}>
        {sharedCartesian}
        {configKeys.map((key) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.2}
          />
        ))}
      </AreaChart>
    );
  } else if (block.chart_type === "radar") {
    chart = (
      <RadarChart data={block.data}>
        <PolarGrid />
        <PolarAngleAxis dataKey={block.category_key} />
        <ChartTooltip content={tooltipContent} />
        {configKeys.map((key) => (
          <Radar
            key={key}
            dataKey={key}
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.2}
          />
        ))}
      </RadarChart>
    );
  } else {
    chart = (
      <PieChart>
        <ChartTooltip content={tooltipContent} />
        <Pie
          data={block.data}
          dataKey={block.value_key ?? configKeys[0] ?? "value"}
          nameKey={block.category_key}
          innerRadius={block.chart_type === "doughnut" ? "50%" : 0}
        />
      </PieChart>
    );
  }

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-foreground">{block.title}</h4>
      {block.description ? (
        <p className="mb-2 text-xs leading-5 text-muted-foreground">
          {block.description}
        </p>
      ) : null}
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        {chart}
      </ChartContainer>
      {block.annotation ? (
        <p className="mt-1.5 text-xs italic text-muted-foreground/70">
          {block.annotation}
        </p>
      ) : null}
    </div>
  );
}

export default ChartBlock;
