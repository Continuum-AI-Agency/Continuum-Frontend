"use client";

import { Card, Box, Text, Heading, Grid } from "@radix-ui/themes";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { chartSchema } from "@/lib/jaina/schemas";
import { z } from "zod";

type Chart = z.infer<typeof chartSchema>;

interface JainaReportChartsProps {
  charts: Chart[] | any[];
}

export function JainaReportCharts({ charts }: JainaReportChartsProps) {
  if (!charts || charts.length === 0) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      <Heading size="4" className="text-primary/80">
        Key Trends
      </Heading>
      <Grid columns={{ initial: "1", lg: "2" }} gap="4">
        {charts.map((chart: Chart, index: number) => (
          <ChartCard key={`${chart.title || "chart"}-${index}`} chart={chart} />
        ))}
      </Grid>
    </div>
  );
}

function ChartCard({ chart }: { chart: Chart }) {
  return (
    <Card className="border border-white/10 bg-black/20">
      <Box p="3" className="space-y-4">
        <div className="space-y-1">
          <Text weight="medium" size="3">
            {chart.title}
          </Text>
          {chart.description ? (
            <Text size="2" color="gray" className="block">
              {chart.description}
            </Text>
          ) : null}
        </div>
        <div className="h-[240px] w-full">
          <ChartRenderer chart={chart} />
        </div>
      </Box>
    </Card>
  );
}

function ChartRenderer({ chart }: { chart: Chart }) {
  const colors = [
    "#38bdf8",
    "#60a5fa",
    "#818cf8",
    "#a78bfa",
    "#34d399",
    "#fbbf24",
    "#f87171",
    "#22d3ee",
  ];

  if (chart.type === "pie") {
    const data = chart.data || [];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
          >
            {data.map((entry: any, index: number) => (
              <Cell key={`cell-${index}`} fill={entry.fill || colors[index % colors.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }}
            itemStyle={{ color: "#fff" }}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.series && chart.series.length > 0) {
    return (
      <SeriesChartRenderer
        chart={chart}
        colors={colors}
      />
    );
  }

  const data = chart.data || [];
  const color = colors[0];

  if (chart.type === "bar" || chart.type === "stacked_bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#888", fontSize: 12 }}
            dy={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#888", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} barSize={36}>
            {data.map((entry: any, index: number) => (
              <Cell key={`bar-cell-${index}`} fill={entry.fill || colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#888", fontSize: 12 }}
            dy={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#888", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#888", fontSize: 12 }}
          dy={10}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#888", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 4, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SeriesChartRenderer({
  chart,
  colors
}: {
  chart: Chart;
  colors: string[];
}) {
  const series = chart.series || [];
  const xLabel = chart.x_axis_label;
  const yLabel = chart.y_axis_label;

  const allXValues = new Set<string | number>();
  series.forEach((s: any) => {
    s.data.forEach((d: any) => allXValues.add(d.x));
  });
  const xValues = Array.from(allXValues).sort();

  const transformedData = xValues.map(x => {
    const dataPoint: Record<string, string | number> = { x };
    series.forEach((s: any) => {
      const point = s.data.find((d: any) => d.x === x);
      dataPoint[s.name] = point ? point.y : 0;
    });
    return dataPoint;
  });

  if (chart.type === "bar" || chart.type === "stacked_bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={transformedData}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#888", fontSize: 12 }}
            dy={10}
            label={xLabel ? { value: xLabel, position: "insideBottom", dy: 25, fill: "#888" } : undefined}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#888", fontSize: 12 }}
            label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "#888" } : undefined}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }}
          />
          <Legend
            wrapperStyle={{ paddingTop: "10px" }}
            iconType="circle"
          />
          {series.map((s: any, index: number) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              stackId={chart.type === "stacked_bar" ? "stack" : undefined}
              fill={colors[index % colors.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={transformedData}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#888", fontSize: 12 }}
            dy={10}
            label={xLabel ? { value: xLabel, position: "insideBottom", dy: 25, fill: "#888" } : undefined}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#888", fontSize: 12 }}
            label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "#888" } : undefined}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }}
          />
          <Legend
            wrapperStyle={{ paddingTop: "10px" }}
            iconType="circle"
          />
          {series.map((s: any, index: number) => (
            <Area
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={colors[index % colors.length]}
              fill={colors[index % colors.length]}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={transformedData}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
        <XAxis
          dataKey="x"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#888", fontSize: 12 }}
          dy={10}
          label={xLabel ? { value: xLabel, position: "insideBottom", dy: 25, fill: "#888" } : undefined}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#888", fontSize: 12 }}
          label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "#888" } : undefined}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#111", borderColor: "#333", color: "#fff" }}
        />
        <Legend
          wrapperStyle={{ paddingTop: "10px" }}
          iconType="circle"
        />
        {series.map((s: any, index: number) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: colors[index % colors.length], strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
