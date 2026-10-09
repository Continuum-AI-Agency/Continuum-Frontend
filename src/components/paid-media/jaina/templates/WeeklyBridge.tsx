'use client';

// OWNED BY the weekly_bridge agent — only that agent edits this file. Recipe:
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md.
//
// `weekly_bridge` (approved idea 8, "Puente de la semana"). Beside the sentence, a waterfall
// carries the week before's results to this week's, one step per campaign, each step standing
// on the level the previous one left. The axis may start above zero so small steps show; the
// Backend then places that floor as a figure (`reference`) and says so in the caption. Under
// "found", the per-campaign table and one row per step that opens to its split into spend
// and cost; under "why", the split of the whole movement as one bar. Paper prints every row
// open. Every value on screen is a figure element — this file computes geometry, never text.

import {
  formatFigure,
  type TemplateChart,
  type TemplateFigure,
  type TemplateItem,
} from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { useIsExportMode } from '../export/ExportModeContext';
import { JAINA_TYPE, JUDGEMENT_TEXT } from '../reading';
import { FigureById, FigureText, figureAttributes, figureById, figureTitle } from './Figure';
import { GenericHero, GenericSectionBody, TONE_JUDGEMENT } from './GenericTemplate';
import { TemplateTableView } from './TemplateTableView';
import type { TemplateHeroProps, TemplateRenderer, TemplateSectionBodyProps } from './types';

// Axis labels are up to 11 mono characters at 12 units (about 7.2 units each), so a bar and
// its gap together must clear 80 units for neighbouring labels not to touch.
const BAR_WIDTH = 52;
const BAR_GAP = 30;
const LEFT = 24;
const TOP = 26;
const PLOT_HEIGHT = 140;
const BASELINE = TOP + PLOT_HEIGHT;
const HEIGHT = BASELINE + 24;

type BarKind = 'start' | 'up' | 'down' | 'flat' | 'end';

type Bar = {
  kind: BarKind;
  label: string;
  figure: TemplateFigure;
  from: number;
  to: number;
  emphasis: boolean;
};

/** Start and end are totals standing on the floor; every step stands on the running level. */
function barsOf(
  chart: TemplateChart,
  figures: ReadonlyArray<TemplateFigure>,
  floor: number,
): Bar[] | null {
  const resolved = chart.points.map((point) => ({
    point,
    figure: figureById(figures, point.figure_id),
  }));
  if (resolved.length < 3 || resolved.some(({ figure }) => figure?.value == null)) return null;
  const bars: Bar[] = [];
  let level = 0;
  resolved.forEach(({ point, figure }, index) => {
    if (!figure || figure.value == null) return;
    const value = figure.value;
    if (index === 0 || index === resolved.length - 1) {
      bars.push({
        kind: index === 0 ? 'start' : 'end',
        label: point.label,
        figure,
        from: floor,
        to: value,
        emphasis: point.emphasis,
      });
      level = value;
      return;
    }
    bars.push({
      kind: value > 0 ? 'up' : value < 0 ? 'down' : 'flat',
      label: point.label,
      figure,
      from: level,
      to: level + value,
      emphasis: point.emphasis,
    });
    level += value;
  });
  return bars;
}

const BAR_TONE: Record<BarKind, string> = {
  start: 'text-muted-foreground/50',
  end: 'text-primary',
  up: JUDGEMENT_TEXT.positive,
  down: JUDGEMENT_TEXT.risk,
  flat: JUDGEMENT_TEXT.unjudged,
};

/** The short axis name: the first part of a "SITE // KIND // MONTH" campaign name. */
const shortLabel = (label: string): string => {
  const head = label.split(' // ')[0] ?? label;
  return head.length > 11 ? `${head.slice(0, 10)}…` : head;
};

const signed = (bar: Bar): string => `${bar.kind === 'up' ? '+' : ''}${formatFigure(bar.figure)}`;

export function WeeklyBridgeHero({ block }: TemplateHeroProps) {
  const chart = block.executive.hero_chart;
  if (!chart) return null;
  const floorFigure = chart.reference ? figureById(block.figures, chart.reference.figure_id) : null;
  const floor = floorFigure?.value ?? 0;
  const bars = chart.kind === 'bridge' ? barsOf(chart, block.figures, floor) : null;
  if (!bars) return <GenericHero block={block} />;

  const top = Math.max(...bars.flatMap((bar) => [bar.from, bar.to]));
  const range = top - floor || 1;
  const y = (value: number) => BASELINE - ((Math.max(floor, value) - floor) / range) * PLOT_HEIGHT;
  const width = LEFT + bars.length * (BAR_WIDTH + BAR_GAP);
  const xOf = (index: number) => LEFT + BAR_GAP / 2 + index * (BAR_WIDTH + BAR_GAP);

  return (
    <figure className="space-y-1" data-template-chart="bridge">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`${chart.title}: ${bars.map((bar) => `${bar.label} ${bar.kind === 'start' || bar.kind === 'end' ? formatFigure(bar.figure) : signed(bar)}`).join(', ')}`}
        className="font-mono text-xs"
      >
        <line x1={LEFT} x2={width - 4} y1={BASELINE} y2={BASELINE} className="stroke-border" />
        {bars.map((bar, index) => {
          const x = xOf(index);
          const upper = y(Math.max(bar.from, bar.to));
          const lower = y(Math.min(bar.from, bar.to));
          const next = bars[index + 1];
          const isTotal = bar.kind === 'start' || bar.kind === 'end';
          return (
            <g key={`${bar.figure.id}-${index}`}>
              <title>{`${bar.label} · ${figureTitle(bar.figure)}`}</title>
              <g className={BAR_TONE[bar.kind]}>
                <rect
                  data-bridge-bar={bar.kind}
                  data-level-from={bar.from}
                  data-level-to={bar.to}
                  x={x}
                  y={upper}
                  width={BAR_WIDTH}
                  height={Math.max(1, lower - upper)}
                  rx={2}
                  fill="currentColor"
                />
              </g>
              {next ? (
                <line
                  x1={x + BAR_WIDTH}
                  x2={x + BAR_WIDTH + BAR_GAP}
                  y1={y(bar.to)}
                  y2={y(bar.to)}
                  strokeDasharray="3 3"
                  className="stroke-muted-foreground/60"
                />
              ) : null}
              <text
                x={x + BAR_WIDTH / 2}
                y={bar.kind === 'down' ? lower + 12 : upper - 5}
                textAnchor="middle"
                className={cn(
                  isTotal ? 'fill-foreground' : BAR_TONE[bar.kind],
                  !isTotal && 'fill-current',
                  (bar.emphasis || bar.kind === 'end') && 'font-semibold',
                )}
              >
                {bar.kind === 'up' ? <tspan>+</tspan> : null}
                <tspan {...figureAttributes(bar.figure)}>{formatFigure(bar.figure)}</tspan>
              </text>
              <text
                x={x + BAR_WIDTH / 2}
                y={BASELINE + 14}
                textAnchor="middle"
                className={cn(
                  'fill-muted-foreground',
                  bar.emphasis && 'fill-foreground font-semibold',
                )}
              >
                {shortLabel(bar.label)}
              </text>
            </g>
          );
        })}
      </svg>
      {chart.caption ? (
        <figcaption className={cn('text-muted-foreground', JAINA_TYPE.table)}>
          <FigureText text={chart.caption} figures={block.figures} />
        </figcaption>
      ) : null}
    </figure>
  );
}

function StepRow({
  item,
  figures,
  open,
}: {
  item: TemplateItem;
  figures: TemplateSectionBodyProps['block']['figures'];
  open: boolean;
}) {
  return (
    <details open={open} data-step={item.id} className="group rounded-xl bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span
            className={cn('block truncate font-semibold text-foreground', JAINA_TYPE.body)}
            title={item.title}
          >
            {item.title}
          </span>
          {item.detail_figure_ids.length > 0 ? (
            <span className={cn('block text-muted-foreground', JAINA_TYPE.table)}>
              {item.detail_figure_ids.map((id, index) => (
                <span key={id}>
                  {index > 0 ? ' → ' : null}
                  <FigureById
                    figures={figures}
                    id={id}
                    className="font-normal text-muted-foreground"
                  />
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <span className={cn('shrink-0 rounded-full bg-muted px-2.5 py-0.5', JAINA_TYPE.table)}>
          <FigureById
            figures={figures}
            id={item.badge_figure_id}
            className={cn(JUDGEMENT_TEXT[TONE_JUDGEMENT[item.tone]])}
          />
        </span>
      </summary>
      <p className={cn('px-3 pb-3 text-muted-foreground', JAINA_TYPE.body)}>
        <FigureText text={item.text} figures={figures} />
      </p>
    </details>
  );
}

/** The whole movement as one bar: each effect's share of it, widths from the share figures. */
function EffectSplit({
  items,
  figures,
}: {
  items: TemplateItem[];
  figures: ReadonlyArray<TemplateFigure>;
}) {
  return (
    <div
      data-testid="weekly-bridge-split"
      className={cn('flex h-7 w-full overflow-hidden rounded-md', JAINA_TYPE.table)}
    >
      {items.map((item, index) => {
        const share = figureById(figures, item.badge_figure_id)?.value ?? 0;
        return (
          <span
            key={item.id}
            data-effect={item.id}
            style={{ flex: `${Math.max(share, 0.08)} 1 0%` }}
            className={cn(
              'flex min-w-0 items-center truncate px-2',
              index === 0 ? 'bg-muted text-foreground' : 'bg-muted/50 text-muted-foreground',
            )}
            title={item.title}
          >
            {`${item.title} · `}
            <FigureById figures={figures} id={item.badge_figure_id} className="font-semibold" />
          </span>
        );
      })}
    </div>
  );
}

export function WeeklyBridgeSectionBody({ block, section }: TemplateSectionBodyProps) {
  const exporting = useIsExportMode();
  if (section.kind === 'found' && section.table && section.items.length > 0) {
    return (
      <div className="space-y-3" data-testid="weekly-bridge-steps">
        <TemplateTableView table={section.table} figures={block.figures} />
        <div className="space-y-2">
          {section.items.map((item, index) => (
            <StepRow
              key={item.id}
              item={item}
              figures={block.figures}
              open={exporting || index === 0}
            />
          ))}
        </div>
      </div>
    );
  }
  if (section.kind === 'why' && section.items.length === 2) {
    return <EffectSplit items={section.items} figures={block.figures} />;
  }
  return <GenericSectionBody block={block} section={section} />;
}

export const weeklyBridgeRenderer: TemplateRenderer = {
  Hero: WeeklyBridgeHero,
  SectionBody: WeeklyBridgeSectionBody,
};
