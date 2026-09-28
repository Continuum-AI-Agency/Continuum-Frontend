'use client';

// OWNED BY the three_numbers agent — only that agent edits this file. Recipe:
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md.
//
// `three_numbers` (approved idea 13, "Tres números que importan"). Beside the sentence: three
// large numbers — spend, results, cost per result — each with its change against the
// same-length window before it when the Backend read one (the window's name otherwise), and
// under them the daily spend as a small line. Under "found", each number's own arithmetic
// (spend ÷ results = cost) in a calculation box, then the campaigns behind it. Nothing here
// collapses, so the export prints the same thing.

import { formatFigure, type TemplateChart, type TemplateFigure } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { JAINA_TYPE, JUDGEMENT_TEXT } from '../reading';
import { FigureById, FigureText, figureAttributes, figureById, figureTitle } from './Figure';
import { GenericSectionBody, TONE_JUDGEMENT } from './GenericTemplate';
import { TemplateChartView } from './TemplateChartView';
import { TemplateTableView } from './TemplateTableView';
import type { TemplateHeroProps, TemplateRenderer, TemplateSectionBodyProps } from './types';

/** The three numbers, and which way is better for each (null: spend is neither). */
const NUMBERS = [
  { id: 'spend', lowerIsBetter: null },
  { id: 'results', lowerIsBetter: false },
  { id: 'cpr', lowerIsBetter: true },
] as const;

type Direction = 'up' | 'down' | 'flat';

const directionOf = (now: TemplateFigure, before: TemplateFigure): Direction | null => {
  if (now.value == null || before.value == null) return null;
  return now.value > before.value ? 'up' : now.value < before.value ? 'down' : 'flat';
};

const ARROW: Record<Direction, string> = { up: '↑', down: '↓', flat: '→' };

function NumberPanel({
  figures,
  id,
  lowerIsBetter,
}: {
  figures: ReadonlyArray<TemplateFigure>;
  id: string;
  lowerIsBetter: boolean | null;
}) {
  const figure = figureById(figures, id);
  if (!figure) return null;
  const prior = figureById(figures, `${id}_prior`);
  const change = figureById(figures, `${id}_change`);
  const direction = prior ? directionOf(figure, prior) : null;
  const judgement =
    direction === null || direction === 'flat' || lowerIsBetter === null
      ? 'neutral'
      : (direction === 'down') === lowerIsBetter
        ? 'positive'
        : 'risk';
  return (
    <div
      className="min-w-0 rounded-md border border-border/60 bg-muted/20 px-3.5 py-3"
      data-three-number={id}
    >
      <div className={cn('truncate text-muted-foreground', JAINA_TYPE.label)}>{figure.label}</div>
      <div className="mt-1">
        <FigureById figures={figures} id={id} className={JAINA_TYPE.figure} />
      </div>
      {prior && change && direction ? (
        <div
          className={cn('mt-0.5 font-semibold', JAINA_TYPE.table, JUDGEMENT_TEXT[judgement])}
          data-direction={direction}
        >
          <span aria-hidden="true">{ARROW[direction]} </span>
          <FigureById
            figures={figures}
            id={change.id}
            className={cn('font-semibold', JUDGEMENT_TEXT[judgement])}
          />
          <span className="font-normal text-muted-foreground"> · {prior.window.label} </span>
          <FigureById
            figures={figures}
            id={prior.id}
            className="font-normal text-muted-foreground"
          />
        </div>
      ) : (
        <div className={cn('mt-0.5 text-muted-foreground', JAINA_TYPE.table)}>
          {figure.window.label}
        </div>
      )}
    </div>
  );
}

const WIDTH = 420;
const HEIGHT = 120;
const PAD_X = 8;
const TOP = 18;
const BOTTOM = 18;

/** The daily spend as a line; the highest day and the last day carry their value as figures. */
function DailyLine({
  chart,
  figures,
}: {
  chart: TemplateChart;
  figures: ReadonlyArray<TemplateFigure>;
}) {
  const points = chart.points.flatMap((point) => {
    const figure = figureById(figures, point.figure_id);
    return figure ? [{ point, figure }] : [];
  });
  if (points.length < 2) return <TemplateChartView chart={chart} figures={figures} />;
  const max = Math.max(1, ...points.map(({ figure }) => figure.value ?? 0));
  const x = (index: number) => PAD_X + (index / (points.length - 1)) * (WIDTH - 2 * PAD_X);
  const y = (value: number | null) =>
    TOP + (1 - Math.max(0, value ?? 0) / max) * (HEIGHT - TOP - BOTTOM);
  const peak = points.reduce(
    (best, candidate, index) =>
      (candidate.figure.value ?? 0) > (points[best].figure.value ?? 0) ? index : best,
    0,
  );
  const last = points.length - 1;
  const labelled = peak === last ? [last] : [peak, last];
  return (
    <figure className="space-y-1" data-template-chart={chart.kind}>
      <div className={cn('text-muted-foreground', JAINA_TYPE.label)}>{chart.title}</div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`${chart.title}: ${points.map(({ point, figure }) => `${point.label} ${formatFigure(figure)}`).join(', ')}`}
        className="font-mono text-xs"
      >
        <line
          x1={PAD_X}
          x2={WIDTH - PAD_X}
          y1={HEIGHT - BOTTOM}
          y2={HEIGHT - BOTTOM}
          className="stroke-border"
        />
        <polyline
          points={points.map(({ figure }, index) => `${x(index)},${y(figure.value)}`).join(' ')}
          fill="none"
          strokeWidth={2}
          className="stroke-primary"
        />
        {points.map(({ point, figure }, index) => (
          <circle
            key={point.figure_id}
            cx={x(index)}
            cy={y(figure.value)}
            r={index === peak || index === last ? 3.5 : 2}
            className={
              index === peak || index === last ? 'fill-primary' : 'fill-muted-foreground/60'
            }
          >
            <title>{`${point.label} · ${figureTitle(figure)}`}</title>
          </circle>
        ))}
        {labelled.map((index) => {
          const { figure } = points[index];
          return (
            <text
              key={figure.id}
              x={x(index)}
              y={y(figure.value) - 6}
              textAnchor={index === last ? 'end' : 'middle'}
              {...figureAttributes(figure)}
              className="fill-foreground font-semibold"
            >
              {formatFigure(figure)}
            </text>
          );
        })}
        <text x={PAD_X} y={HEIGHT - 4} className="fill-muted-foreground">
          {points[0].point.label}
        </text>
        <text x={WIDTH - PAD_X} y={HEIGHT - 4} textAnchor="end" className="fill-muted-foreground">
          {points[last].point.label}
        </text>
      </svg>
      {chart.caption ? (
        <figcaption className={cn('text-muted-foreground', JAINA_TYPE.table)}>
          <FigureText text={chart.caption} figures={figures} />
        </figcaption>
      ) : null}
    </figure>
  );
}

export function ThreeNumbersHero({ block }: TemplateHeroProps) {
  const chart = block.executive.hero_chart;
  return (
    <div className="space-y-3" data-testid="three-numbers">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {NUMBERS.map(({ id, lowerIsBetter }) => (
          <NumberPanel key={id} figures={block.figures} id={id} lowerIsBetter={lowerIsBetter} />
        ))}
      </div>
      {chart === null ? null : chart.kind === 'line' ? (
        <DailyLine chart={chart} figures={block.figures} />
      ) : (
        <TemplateChartView chart={chart} figures={block.figures} />
      )}
    </div>
  );
}

export function ThreeNumbersSectionBody({ block, section }: TemplateSectionBodyProps) {
  if (section.kind !== 'found' || section.items.length === 0) {
    return <GenericSectionBody block={block} section={section} />;
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2.5" data-testid="three-numbers-derivations">
        {section.items.map((item) => (
          <div key={item.id} data-derivation={item.badge_figure_id ?? item.id}>
            <div
              className={cn(
                'mb-1 flex items-baseline gap-2 text-muted-foreground',
                JAINA_TYPE.label,
              )}
            >
              <span>{item.title}</span>
              <FigureById
                figures={block.figures}
                id={item.badge_figure_id}
                className={cn('normal-case', JUDGEMENT_TEXT[TONE_JUDGEMENT[item.tone]])}
              />
            </div>
            <p
              className={cn(
                'overflow-x-auto rounded-md bg-muted/40 px-3 py-2.5 text-foreground',
                JAINA_TYPE.figure,
                'font-normal',
              )}
            >
              <FigureText text={item.text} figures={block.figures} figureClassName="text-primary" />
            </p>
          </div>
        ))}
      </div>
      {section.table ? <TemplateTableView table={section.table} figures={block.figures} /> : null}
    </div>
  );
}

export const threeNumbersRenderer: TemplateRenderer = {
  Hero: ThreeNumbersHero,
  SectionBody: ThreeNumbersSectionBody,
};
