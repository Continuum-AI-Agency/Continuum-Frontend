'use client';

// The `steps` justification (approved idea 1): Qué medimos / Qué encontramos / Por qué pasa,
// numbered, each with its text and its own visual. Sections the layout knows come in its
// order; any other section a template adds follows, in the block's order.

import { STEP_SECTION_KINDS, type TemplateSection } from '@continuum/contracts';
import type { ComponentType } from 'react';
import type { AnswerTemplateBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JAINA_TYPE } from '../../reading';
import { FigureText } from '../Figure';
import type { TemplateSectionBodyProps } from '../types';

const orderOf = (kind: string): number => {
  const index = (STEP_SECTION_KINDS as ReadonlyArray<string>).indexOf(kind);
  return index < 0 ? STEP_SECTION_KINDS.length : index;
};

export const orderedSteps = (sections: ReadonlyArray<TemplateSection>): TemplateSection[] =>
  sections
    .map((section, position) => ({ section, position }))
    .sort((a, b) => orderOf(a.section.kind) - orderOf(b.section.kind) || a.position - b.position)
    .map(({ section }) => section);

/** The steps whose text a three-box narrative restates: what was found, and why. */
const NARRATED_STEP_KINDS: ReadonlySet<string> = new Set(['found', 'why']);

type StepsProps = {
  block: AnswerTemplateBlockV2;
  SectionBody: ComponentType<TemplateSectionBodyProps>;
  /**
   * True when the report also carries a J2 narrative (what / so_what / now_what) built from
   * this template's found and why sections. Those two steps then keep their title and their
   * visual — the table, the chart, the items are the evidence — and drop the sentence the
   * three boxes already say, so the reader is not told the same thing twice in two places.
   */
  narrated?: boolean;
};

export function Steps({ block, SectionBody, narrated = false }: StepsProps) {
  return (
    <ol className="space-y-4" data-template-layout="steps">
      {orderedSteps(block.justification.sections).map((section, index) => (
        <li
          key={section.kind}
          className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3"
          data-step={section.kind}
          data-step-narrated={narrated && NARRATED_STEP_KINDS.has(section.kind) ? '' : undefined}
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid size-6 place-items-center rounded-full bg-muted text-primary',
              JAINA_TYPE.label,
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0 space-y-2">
            <p className={cn('text-foreground', JAINA_TYPE.body)}>
              <span className="font-semibold">{section.title}. </span>
              {narrated && NARRATED_STEP_KINDS.has(section.kind) ? null : (
                <span className="text-muted-foreground">
                  <FigureText text={section.text} figures={block.figures} />
                </span>
              )}
            </p>
            <SectionBody block={block} section={section} />
          </div>
        </li>
      ))}
    </ol>
  );
}
