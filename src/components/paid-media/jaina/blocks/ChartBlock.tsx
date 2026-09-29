'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  XAxis,
  type XAxisTickContentProps,
  YAxis,
} from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatValue } from '@/lib/jaina/formatValue';
import type { ChartBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { useIsExportMode } from '../export/ExportModeContext';
import { EXPORT_CHART_HEIGHT_PX, EXPORT_CHART_WIDTH_PX } from '../export/exportStyles';
import { JAINA_TYPE } from '../reading';
import { BlockHeading } from './BlockHeading';
import { chartHeight, chartShapeOf, tickAreaHeight, wrapTickLabel } from './chartShape';
import { displayEntity, type EntityNames, useEntityNames } from './entityNames';
import { type MetricTile, MetricTiles } from './MetricTiles';

type ChartBlockProps = { block: ChartBlockV2; isStreaming: boolean };

// Compact, human line for a datapoint's harness metadata (entity, source) —
// shown under the axis label in the tooltip when the chart is dataset-backed.
// The entity by its name when the point or the report carries one; the id only otherwise.
function formatDatapointMeta(
  meta: Record<string, unknown>,
  categoryKey: string,
  names: EntityNames,
): string | null {
  const entityType = typeof meta.entity_type === 'string' ? meta.entity_type : null;
  const entityId = typeof meta.entity_id === 'string' ? meta.entity_id : null;
  const entityName = typeof meta.entity_name === 'string' ? meta.entity_name : null;
  if (entityType && (entityName || entityId)) {
    return `${entityType} · ${entityName ?? displayEntity(entityId ?? '', names)}`;
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (key === categoryKey || key === 'entity_name') continue;
    if (typeof value === 'string' || typeof value === 'number') parts.push(`${key}: ${value}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatChartValue(value: string | number, block: ChartBlockV2): string {
  if (block.value_format === 'currency' && !block.currency_code) {
    return `${formatValue(value, 'number')} (currency unknown)`;
  }
  return formatValue(
    value,
    block.value_format,
    block.currency_code ? { currency: block.currency_code } : undefined,
  );
}

function WrappedXAxisTick({ x, y, payload, fill, className }: XAxisTickContentProps) {
  const value = String(payload.value ?? '');
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor="middle"
      fill={fill}
      className={className}
      aria-label={value}
    >
      {wrapTickLabel(value).map((line, index) => (
        <tspan key={`${index}-${line}`} x={x} dy={index === 0 ? 0 : '1.1em'}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/**
 * The same figures as tiles, for a chart that does not earn its space (`chartShapeOf`):
 * one tile per point and series, labelled by the category and, when the chart carries more
 * than one series, the series.
 */
function chartTiles(block: ChartBlockV2): MetricTile[] {
  const isPie = block.chart_type === 'pie' || block.chart_type === 'doughnut';
  const configKeys = Object.keys(block.chart_config);
  const valueKeys = isPie ? [block.value_key ?? configKeys[0] ?? 'value'] : configKeys;
  return block.data.flatMap((row, rowIndex) => {
    const category = String(row[block.category_key] ?? '');
    return valueKeys.flatMap((key) => {
      const value = row[key];
      if (typeof value !== 'string' && typeof value !== 'number') return [];
      const seriesLabel = block.chart_config[key]?.label ?? key;
      return [
        {
          key: `${rowIndex}-${key}`,
          label: valueKeys.length > 1 || isPie ? `${category} · ${seriesLabel}` : category,
          value: formatChartValue(value, block),
        },
      ];
    });
  });
}

export function ChartBlock({ block }: ChartBlockProps) {
  const isExport = useIsExportMode();
  const names = useEntityNames();
  // Index the per-point metadata by its category value so the tooltip can look
  // it up from the hovered row. Empty when the chart is not dataset-backed.
  const metaByCategory = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const entry of block.data_meta ?? []) {
      if (!entry || typeof entry !== 'object') continue;
      const key = (entry as Record<string, unknown>)[block.category_key];
      if (typeof key === 'string' || typeof key === 'number') {
        map.set(String(key), entry as Record<string, unknown>);
      }
    }
    return map;
  }, [block.data_meta, block.category_key]);

  const tooltipFormatter = (value: unknown, name: unknown) => {
    const formatted =
      typeof value === 'string' || typeof value === 'number'
        ? formatChartValue(value, block)
        : String(value ?? '—');
    const label = block.chart_config[String(name)]?.label ?? String(name);
    return (
      <div className="flex min-w-44 flex-1 items-center justify-between gap-4">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{formatted}</span>
      </div>
    );
  };

  const tooltipContent =
    metaByCategory.size > 0 ? (
      <ChartTooltipContent
        formatter={tooltipFormatter}
        labelFormatter={(value, payload) => {
          const categoryValue = payload?.[0]?.payload?.[block.category_key];
          const meta =
            categoryValue != null ? metaByCategory.get(String(categoryValue)) : undefined;
          const detail = meta ? formatDatapointMeta(meta, block.category_key, names) : null;
          return (
            <span className="flex flex-col gap-0.5">
              <span>{String(value ?? categoryValue ?? '')}</span>
              {detail ? (
                <span className="text-xs font-normal text-muted-foreground">{detail}</span>
              ) : null}
            </span>
          );
        }}
      />
    ) : (
      <ChartTooltipContent formatter={tooltipFormatter} />
    );

  const chartConfig: ChartConfig = Object.fromEntries(
    Object.entries(block.chart_config).map(([key, entry]) => [
      key,
      { label: entry.label, color: entry.color },
    ]),
  );

  const configKeys = Object.keys(block.chart_config);
  const isCartesian = ['line', 'bar', 'stacked_bar', 'area'].includes(block.chart_type);
  const categories = block.data.map((point) => String(point[block.category_key] ?? ''));
  const hasLongCategories = categories.some((category) => category.length > 18);
  const minChartWidth =
    isCartesian && hasLongCategories ? Math.max(640, block.data.length * 128) : undefined;
  const accessibleData = block.data
    .map((point) => {
      const category = point[block.category_key];
      const values = configKeys.flatMap((key) => {
        const value = point[key];
        if (typeof value !== 'string' && typeof value !== 'number') return [];
        return `${block.chart_config[key]?.label ?? key} ${formatChartValue(value, block)}`;
      });
      return `${String(category ?? 'Unknown category')}: ${values.join(', ')}`;
    })
    .join('; ');

  // Recharts animates every series in on mount. An export document is built in an
  // offscreen frame where rAF is throttled, so the animation never advances and the
  // series draws at zero progress: axes and gridlines appear, the LINE and the PIE
  // do not. The chart looks structurally fine and is empty.
  const animate = !isExport;

  // The screen chart is a 240px plot over an axis area sized to its tallest wrapped tick
  // (`chartHeight`); it was a fixed 380px that spent 112px on ticks whether the dates
  // wrapped or not. The paper chart is 240px in all, where that leaves almost nothing for
  // the plot — and every tick is drawn because interval={0}, so 14 dates collapse into a
  // smear.
  const sharedCartesian = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey={block.category_key}
        interval={isExport ? 'preserveStartEnd' : 0}
        height={isExport ? 40 : tickAreaHeight(categories)}
        tick={isExport ? undefined : WrappedXAxisTick}
        label={
          block.x_axis_label
            ? { value: block.x_axis_label, position: 'insideBottom', offset: -4 }
            : undefined
        }
      />
      <YAxis
        width={isExport ? 72 : 104}
        tickFormatter={(value: string | number) => formatChartValue(value, block)}
        label={
          block.y_axis_label
            ? {
                value: block.y_axis_label,
                angle: -90,
                position: 'insideLeft',
              }
            : undefined
        }
      />
      <ChartTooltip content={tooltipContent} />
    </>
  );

  let chart: React.ReactNode;

  if (block.chart_type === 'line') {
    chart = (
      <LineChart data={block.data}>
        {sharedCartesian}
        {configKeys.map((key) => (
          <Line
            key={key}
            isAnimationActive={animate}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            dot={false}
          />
        ))}
      </LineChart>
    );
  } else if (block.chart_type === 'bar' || block.chart_type === 'stacked_bar') {
    const isStacked = block.chart_type === 'stacked_bar';
    chart = (
      <BarChart data={block.data}>
        {sharedCartesian}
        {configKeys.map((key) => (
          <Bar
            key={key}
            isAnimationActive={animate}
            dataKey={key}
            fill={`var(--color-${key})`}
            stackId={isStacked ? 'stack' : undefined}
          />
        ))}
      </BarChart>
    );
  } else if (block.chart_type === 'area') {
    chart = (
      <AreaChart data={block.data}>
        {sharedCartesian}
        {configKeys.map((key) => (
          <Area
            key={key}
            isAnimationActive={animate}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.2}
          />
        ))}
      </AreaChart>
    );
  } else if (block.chart_type === 'radar') {
    chart = (
      <RadarChart data={block.data}>
        <PolarGrid />
        <PolarAngleAxis dataKey={block.category_key} />
        <ChartTooltip content={tooltipContent} />
        {configKeys.map((key) => (
          <Radar
            key={key}
            isAnimationActive={animate}
            dataKey={key}
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.2}
          />
        ))}
      </RadarChart>
    );
  } else {
    // A bare <Pie> paints every slice the same default fill, so the chart renders as
    // one solid disc with no way to tell the slices apart. Colour comes from the
    // block's own chart_config, which for pie/doughnut is keyed by SLICE VALUE — read
    // directly rather than through ChartStyle's `--color-<key>` var, because a slice
    // named "Paid Search" is not a valid custom-property name.
    chart = (
      <PieChart>
        <ChartTooltip content={tooltipContent} />
        <Pie
          isAnimationActive={animate}
          data={block.data}
          dataKey={block.value_key ?? configKeys[0] ?? 'value'}
          nameKey={block.category_key}
          innerRadius={block.chart_type === 'doughnut' ? '50%' : 0}
        >
          {block.data.map((row, index) => {
            const slice = String(row[block.category_key] ?? '');
            return (
              <Cell
                key={`${slice}-${index}`}
                fill={block.chart_config[slice]?.color ?? `var(--chart-${(index % 5) + 1})`}
              />
            );
          })}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey={block.category_key} />} />
      </PieChart>
    );
  }

  // A chart shows a trend or a comparison. With fewer points than a week and fewer
  // entities than three there is neither, and the block is its figures as tiles.
  const shape = chartShapeOf(block);

  return (
    <div>
      <BlockHeading
        title={block.title}
        provenance={block.provenance}
        datasetId={block.dataset_id}
        evidenceRefs={block.evidence_refs}
      />
      {block.description ? (
        <p className={cn('mb-2 leading-5 text-muted-foreground', JAINA_TYPE.table)}>
          {block.description}
        </p>
      ) : null}
      {shape.earnsChart ? (
        <div className="overflow-x-auto">
          <ChartContainer
            config={chartConfig}
            explicitSize={
              isExport
                ? { width: EXPORT_CHART_WIDTH_PX, height: EXPORT_CHART_HEIGHT_PX }
                : undefined
            }
            className={isExport ? 'w-full' : 'aspect-auto w-full'}
            style={
              isExport ? undefined : { height: chartHeight(categories), minWidth: minChartWidth }
            }
            role="img"
            aria-label={[block.title, block.x_axis_label, block.y_axis_label, accessibleData]
              .filter(Boolean)
              .join('. ')}
          >
            {chart}
          </ChartContainer>
        </div>
      ) : (
        <MetricTiles
          tiles={chartTiles(block)}
          aria-label={block.title}
          data-testid="chart-as-tiles"
          data-chart-points={shape.points}
          data-chart-entities={shape.entities}
        />
      )}
      {block.annotation ? (
        <p className={cn('mt-1.5 italic text-muted-foreground/70', JAINA_TYPE.table)}>
          {block.annotation}
        </p>
      ) : null}
    </div>
  );
}

export default ChartBlock;
