'use client';

// The renderer every template starts with: the hero chart as bars, and under each section its
// chart, table and items as they come. A stub template renders through this until its owner
// ships a dedicated renderer; a finished one may keep using either half.

import { cn } from '@/lib/utils';
import { JAINA_TYPE, JUDGEMENT_TEXT } from '../reading';
import { FigureById, FigureText } from './Figure';
import { TemplateChartView } from './TemplateChartView';
import { TemplateTableView } from './TemplateTableView';
import type { TemplateHeroProps, TemplateRenderer, TemplateSectionBodyProps } from './types';

export const TONE_JUDGEMENT = {
  good: 'positive',
  warn: 'watch',
  bad: 'risk',
  neutral: 'neutral',
} as const;

export function GenericHero({ block }: TemplateHeroProps) {
  const chart = block.executive.hero_chart;
  if (!chart) return null;
  return <TemplateChartView chart={chart} figures={block.figures} />;
}

export function GenericSectionBody({ block, section }: TemplateSectionBodyProps) {
  return (
    <div className="space-y-3">
      {section.chart ? <TemplateChartView chart={section.chart} figures={block.figures} /> : null}
      {section.table ? <TemplateTableView table={section.table} figures={block.figures} /> : null}
      {section.items.length > 0 ? (
        <ul className="space-y-2">
          {section.items.map((item) => (
            <li
              key={item.id}
              className={cn('rounded-md border border-border/50 px-3 py-2', JAINA_TYPE.body)}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-foreground">{item.title}</span>
                <FigureById
                  figures={block.figures}
                  id={item.badge_figure_id}
                  className={cn(JUDGEMENT_TEXT[TONE_JUDGEMENT[item.tone]])}
                />
              </div>
              <p className="mt-1 text-muted-foreground">
                <FigureText text={item.text} figures={block.figures} />
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const genericTemplateRenderer: TemplateRenderer = {
  Hero: GenericHero,
  SectionBody: GenericSectionBody,
};
