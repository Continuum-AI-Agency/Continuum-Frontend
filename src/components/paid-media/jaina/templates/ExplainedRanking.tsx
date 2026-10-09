'use client';

// `explained_ranking` (approved idea 7, "Ranking que se explica"). The order sits beside the
// sentence as bars against the account average; under "found", every ranked row opens to its
// own reason — the justification is "why this one is here", not one general paragraph. On
// paper nothing can be clicked open, so an export prints every row open.

import type { TemplateItem } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { useIsExportMode } from '../export/ExportModeContext';
import { JAINA_TYPE, JUDGEMENT_TEXT } from '../reading';
import { FigureById, FigureText } from './Figure';
import { GenericHero, GenericSectionBody, TONE_JUDGEMENT } from './GenericTemplate';
import type { TemplateRenderer, TemplateSectionBodyProps } from './types';

function RankedRow({
  item,
  position,
  figures,
  open,
}: {
  item: TemplateItem;
  position: number;
  figures: TemplateSectionBodyProps['block']['figures'];
  open: boolean;
}) {
  return (
    <details open={open} data-rank={position} className="group rounded-xl bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full bg-muted text-primary',
            JAINA_TYPE.label,
          )}
        >
          {position}
        </span>
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
                  {index > 0 ? ' · ' : null}
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
      <p className={cn('px-3 pb-3 pl-12 text-muted-foreground', JAINA_TYPE.body)}>
        <FigureText text={item.text} figures={figures} />
      </p>
    </details>
  );
}

export function ExplainedRankingSectionBody({ block, section }: TemplateSectionBodyProps) {
  const exporting = useIsExportMode();
  if (section.kind !== 'found' || section.items.length === 0) {
    return <GenericSectionBody block={block} section={section} />;
  }
  return (
    <div className="space-y-2" data-testid="explained-ranking-rows">
      {section.items.map((item, index) => (
        <RankedRow
          key={item.id}
          item={item}
          position={index + 1}
          figures={block.figures}
          open={exporting || index === 0}
        />
      ))}
    </div>
  );
}

export const explainedRankingRenderer: TemplateRenderer = {
  Hero: GenericHero,
  SectionBody: ExplainedRankingSectionBody,
};
