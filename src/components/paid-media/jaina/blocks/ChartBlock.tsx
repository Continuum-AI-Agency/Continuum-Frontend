"use client";

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

export function ChartBlock({ block }: ChartBlockProps) {
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
      <ChartTooltip content={<ChartTooltipContent />} />
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
        <ChartTooltip content={<ChartTooltipContent />} />
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
        <ChartTooltip content={<ChartTooltipContent />} />
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
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        {chart}
      </ChartContainer>
    </div>
  );
}

export default ChartBlock;
