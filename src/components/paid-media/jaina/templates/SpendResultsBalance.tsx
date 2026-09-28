'use client';

// OWNED BY the spend_results_balance agent — only that agent edits this file. Recipe:
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md.
//
// `spend_results_balance` (approved idea 15, "Balanza de gasto contra resultados"). Beside the
// sentence: two 100% stacked bars, the share of spend each campaign takes over the share of
// results it brings, joined by bands — a band that widens is a campaign bringing more than it
// costs, one that narrows brings less. The hero chart carries the spend shares first and the
// result shares second, same labels, same order (the contract holds that). Under "found" the
// share table with each row's index coloured by its reading; under "why" two panels: whether
// the campaign type is ruled out, and the size of the gap.

import {
  formatFigure,
  type TemplateChartPoint,
  type TemplateFigure,
  type TemplateItem,
  type TemplateSection,
} from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { JAINA_TABLE, JAINA_TYPE, JUDGEMENT_RULE, JUDGEMENT_TEXT } from '../reading';
import { FigureById, FigureText, figureAttributes, figureById, figureTitle } from './Figure';
import { GenericHero, GenericSectionBody, TONE_JUDGEMENT } from './GenericTemplate';
import type { TemplateHeroProps, TemplateRenderer, TemplateSectionBodyProps } from './types';

const LABEL_WIDTH = 112;
const PLOT_WIDTH = 300;
const WIDTH = LABEL_WIDTH + PLOT_WIDTH + 8;
const BAR_HEIGHT = 30;
const SPEND_Y = 8;
const RESULTS_Y = 88;
const HEIGHT = RESULTS_Y + BAR_HEIGHT + 4;
/**
 * A segment narrower than this carries no printed share; the aria-label still names it. Five
 * characters ("18.2%") at 12 units, about 7.2 units each.
 */
const MIN_LABELLED_WIDTH = 36;
/** Un-emphasised segments alternate between two strengths so neighbours stay apart. */
const QUIET_OPACITY = [0.45, 0.25] as const;

type Segment = {
  point: TemplateChartPoint;
  figure: TemplateFigure;
  x: number;
  width: number;
};

type Group = {
  label: string;
  emphasis: boolean;
  tone: TemplateItem['tone'] | null;
  spend: Segment;
  results: Segment;
};

const sectionOf = (sections: ReadonlyArray<TemplateSection>, kind: string) =>
  sections.find((section) => section.kind === kind) ?? null;

const stack = (
  pairs: ReadonlyArray<{ point: TemplateChartPoint; figure: TemplateFigure }>,
): Segment[] => {
  let cursor = LABEL_WIDTH;
  return pairs.map(({ point, figure }) => {
    const share = Math.max(0, Math.min(1, figure.value ?? 0));
    const segment = { point, figure, x: cursor, width: share * PLOT_WIDTH };
    cursor += segment.width;
    return segment;
  });
};

/** The paired groups the chart draws, or null when the chart is not the paired shape. */
const groupsOf = (block: TemplateHeroProps['block']): Group[] | null => {
  const chart = block.executive.hero_chart;
  if (!chart || chart.points.length % 2 !== 0) return null;
  const half = chart.points.length / 2;
  const resolved = chart.points.map((point) => ({
    point,
    figure: figureById(block.figures, point.figure_id),
  }));
  if (resolved.some(({ figure }) => figure === null)) return null;
  const pairs = resolved as Array<{ point: TemplateChartPoint; figure: TemplateFigure }>;
  const spend = stack(pairs.slice(0, half));
  const results = stack(pairs.slice(half));
  if (spend.some((segment, index) => segment.point.label !== results[index]?.point.label)) {
    return null;
  }
  const items = sectionOf(block.justification.sections, 'found')?.items ?? [];
  return spend.map((segment, index) => ({
    label: segment.point.label,
    emphasis: segment.point.emphasis,
    tone: items.find((item) => item.title === segment.point.label)?.tone ?? null,
    spend: segment,
    results: results[index],
  }));
};

/** The ink a group is drawn in: its reading's tone when the sentence is about it, else quiet. */
const inkOf = (group: Group): string =>
  group.emphasis && group.tone
    ? JUDGEMENT_TEXT[TONE_JUDGEMENT[group.tone]]
    : 'text-muted-foreground';

const opacityOf = (group: Group, index: number): number =>
  group.emphasis ? 0.85 : QUIET_OPACITY[index % QUIET_OPACITY.length];

function SegmentBar({
  segment,
  y,
  group,
  index,
}: {
  segment: Segment;
  y: number;
  group: Group;
  index: number;
}) {
  return (
    <g className={inkOf(group)}>
      <title>{`${segment.point.label} · ${figureTitle(segment.figure)}`}</title>
      <rect
        x={segment.x}
        y={y}
        width={Math.max(0, segment.width)}
        height={BAR_HEIGHT}
        fill="currentColor"
        fillOpacity={opacityOf(group, index)}
        className="stroke-background"
        strokeWidth={1}
      />
      {segment.width >= MIN_LABELLED_WIDTH ? (
        <text
          x={segment.x + segment.width / 2}
          y={y + BAR_HEIGHT / 2 + 4}
          textAnchor="middle"
          {...figureAttributes(segment.figure)}
          className={cn('fill-foreground', group.emphasis && 'font-semibold')}
        >
          {formatFigure(segment.figure)}
        </text>
      ) : null}
    </g>
  );
}

export function SpendResultsBalanceHero({ block }: TemplateHeroProps) {
  const groups = groupsOf(block);
  const chart = block.executive.hero_chart;
  if (!chart || !groups) return <GenericHero block={block} />;
  const columns = sectionOf(block.justification.sections, 'found')?.table?.columns ?? [];
  const spendLabel = columns.find((column) => column.key === 'spend_share')?.label ?? '';
  const resultsLabel = columns.find((column) => column.key === 'results_share')?.label ?? '';
  return (
    <figure className="space-y-2" data-template-chart="spend_results_balance">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        className="block max-w-[560px] text-xs"
        aria-label={`${chart.title}: ${groups
          .map(
            (group) =>
              `${group.label} ${formatFigure(group.spend.figure)} → ${formatFigure(group.results.figure)}`,
          )
          .join('; ')}`}
      >
        {groups.map((group) => (
          <polygon
            key={`band-${group.label}`}
            data-band={group.label}
            className={inkOf(group)}
            fill="currentColor"
            fillOpacity={group.emphasis ? 0.16 : 0.08}
            points={[
              `${group.spend.x},${SPEND_Y + BAR_HEIGHT}`,
              `${group.spend.x + group.spend.width},${SPEND_Y + BAR_HEIGHT}`,
              `${group.results.x + group.results.width},${RESULTS_Y}`,
              `${group.results.x},${RESULTS_Y}`,
            ].join(' ')}
          />
        ))}
        <text x={0} y={SPEND_Y + BAR_HEIGHT / 2 + 4} className="fill-foreground font-semibold">
          {spendLabel}
        </text>
        <text x={0} y={RESULTS_Y + BAR_HEIGHT / 2 + 4} className="fill-foreground font-semibold">
          {resultsLabel}
        </text>
        {groups.map((group, index) => (
          <SegmentBar
            key={`spend-${group.label}`}
            segment={group.spend}
            y={SPEND_Y}
            group={group}
            index={index}
          />
        ))}
        {groups.map((group, index) => (
          <SegmentBar
            key={`results-${group.label}`}
            segment={group.results}
            y={RESULTS_Y}
            group={group}
            index={index}
          />
        ))}
      </svg>
      <ul
        className={cn('flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground', JAINA_TYPE.table)}
        data-balance-legend
      >
        {groups.map((group, index) => (
          <li key={group.label} className="flex min-w-0 items-center gap-1.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 10 10"
              className={cn('size-2.5 shrink-0', inkOf(group))}
            >
              <rect
                width={10}
                height={10}
                rx={2}
                fill="currentColor"
                fillOpacity={opacityOf(group, index)}
              />
            </svg>
            <span
              className={cn('truncate', group.emphasis && 'font-medium text-foreground')}
              title={group.label}
            >
              {group.label}
            </span>
          </li>
        ))}
      </ul>
      {chart.caption ? (
        <figcaption className={cn('text-muted-foreground', JAINA_TYPE.table)}>
          <FigureText text={chart.caption} figures={block.figures} />
        </figcaption>
      ) : null}
    </figure>
  );
}

function ShareTable({ block, section }: TemplateSectionBodyProps) {
  const table = section.table;
  if (!table) return null;
  const toneOfRow = (label: string) =>
    section.items.find((item) => item.title === label)?.tone ?? null;
  const lastRow = table.rows.length - 1;
  return (
    <div className="space-y-3">
      <div className={JAINA_TABLE.wrap}>
        <table className={JAINA_TABLE.table} data-balance-table>
          <thead>
            <tr className={JAINA_TABLE.headRow}>
              <th className={cn(JAINA_TABLE.th, 'text-left')} />
              {table.columns.map((column) => (
                <th key={column.key} className={cn(JAINA_TABLE.th, 'text-right')}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => {
              const tone = toneOfRow(row.label);
              const isTotal = rowIndex === lastRow && row.entity_id === null && tone === null;
              return (
                <tr
                  key={`${row.label}-${row.entity_id ?? ''}`}
                  className={cn(JAINA_TABLE.row, isTotal && 'font-semibold')}
                  data-tone={tone ?? undefined}
                >
                  <td
                    className={cn(JAINA_TABLE.td, 'max-w-[16rem] truncate text-foreground')}
                    title={row.label}
                  >
                    {row.label}
                  </td>
                  {table.columns.map((column) => (
                    <td key={column.key} className={cn(JAINA_TABLE.td, 'text-right')}>
                      {row.cells[column.key] ? (
                        <FigureById
                          figures={block.figures}
                          id={row.cells[column.key]}
                          className={cn(
                            'font-normal',
                            column.key === 'index' && tone && JUDGEMENT_TEXT[TONE_JUDGEMENT[tone]],
                            column.key === 'index' && tone && tone !== 'neutral' && 'font-semibold',
                            isTotal && 'font-semibold',
                          )}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {section.items.length > 0 ? (
        <ul className={cn('space-y-1', JAINA_TYPE.body)} data-balance-readings>
          {section.items.map((item) => (
            <li key={item.id} className="flex gap-2" data-tone={item.tone}>
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1 size-2 shrink-0 rounded-full bg-current',
                  JUDGEMENT_TEXT[TONE_JUDGEMENT[item.tone]],
                )}
              />
              <span className="min-w-0 text-muted-foreground">
                <span className="font-medium text-foreground">{item.title}</span>{' '}
                <FigureText text={item.text} figures={block.figures} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WhyPanels({ block, section }: TemplateSectionBodyProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-balance-panels>
      {section.items.map((item) => (
        <div
          key={item.id}
          data-panel={item.id}
          data-tone={item.tone}
          className={cn(
            'rounded-md border border-l-4 border-border/50 bg-muted/20 px-3 py-2',
            JUDGEMENT_RULE[TONE_JUDGEMENT[item.tone]],
          )}
        >
          <p className={cn('font-semibold text-foreground', JAINA_TYPE.body)}>{item.title}</p>
          <p className={cn('mt-1 text-muted-foreground', JAINA_TYPE.body)}>
            <FigureText text={item.text} figures={block.figures} />
          </p>
        </div>
      ))}
    </div>
  );
}

export function SpendResultsBalanceSectionBody({ block, section }: TemplateSectionBodyProps) {
  if (section.kind === 'found' && section.table)
    return <ShareTable block={block} section={section} />;
  if (section.kind === 'why' && section.items.length > 0)
    return <WhyPanels block={block} section={section} />;
  return <GenericSectionBody block={block} section={section} />;
}

export const spendResultsBalanceRenderer: TemplateRenderer = {
  Hero: SpendResultsBalanceHero,
  SectionBody: SpendResultsBalanceSectionBody,
};
