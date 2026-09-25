'use client';

// A template chart, drawn from figure ids. Horizontal bars (a ranking against a reference
// line) are the MVP's hero; any other kind degrades to the same bars, which every template
// can read, until its owner ships a dedicated drawing. Inline SVG so the chat, the PDF and
// the HTML export print the same vector, and every value label is a figure element.

import { formatFigure, type TemplateChart, type TemplateFigure } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { FigureText, figureAttributes, figureById, figureTitle } from './Figure';

type TemplateChartViewProps = {
  chart: TemplateChart;
  figures: ReadonlyArray<TemplateFigure>;
  className?: string;
};

const ROW_HEIGHT = 30;
const LABEL_WIDTH = 190;
const PLOT_WIDTH = 250;
const VALUE_GUTTER = 70;
const TOP = 22;

const truncate = (text: string, max = 28): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export function TemplateChartView({ chart, figures, className }: TemplateChartViewProps) {
  const points = chart.points.flatMap((point) => {
    const figure = figureById(figures, point.figure_id);
    return figure ? [{ point, figure }] : [];
  });
  const reference = chart.reference ? figureById(figures, chart.reference.figure_id) : null;
  const values = [
    ...points.map(({ figure }) => figure.value ?? 0),
    ...(reference?.value != null ? [reference.value] : []),
  ].filter((value) => Number.isFinite(value) && value > 0);
  const max = values.length > 0 ? Math.max(...values) : 1;
  const x = (value: number | null) => LABEL_WIDTH + (Math.max(0, value ?? 0) / max) * PLOT_WIDTH;
  const height = TOP + points.length * ROW_HEIGHT + 8;
  const width = LABEL_WIDTH + PLOT_WIDTH + VALUE_GUTTER;

  return (
    <figure className={cn('space-y-1', className)} data-template-chart={chart.kind}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${chart.title}: ${points
          .map(({ point, figure }) => `${point.label} ${formatFigure(figure)}`)
          .join(', ')}`}
        className="font-mono text-[10px]"
      >
        {points.map(({ point, figure }, index) => {
          const y = TOP + index * ROW_HEIGHT;
          const end = x(figure.value);
          return (
            <g key={`${point.figure_id}-${index}`}>
              <title>{`${point.label} · ${figureTitle(figure)}`}</title>
              <text
                x={0}
                y={y + 13}
                className={cn(
                  'fill-muted-foreground',
                  point.emphasis && 'fill-foreground font-semibold',
                )}
              >
                {truncate(point.label)}
              </text>
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={Math.max(1, end - LABEL_WIDTH)}
                height={18}
                rx={3}
                className={point.emphasis ? 'fill-primary' : 'fill-muted-foreground/40'}
              />
              <text
                x={end + 5}
                y={y + 13}
                {...figureAttributes(figure)}
                className={cn('fill-muted-foreground', point.emphasis && 'fill-primary font-semibold')}
              >
                {formatFigure(figure)}
              </text>
            </g>
          );
        })}
        {reference && chart.reference ? (
          <g>
            <title>{figureTitle(reference)}</title>
            <line
              x1={x(reference.value)}
              x2={x(reference.value)}
              y1={TOP - 6}
              y2={height - 4}
              strokeDasharray="4 3"
              className="stroke-muted-foreground"
            />
            <text
              x={x(reference.value)}
              y={10}
              textAnchor="middle"
              className="fill-muted-foreground"
            >
              {`${chart.reference.label} `}
              <tspan {...figureAttributes(reference)}>{formatFigure(reference)}</tspan>
            </text>
          </g>
        ) : null}
      </svg>
      {chart.caption ? (
        <figcaption className="text-xs text-muted-foreground">
          <FigureText text={chart.caption} figures={figures} />
        </figcaption>
      ) : null}
    </figure>
  );
}
