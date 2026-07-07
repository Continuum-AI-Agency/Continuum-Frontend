'use client';

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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GraphSpec } from '@/lib/jaina/schemas';

type ChartPoint = {
  label: string;
  value: number;
  fill?: string;
};

type ChartSeries = {
  name: string;
  data: Array<{ x: string | number; y: number }>;
};

type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'stacked_bar';

export type NormalizedChart = {
  title: string;
  description?: string | null;
  type: ChartType;
  frontend_parser?: 'series' | 'chartjs';
  data?: ChartPoint[];
  series?: ChartSeries[];
  x_axis_label?: string;
  y_axis_label?: string;
};

interface JainaReportChartsProps {
  charts: JainaChartInput[];
  showHeading?: boolean;
}

export type JainaChartInput = GraphSpec | Record<string, unknown>;

export function isJainaChartInput(value: unknown): value is JainaChartInput {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function JainaReportCharts({ charts, showHeading = true }: JainaReportChartsProps) {
  if (!charts || charts.length === 0) return null;

  const normalizedCharts = charts
    .map(normalizeJainaChart)
    .filter((chart): chart is NormalizedChart => Boolean(chart));

  if (normalizedCharts.length === 0) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      {showHeading ? <h3 className="text-lg font-semibold text-primary/80">Key Trends</h3> : null}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {normalizedCharts.map((chart, index) => (
          <ChartCard key={`${chart.title || 'chart'}-${index}`} chart={chart} />
        ))}
      </div>
    </div>
  );
}

function resolveFrontendParserHint(value: unknown): 'series' | 'chartjs' | '' {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('series')) return 'series';
  if (normalized.startsWith('chartjs')) return 'chartjs';
  return '';
}

function normalizeChartType(input: unknown): ChartType {
  const value = String(input ?? '')
    .toLowerCase()
    .trim();
  if (value === 'stacked_bar' || value === 'stacked-bar') return 'stacked_bar';
  if (value === 'line') return 'line';
  if (value === 'pie' || value === 'doughnut' || value === 'donut') return 'pie';
  if (value === 'area') return 'area';
  return 'bar';
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value.replace(/,/g, '');
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveCategoryLabel(row: Record<string, unknown>, index: number): string {
  const candidateKeys = ['label', 'x', 'name', 'campaign', 'title'];
  for (const key of candidateKeys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return String(index + 1);
}

function parseWideSeriesFromDataRows(rows: Record<string, unknown>[]): ChartSeries[] | null {
  if (rows.length === 0) return null;

  const numericKeys = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (key === 'label' || key === 'x' || key === 'name') return;
        if (toFiniteNumber(value) !== null) {
          set.add(key);
        }
      });
      return set;
    }, new Set<string>()),
  );

  if (numericKeys.length < 2) return null;

  return numericKeys.map((key) => ({
    name: key,
    data: rows.map((row, index) => ({
      x: resolveCategoryLabel(row, index),
      y: toFiniteNumber(row[key]) ?? 0,
    })),
  }));
}

export function normalizeJainaChart(rawChart: JainaChartInput): NormalizedChart | null {
  if (!rawChart || typeof rawChart !== 'object') return null;

  const chart = rawChart as Record<string, unknown>;
  const parserHint = resolveFrontendParserHint(chart.frontend_parser ?? chart.data_format);
  const title = typeof chart.title === 'string' ? chart.title : 'Chart';
  const description = typeof chart.description === 'string' ? chart.description : null;
  const type = normalizeChartType(chart.type ?? chart.graph_type ?? chart.chart_type);

  if (parserHint === 'series' && Array.isArray(chart.series)) {
    const series = chart.series.filter((item) => item && typeof item === 'object');
    return {
      title,
      description,
      type,
      frontend_parser: 'series',
      series: series.map((item, seriesIndex) => {
        const record = item as Record<string, unknown>;
        const data = Array.isArray(record.data) ? record.data : [];
        return {
          name: typeof record.name === 'string' ? record.name : `Series ${seriesIndex + 1}`,
          data: data.map((point, pointIndex) => {
            if (!point || typeof point !== 'object') {
              return { x: pointIndex + 1, y: 0 };
            }
            const pointRecord = point as Record<string, unknown>;
            return {
              x: String(pointRecord.x ?? pointRecord.label ?? pointIndex + 1),
              y: Number(pointRecord.y ?? pointRecord.value ?? 0),
            };
          }),
        };
      }),
      x_axis_label: typeof chart.x_axis_label === 'string' ? chart.x_axis_label : undefined,
      y_axis_label: typeof chart.y_axis_label === 'string' ? chart.y_axis_label : undefined,
    };
  }

  if (parserHint === 'chartjs' && Array.isArray(chart.labels) && Array.isArray(chart.datasets)) {
    const labels = chart.labels.map((label) => String(label ?? ''));
    const datasets = chart.datasets.filter((dataset) => dataset && typeof dataset === 'object');
    if (datasets.length === 1) {
      const firstDataset = datasets[0] as Record<string, unknown>;
      const values = Array.isArray(firstDataset.data) ? firstDataset.data : [];
      return {
        title,
        description,
        type,
        frontend_parser: 'chartjs',
        data: labels.map((label, index) => ({
          label,
          value: Number(values[index] ?? 0),
        })),
      };
    }

    return {
      title,
      description,
      type,
      frontend_parser: 'chartjs',
      series: datasets.map((dataset, datasetIndex) => {
        const record = dataset as Record<string, unknown>;
        const values = Array.isArray(record.data) ? record.data : [];
        return {
          name: typeof record.label === 'string' ? record.label : `Series ${datasetIndex + 1}`,
          data: labels.map((label, index) => ({
            x: label,
            y: Number(values[index] ?? 0),
          })),
        };
      }),
    };
  }

  if (Array.isArray(chart.labels) && Array.isArray(chart.datasets)) {
    const labels = chart.labels.map((label) => String(label ?? ''));
    const datasets = chart.datasets.filter((dataset) => dataset && typeof dataset === 'object');

    if (datasets.length === 1) {
      const firstDataset = datasets[0] as Record<string, unknown>;
      const values = Array.isArray(firstDataset.data) ? firstDataset.data : [];
      return {
        title,
        description,
        type,
        frontend_parser: parserHint === 'chartjs' ? 'chartjs' : undefined,
        data: labels.map((label, index) => ({
          label,
          value: Number(values[index] ?? 0),
        })),
      };
    }

    return {
      title,
      description,
      type,
      frontend_parser: parserHint === 'chartjs' ? 'chartjs' : undefined,
      series: datasets.map((dataset, datasetIndex) => {
        const record = dataset as Record<string, unknown>;
        const values = Array.isArray(record.data) ? record.data : [];
        return {
          name: typeof record.label === 'string' ? record.label : `Series ${datasetIndex + 1}`,
          data: labels.map((label, index) => ({
            x: label,
            y: Number(values[index] ?? 0),
          })),
        };
      }),
    };
  }

  if (Array.isArray(chart.labels) && Array.isArray(chart.series)) {
    const labels = chart.labels.map((label) => String(label ?? ''));
    const series = chart.series.filter((item) => item && typeof item === 'object');

    return {
      title,
      description,
      type,
      frontend_parser: parserHint === 'series' ? 'series' : undefined,
      series: series.map((item, index) => {
        const record = item as Record<string, unknown>;
        const values = Array.isArray(record.values) ? record.values : [];
        return {
          name: typeof record.name === 'string' ? record.name : `Series ${index + 1}`,
          data: labels.map((label, labelIndex) => ({
            x: label,
            y: Number(values[labelIndex] ?? 0),
          })),
        };
      }),
    };
  }

  if (Array.isArray(chart.series)) {
    const series = chart.series.filter((item) => item && typeof item === 'object');

    return {
      title,
      description,
      type,
      frontend_parser: parserHint === 'series' ? 'series' : undefined,
      series: series.map((item, seriesIndex) => {
        const record = item as Record<string, unknown>;
        const data = Array.isArray(record.data) ? record.data : [];
        return {
          name: typeof record.name === 'string' ? record.name : `Series ${seriesIndex + 1}`,
          data: data.map((point, pointIndex) => {
            if (!point || typeof point !== 'object') {
              return { x: pointIndex + 1, y: 0 };
            }
            const pointRecord = point as Record<string, unknown>;
            return {
              x: String(pointRecord.x ?? pointRecord.label ?? pointIndex + 1),
              y: Number(pointRecord.y ?? pointRecord.value ?? 0),
            };
          }),
        };
      }),
      x_axis_label: typeof chart.x_axis_label === 'string' ? chart.x_axis_label : undefined,
      y_axis_label: typeof chart.y_axis_label === 'string' ? chart.y_axis_label : undefined,
    };
  }

  if (Array.isArray(chart.data)) {
    const rows = chart.data.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item)),
    );
    const wideSeries = parseWideSeriesFromDataRows(rows);
    if (wideSeries) {
      return {
        title,
        description,
        type,
        frontend_parser:
          parserHint === 'series' || parserHint === 'chartjs'
            ? (parserHint as 'series' | 'chartjs')
            : undefined,
        series: wideSeries,
        x_axis_label: typeof chart.x_axis_label === 'string' ? chart.x_axis_label : undefined,
        y_axis_label: typeof chart.y_axis_label === 'string' ? chart.y_axis_label : undefined,
      };
    }

    return {
      title,
      description,
      type,
      frontend_parser:
        parserHint === 'series' || parserHint === 'chartjs'
          ? (parserHint as 'series' | 'chartjs')
          : undefined,
      data: rows.map((item) => {
        const record = item as Record<string, unknown>;
        return {
          label: String(record.label ?? record.x ?? record.name ?? ''),
          value: Number(record.value ?? record.y ?? 0),
          fill: typeof record.fill === 'string' ? record.fill : undefined,
        };
      }),
      x_axis_label: typeof chart.x_axis_label === 'string' ? chart.x_axis_label : undefined,
      y_axis_label: typeof chart.y_axis_label === 'string' ? chart.y_axis_label : undefined,
    };
  }

  return null;
}

function ChartCard({ chart }: { chart: NormalizedChart }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/20">
      <div className="space-y-4 p-3">
        <div className="space-y-1">
          <span className="text-base font-medium">{chart.title}</span>
          {chart.description ? (
            <span className="block text-sm text-muted-foreground">{chart.description}</span>
          ) : null}
        </div>
        <div className="h-[240px] w-full">
          <ChartRenderer chart={chart} />
        </div>
      </div>
    </div>
  );
}

function ChartRenderer({ chart }: { chart: NormalizedChart }) {
  const colors = [
    '#38bdf8',
    '#60a5fa',
    '#818cf8',
    '#a78bfa',
    '#34d399',
    '#fbbf24',
    '#f87171',
    '#22d3ee',
  ];

  if (chart.type === 'pie') {
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
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill || colors[index % colors.length]}
                stroke="transparent"
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff' }}
            itemStyle={{ color: '#fff' }}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.series && chart.series.length > 0) {
    return <SeriesChartRenderer chart={chart} colors={colors} />;
  }

  const data = chart.data || [];
  const color = colors[0];

  if (chart.type === 'bar' || chart.type === 'stacked_bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#888', fontSize: 12 }}
            dy={10}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#888', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff' }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} barSize={36}>
            {data.map((entry, index) => (
              <Cell key={`bar-cell-${index}`} fill={entry.fill || colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#888', fontSize: 12 }}
            dy={10}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#888', fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff' }} />
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
          tick={{ fill: '#888', fontSize: 12 }}
          dy={10}
        />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: '#888', fontSize: 12 }} />
        <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff' }} />
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

function SeriesChartRenderer({ chart, colors }: { chart: NormalizedChart; colors: string[] }) {
  const series = chart.series || [];
  const xLabel = chart.x_axis_label;
  const yLabel = chart.y_axis_label;

  const allXValues = new Set<string | number>();
  series.forEach((entry) => {
    entry.data.forEach((point) => allXValues.add(point.x));
  });
  const xValues = Array.from(allXValues).sort();

  const transformedData = xValues.map((x) => {
    const dataPoint: Record<string, string | number> = { x };
    series.forEach((entry) => {
      const point = entry.data.find((candidate) => candidate.x === x);
      dataPoint[entry.name] = point ? point.y : 0;
    });
    return dataPoint;
  });

  if (chart.type === 'bar' || chart.type === 'stacked_bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={transformedData}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#888', fontSize: 12 }}
            dy={10}
            label={
              xLabel ? { value: xLabel, position: 'insideBottom', dy: 25, fill: '#888' } : undefined
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#888', fontSize: 12 }}
            label={
              yLabel
                ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#888' }
                : undefined
            }
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff' }}
          />
          <Legend wrapperStyle={{ color: '#fff' }} />
          {series.map((entry, index) => (
            <Bar
              key={entry.name}
              dataKey={entry.name}
              fill={colors[index % colors.length]}
              radius={[4, 4, 0, 0]}
              barSize={24}
              stackId={chart.type === 'stacked_bar' ? 'stack' : undefined}
            />
          ))}
        </BarChart>
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
          tick={{ fill: '#888', fontSize: 12 }}
          dy={10}
          label={
            xLabel ? { value: xLabel, position: 'insideBottom', dy: 25, fill: '#888' } : undefined
          }
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#888', fontSize: 12 }}
          label={
            yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#888' } : undefined
          }
        />
        <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff' }} />
        <Legend wrapperStyle={{ color: '#fff' }} />
        {series.map((entry, index) => (
          <Line
            key={entry.name}
            type="monotone"
            dataKey={entry.name}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
