'use client';

import { type SVGProps, useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  type LabelProps,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  Text,
  XAxis,
  type XAxisTickContentProps,
  YAxis,
  type YAxisTickContentProps,
} from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { useIsExportMode } from '../export/ExportModeContext';
import { EXPORT_CHART_HEIGHT_PX, EXPORT_CHART_WIDTH_PX } from '../export/exportStyles';
import { JAINA_TYPE } from '../reading';
import { BlockHeading } from './BlockHeading';
import {
  chartHeight,
  chartShapeOf,
  fitTickLabel,
  horizontalChartHeight,
  tickAreaHeight,
  tickLineBudget,
  wrapTickLabel,
} from './chartShape';
import {
  type DrawnRow,
  drawnRowsOf,
  formatChartValue,
  isCartesianChart,
  isHorizontalChart,
  LABEL_KEY,
  printedValueOf,
  RANGE_KEY,
  seriesKeysOf,
  seriesKindOf,
  TOTAL_KEY,
} from './chartVocabulary';
import { displayEntity, type EntityNames, useEntityNames } from './entityNames';
import { type MetricTile, MetricTiles } from './MetricTiles';
import { JAINA_MODULE } from './modules';

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

// Recharts paints tick text #666 and v3's tick DOM slips past ChartContainer's muted-foreground
// override, which leaves dark-mode ticks at 3:1. The token reads in both themes.
const AXIS_TEXT = 'var(--muted-foreground)';

/**
 * A category under its bar, wrapped to its band (`fitTickLabel`) within the lines the axis
 * was sized for; a name the band cannot hold is cut, and kept whole in its title.
 */
function wrappedXAxisTick(maxLines: number) {
  return function WrappedXAxisTick({
    x,
    y,
    payload,
    className,
    width,
    visibleTicksCount,
  }: XAxisTickContentProps) {
    const value = String(payload.value ?? '');
    const band = Number(width) / Math.max(1, visibleTicksCount);
    const lines =
      Number.isFinite(band) && band > 0
        ? fitTickLabel(value, band, maxLines)
        : wrapTickLabel(value);
    const cut = lines.join(' ') !== wrapTickLabel(value).join(' ');
    return (
      <text
        x={x}
        y={y}
        dy={12}
        textAnchor="middle"
        fill={AXIS_TEXT}
        className={className}
        aria-label={value}
      >
        {cut ? <title>{value}</title> : null}
        {lines.map((line, index) => (
          <tspan key={`${index}-${line}`} x={x} dy={index === 0 ? 0 : '1.1em'}>
            {line}
          </tspan>
        ))}
      </text>
    );
  };
}

/** A category down the side: two lines at most, cut with an ellipsis, the full name in its title. */
const CATEGORY_LINE_CHARS = 16;
const CATEGORY_AXIS_PX = 120;
/** One row of legend under a chart with more than one series. */
const LEGEND_PX = 32;

function categoryLines(value: string): string[] {
  const lines = wrapTickLabel(value, CATEGORY_LINE_CHARS);
  return lines.slice(0, 2).map((line, index) => {
    const clipped = index === 1 && lines.length > 2;
    return line.length > CATEGORY_LINE_CHARS || clipped
      ? `${line.slice(0, CATEGORY_LINE_CHARS - 1)}…`
      : line;
  });
}

/** A horizontal chart's category tick; a marked category carries its marker as a last line. */
function categoryTick(markers: ReadonlyMap<string, string>) {
  return function HorizontalCategoryTick({ x, y, payload, className }: YAxisTickContentProps) {
    const value = String(payload.value ?? '');
    const lines = categoryLines(value);
    const marker = markers.get(value);
    const count = lines.length + (marker ? 1 : 0);
    return (
      <text
        x={x}
        y={y}
        textAnchor="end"
        fill={AXIS_TEXT}
        className={className}
        aria-label={value}
        data-chart-marker={marker}
        data-chart-marker-category={marker ? value : undefined}
      >
        <title>{value}</title>
        {lines.map((line, index) => (
          <tspan
            key={`${index}-${line}`}
            x={x}
            dy={index === 0 ? `${0.35 - (count - 1) * 0.55}em` : '1.1em'}
          >
            {line}
          </tspan>
        ))}
        {marker ? (
          <tspan
            x={x}
            dy="1.1em"
            fill="var(--foreground)"
            fontWeight={600}
            className="chart-marker-label"
          >
            {marker}
          </tspan>
        ) : null}
      </text>
    );
  };
}

// Printed on the plot, so a label sits on bars, gridlines and lines alike: foreground text on
// a halo of the page background reads in light and dark without knowing what is under it.
const ON_PLOT_TEXT = {
  fill: 'var(--foreground)',
  stroke: 'var(--background)',
  strokeWidth: 3,
  style: { fontSize: 12 },
} as const;
const HALO_CLASS = '[paint-order:stroke]';
// ponytail: a per-character estimate of text-xs, not a measurement; measure with Recharts'
// getStringSize if a label is ever seen spilling over its bar.
const CHAR_PX = 7;
/** One line of a value label that wraps its currency under its amount. */
const VALUE_LINE_PX = 13;

const boxOf = (props: LabelProps) =>
  props.viewBox && 'width' in props.viewBox ? props.viewBox : null;

/**
 * A bar's value label. Above (or beside, on its side) the bar when it fits its width, else
 * turned upright inside a tall bar or over a short one. A stacked segment prints inside itself
 * or not at all: a value spilling over its neighbour is worse than the one in the tooltip.
 */
function barValueLabel(
  format: (value: unknown) => string | null,
  placement: 'above' | 'beside' | 'inside',
) {
  return function BarValueLabel(props: LabelProps) {
    const box = boxOf(props);
    const text = format(props.value);
    if (!box || !text) return null;
    const left = Math.min(box.x, box.x + box.width);
    const top = Math.min(box.y, box.y + box.height);
    const width = Math.abs(box.width);
    const height = Math.abs(box.height);
    const textWidth = text.length * CHAR_PX;
    const attrs = {
      ...ON_PLOT_TEXT,
      className: cn('chart-value-label', HALO_CLASS),
      'data-chart-value-label': text,
    };
    // The amount over its currency ("+$3.90" / "MXN"): the fallback when one line is too wide.
    const split = text.lastIndexOf(' ');
    const lines = split > 0 ? [text.slice(0, split), text.slice(split + 1)] : [text];
    const longestLine = Math.max(...lines.map((line) => line.length)) * CHAR_PX;
    if (placement === 'inside') {
      if (textWidth + 8 > width || height < 14) {
        if (lines.length !== 2 || longestLine + 8 > width || height < 2 * VALUE_LINE_PX + 4) {
          return null;
        }
        const middle = top + height / 2;
        return (
          <text {...attrs} x={left + width / 2} textAnchor="middle">
            {lines.map((line, index) => (
              <tspan
                key={line}
                x={left + width / 2}
                y={middle + (index === 0 ? -2 : VALUE_LINE_PX - 2)}
              >
                {index === 0 ? `${line} ` : line}
              </tspan>
            ))}
          </text>
        );
      }
      return (
        <Text
          {...attrs}
          x={left + width / 2}
          y={top + height / 2}
          textAnchor="middle"
          verticalAnchor="middle"
        >
          {text}
        </Text>
      );
    }
    if (placement === 'beside') {
      return (
        <Text {...attrs} x={left + width + 4} y={top + height / 2} verticalAnchor="middle">
          {text}
        </Text>
      );
    }
    const center = left + width / 2;
    if (textWidth <= width + 8) {
      return (
        <Text {...attrs} x={center} y={top - 4} textAnchor="middle" verticalAnchor="end">
          {text}
        </Text>
      );
    }
    // Too wide for its bar in one line: the amount over its currency reads level, before the
    // label is turned on its side.
    if (lines.length === 2 && longestLine <= width + 8) {
      return (
        <text {...attrs} x={center} y={top - 4 - VALUE_LINE_PX} textAnchor="middle">
          {lines.map((line, index) => (
            <tspan key={line} x={center} dy={index === 0 ? 0 : VALUE_LINE_PX}>
              {index === 0 ? `${line} ` : line}
            </tspan>
          ))}
        </text>
      );
    }
    const inBar = height >= textWidth + 8;
    // Turned upright over a short bar it runs upward; past the plot's top it would print a cut
    // figure ("$0.60 MXI"), which reads as a different number. The tooltip and the chart's
    // accessible text still carry it.
    const plot = props.parentViewBox && 'y' in props.parentViewBox ? props.parentViewBox : null;
    const fitsAbove = (length: number) => !plot || top - 4 - length >= plot.y;
    if (!inBar && !fitsAbove(textWidth)) {
      // Upright in one line it is too tall for the room over the bar: the amount and its
      // currency side by side, turned together, need only the longer of the two.
      if (
        lines.length !== 2 ||
        lines.length * VALUE_LINE_PX > width + 8 ||
        !fitsAbove(longestLine)
      ) {
        return null;
      }
      return (
        <text {...attrs} transform={`translate(${center} ${top - 4}) rotate(-90)`} x={0}>
          {lines.map((line, index) => (
            <tspan key={line} x={0} y={index === 0 ? -2 : VALUE_LINE_PX - 2}>
              {index === 0 ? `${line} ` : line}
            </tspan>
          ))}
        </text>
      );
    }
    return (
      <Text
        {...attrs}
        x={center}
        y={inBar ? top + 4 : top - 4}
        angle={-90}
        textAnchor={inBar ? 'end' : 'start'}
        verticalAnchor="middle"
      >
        {text}
      </Text>
    );
  };
}

/**
 * A goal line or a marker as one element: the line Recharts places and its label above it —
 * along a value line from the end its axis is on, wrapped to the plot's width; over a category
 * line (or a goal on a chart laid on its side) centred, in one line. The attributes name it for
 * the reader's tools and the e2e bench alike.
 */
function calloutShape(
  text: string,
  align: 'start' | 'middle' | 'end',
  className: string,
  attributes: Record<`data-${string}`, string | number>,
) {
  return function Callout(props: SVGProps<SVGLineElement>) {
    const x1 = Number(props.x1);
    const x2 = Number(props.x2);
    const left = Math.min(x1, x2);
    const width = Math.abs(x2 - x1);
    const top = Math.min(Number(props.y1), Number(props.y2));
    const x = align === 'start' ? left + 4 : align === 'end' ? left + width - 4 : left;
    return (
      <g className={className} {...attributes}>
        <line {...props} className="recharts-reference-line-line" />
        <Text
          {...ON_PLOT_TEXT}
          className={cn(`${className}-label`, HALO_CLASS)}
          x={x}
          y={top - 4}
          width={align === 'middle' ? 160 : Math.max(width - 8, 48)}
          maxLines={align === 'middle' ? 1 : 3}
          textAnchor={align}
          verticalAnchor="end"
        >
          {text}
        </Text>
      </g>
    );
  };
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

  const tooltipFormatter = (value: unknown, name: unknown, item?: { payload?: DrawnRow }) => {
    // A waterfall bar's value is its [low, high] range and a funnel stage's its count: the
    // tooltip prints what the bar is labelled with — the signed delta, the stage's share.
    const printed = item?.payload ? printedValueOf(item.payload, String(name), block) : null;
    const formatted =
      printed ??
      (typeof value === 'string' || typeof value === 'number'
        ? formatChartValue(value, block)
        : String(value ?? '—'));
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

  const isCartesian = isCartesianChart(block);
  const horizontal = isHorizontalChart(block);
  const isWaterfall = block.chart_type === 'waterfall';
  const isFunnel = block.chart_type === 'funnel';
  const isStacked = block.chart_type === 'stacked_bar';
  const rows = drawnRowsOf(block);
  const seriesKeys = seriesKeysOf(block);
  const categories = rows.map((point) => String(point[block.category_key] ?? ''));
  const hasLongCategories = categories.some((category) => category.length > 18);
  // A chart on its side wraps its names down the side and grows downward, never sideways; a
  // waterfall's causes wrap under their bars like any tick, rather than scroll the answer.
  const minChartWidth =
    isCartesian && !horizontal && !isWaterfall && hasLongCategories
      ? Math.max(640, rows.length * 128)
      : undefined;
  const seriesLabel = (key: string) => block.chart_config[key]?.label ?? key;
  const accessibleData = rows
    .map((point) => {
      const category = point[block.category_key];
      const values = seriesKeys.flatMap((key) => {
        const printed = printedValueOf(point, key, block);
        return printed == null ? [] : `${seriesLabel(key)} ${printed}`;
      });
      return `${String(category ?? 'Unknown category')}: ${values.join(', ')}`;
    })
    .join('; ');
  const accessibleCallouts = [
    ...(block.reference_lines ?? []).map(
      (line) =>
        `Reference line ${line.label} ${formatChartValue(line.value, block)}${
          line.axis === 'right' ? ' on the right axis' : ''
        }`,
    ),
    ...(block.markers ?? []).map((marker) => `Marker ${marker.label} at ${marker.category}`),
  ];

  // Recharts animates every series in on mount. An export document is built in an
  // offscreen frame where rAF is throttled, so the animation never advances and the
  // series draws at zero progress: axes and gridlines appear, the LINE and the PIE
  // do not. The chart looks structurally fine and is empty. On screen Recharts' 'auto'
  // animates unless the reader asked for reduced motion.
  const animate = isExport ? false : 'auto';

  const hasRightAxis = Object.values(block.series_axis ?? {}).includes('right');
  const axisOf = (key: string) => (block.series_axis?.[key] === 'right' ? 'right' : 'left');
  const onValueAxis = (axis: 'left' | 'right') =>
    horizontal ? { xAxisId: axis } : { yAxisId: axis };
  const valueTickFormatter = (value: string | number) => formatChartValue(value, block);
  const formatPlotted = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? formatChartValue(value, block) : null;
  const printLabel = (value: unknown) => (typeof value === 'string' ? value : null);
  const showValues = block.show_values === true;
  // A marked category on a chart laid on its side is called out in its own tick.
  const tickMarkers = new Map(
    horizontal
      ? (block.markers ?? []).map((marker) => [String(marker.category), marker.label] as const)
      : [],
  );
  const lineMarkers = horizontal ? [] : (block.markers ?? []);
  const barsPerRow =
    isStacked || isWaterfall || isFunnel
      ? 1
      : seriesKeys.filter((key) => seriesKindOf(block, key) === 'bar').length;
  const showLegend = isCartesian && !isWaterfall && !isFunnel && seriesKeys.length > 1;
  // Room above the plot for a goal's or a marker's label and a bar's value; to its right for
  // the value at the end of the longest bar on its side.
  const needsHeadroom =
    !!block.reference_lines?.length ||
    (!horizontal && (isWaterfall || showValues || lineMarkers.length > 0));
  // Rows that are entities name every one of them; rows that are moments in time (a chart with
  // no bars) let Recharts skip the dates that would collide.
  const rowsAreMoments = seriesKeys.every((key) => seriesKindOf(block, key) !== 'bar');
  const everyName = !horizontal && !rowsAreMoments;
  const tickLines = tickLineBudget(categories, everyName);
  const needsRightRoom = horizontal && (isFunnel || (showValues && !isStacked));
  const margin =
    needsHeadroom || needsRightRoom
      ? { top: needsHeadroom ? 20 : 5, right: needsRightRoom ? 88 : 5, bottom: 5, left: 5 }
      : undefined;

  // The screen chart is a 240px plot over an axis area sized to its tallest wrapped tick
  // (`chartHeight`); it was a fixed 380px that spent 112px on ticks whether the dates
  // wrapped or not. The paper chart is 240px in all, where that leaves almost nothing for
  // the plot — and every tick is drawn because interval={0}, so 14 dates collapse into a
  // smear. A chart on its side is as tall as its rows instead.
  const valueAxisLabel = block.y_axis_label
    ? horizontal
      ? { value: block.y_axis_label, position: 'insideBottom' as const, offset: -4 }
      : { value: block.y_axis_label, angle: -90, position: 'insideLeft' as const }
    : undefined;
  const categoryAxis = horizontal ? (
    <YAxis
      type="category"
      dataKey={block.category_key}
      interval={0}
      width={CATEGORY_AXIS_PX}
      tick={categoryTick(tickMarkers)}
    />
  ) : (
    <XAxis
      dataKey={block.category_key}
      interval={isExport || rowsAreMoments ? 'preserveStartEnd' : 0}
      height={isExport ? 40 : tickAreaHeight(categories, everyName)}
      tick={isExport ? { fill: AXIS_TEXT } : wrappedXAxisTick(tickLines)}
      label={
        block.x_axis_label
          ? { value: block.x_axis_label, position: 'insideBottom', offset: -4 }
          : undefined
      }
    />
  );
  const valueAxes = (['left', 'right'] as const)
    .filter((axis) => axis === 'left' || hasRightAxis)
    .map((axis) =>
      horizontal ? (
        <XAxis
          key={axis}
          xAxisId={axis}
          type="number"
          orientation={axis === 'right' ? 'top' : 'bottom'}
          hide={isFunnel}
          tick={{ fill: AXIS_TEXT }}
          tickFormatter={valueTickFormatter}
          label={axis === 'left' ? valueAxisLabel : undefined}
        />
      ) : (
        <YAxis
          key={axis}
          yAxisId={axis}
          orientation={axis}
          // Sized to its own ticks: two fixed 104px axes left a 375px combo 50px of plot.
          width={isExport ? 72 : 'auto'}
          tick={{ fill: AXIS_TEXT }}
          tickFormatter={valueTickFormatter}
          label={axis === 'left' ? valueAxisLabel : undefined}
        />
      ),
    );

  const referenceLines = (block.reference_lines ?? []).map((line, index) => {
    const axis = line.axis ?? 'left';
    const text = `${line.label} · ${formatChartValue(line.value, block)}`;
    return (
      <ReferenceLine
        key={`reference-${index}-${line.label}`}
        {...(horizontal ? { x: line.value } : { y: line.value })}
        {...onValueAxis(axis)}
        ifOverflow="extendDomain"
        stroke="var(--muted-foreground)"
        strokeWidth={1.5}
        strokeDasharray={line.style === 'solid' ? undefined : '6 4'}
        shape={calloutShape(
          text,
          horizontal ? 'middle' : axis === 'right' ? 'end' : 'start',
          'chart-reference',
          {
            'data-chart-reference-line': line.label,
            'data-chart-reference-axis': axis,
            'data-chart-reference-value': line.value,
            'data-chart-reference-style': line.style ?? 'dashed',
          },
        )}
      />
    );
  });
  const markerLines = lineMarkers.map((marker, index) => {
    // The axis holds the row's own value: a marker given as 27 marks the row whose key is "27".
    const category =
      rows.find((row) => String(row[block.category_key]) === String(marker.category))?.[
        block.category_key
      ] ?? marker.category;
    return (
      <ReferenceLine
        key={`marker-${index}-${marker.label}`}
        x={category as string | number}
        yAxisId="left"
        stroke="var(--muted-foreground)"
        strokeDasharray="2 3"
        shape={calloutShape(marker.label, 'middle', 'chart-marker', {
          'data-chart-marker': marker.label,
          'data-chart-marker-category': String(marker.category),
        })}
      />
    );
  });

  // Bars first, areas over them, lines on top: a cost line drawn under its spend bars shows
  // only in the gaps between them.
  const DRAW_ORDER = { bar: 0, area: 1, line: 2 } as const;
  const drawnSeriesKeys = [...seriesKeys].sort(
    (a, b) => DRAW_ORDER[seriesKindOf(block, a)] - DRAW_ORDER[seriesKindOf(block, b)],
  );
  const series = drawnSeriesKeys.map((key) => {
    const color = `var(--color-${key})`;
    const axisProps = onValueAxis(axisOf(key));
    if (isWaterfall) {
      return (
        <Bar
          key={key}
          {...axisProps}
          isAnimationActive={animate}
          dataKey={RANGE_KEY}
          name={key}
          fill={color}
        >
          {rows.map((row, index) => (
            <Cell
              key={`${categories[index]}-${index}`}
              fill={row[TOTAL_KEY] ? 'var(--muted-foreground)' : color}
            />
          ))}
          <LabelList dataKey={LABEL_KEY} content={barValueLabel(printLabel, 'above')} />
        </Bar>
      );
    }
    if (isFunnel) {
      return (
        <Bar
          key={key}
          {...axisProps}
          isAnimationActive={animate}
          dataKey={key}
          fill={color}
          minPointSize={6}
        >
          <LabelList dataKey={LABEL_KEY} content={barValueLabel(printLabel, 'beside')} />
        </Bar>
      );
    }
    const kind = seriesKindOf(block, key);
    const pointLabels = showValues ? (
      <LabelList
        dataKey={key}
        position="top"
        formatter={(value) => formatPlotted(value)}
        {...ON_PLOT_TEXT}
        className={cn('chart-value-label', HALO_CLASS)}
      />
    ) : null;
    if (kind === 'line') {
      return (
        <Line
          key={key}
          {...axisProps}
          isAnimationActive={animate}
          type="monotone"
          dataKey={key}
          stroke={color}
          dot={false}
        >
          {pointLabels}
        </Line>
      );
    }
    if (kind === 'area') {
      return (
        <Area
          key={key}
          {...axisProps}
          isAnimationActive={animate}
          type="monotone"
          dataKey={key}
          stroke={color}
          fill={color}
          fillOpacity={0.2}
        >
          {pointLabels}
        </Area>
      );
    }
    return (
      <Bar
        key={key}
        {...axisProps}
        isAnimationActive={animate}
        dataKey={key}
        fill={color}
        stackId={isStacked ? 'stack' : undefined}
      >
        {showValues ? (
          <LabelList
            dataKey={key}
            content={barValueLabel(
              formatPlotted,
              isStacked ? 'inside' : horizontal ? 'beside' : 'above',
            )}
          />
        ) : null}
      </Bar>
    );
  });

  // One kind of series keeps its own chart (a bar chart's hover band, a line chart's cursor);
  // bars and lines together are a composed chart.
  const kinds = new Set(seriesKeys.map((key) => seriesKindOf(block, key)));
  const CartesianChart =
    kinds.size > 1
      ? ComposedChart
      : kinds.has('line')
        ? LineChart
        : kinds.has('area')
          ? AreaChart
          : BarChart;

  let chart: React.ReactNode;

  if (isCartesian) {
    chart = (
      <CartesianChart data={rows} layout={horizontal ? 'vertical' : undefined} margin={margin}>
        {isFunnel ? null : <CartesianGrid vertical={horizontal} horizontal={!horizontal} />}
        {categoryAxis}
        {valueAxes}
        <ChartTooltip content={tooltipContent} />
        {showLegend ? (
          <ChartLegend itemSorter={null} content={<ChartLegendContent className="flex-wrap" />} />
        ) : null}
        {series}
        {referenceLines}
        {markerLines}
      </CartesianChart>
    );
  } else if (block.chart_type === 'radar') {
    chart = (
      <RadarChart data={block.data}>
        <PolarGrid />
        <PolarAngleAxis dataKey={block.category_key} />
        <ChartTooltip content={tooltipContent} />
        {seriesKeys.map((key) => (
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
          dataKey={block.value_key ?? seriesKeys[0] ?? 'value'}
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

  // The chart keeps its plot and loses its frame: it sits on the neutral module fill. A chart
  // that degrades to tiles takes no fill of its own — each tile is already a module.
  return (
    <div
      className={shape.earnsChart ? JAINA_MODULE.neutral : undefined}
      data-jaina-module={shape.earnsChart ? 'block' : undefined}
      data-testid="chart-block"
      data-chart-type={block.chart_type}
      data-chart-block-id={block.block_id}
      data-chart-orientation={horizontal ? 'horizontal' : 'vertical'}
      data-chart-categories={JSON.stringify(categories)}
    >
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
        // A scroller only when the chart asks for more width than it has. Any other time its
        // scrollbar is a feedback loop: a legend that wraps at 375px raises one, the box loses
        // its width, and the chart stays drawn at the width it measured before it.
        <div className={minChartWidth ? 'overflow-x-auto' : undefined}>
          <ChartContainer
            config={chartConfig}
            explicitSize={
              isExport
                ? { width: EXPORT_CHART_WIDTH_PX, height: EXPORT_CHART_HEIGHT_PX }
                : undefined
            }
            className={isExport ? 'w-full' : 'aspect-auto w-full'}
            style={
              isExport
                ? undefined
                : {
                    height:
                      (horizontal
                        ? horizontalChartHeight(rows.length, barsPerRow)
                        : chartHeight(categories, everyName)) + (showLegend ? LEGEND_PX : 0),
                    minWidth: minChartWidth,
                  }
            }
            role="img"
            aria-label={[
              block.title,
              block.x_axis_label,
              block.y_axis_label,
              accessibleData,
              ...accessibleCallouts,
            ]
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
