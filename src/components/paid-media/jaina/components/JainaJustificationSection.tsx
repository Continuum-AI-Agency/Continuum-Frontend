import { sectionOfBlockCategory } from '@continuum/contracts';
import { Fragment, type ReactNode, useId } from 'react';
import type { CheckpointBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { type AnswerLanguage, SECTION_LABELS } from '../answerLanguage';
import { JAINA_TYPE } from '../reading';

export type PartitionedReportBlocks = {
  answer: CheckpointBlockV2[];
  justification: CheckpointBlockV2[];
};

/**
 * Splits a report's blocks into the answer and the figures that justify it.
 *
 * A stable filter, never a sort: each section keeps the backend's reading order
 * (`selectBlocksForPresentation`), so the `data_scope` frame still opens the
 * justification it frames.
 */
export function partitionReportBlocks(blocks: CheckpointBlockV2[]): PartitionedReportBlocks {
  const answer: CheckpointBlockV2[] = [];
  const justification: CheckpointBlockV2[] = [];
  for (const block of blocks) {
    if (sectionOfBlockCategory(block.category) === 'answer') answer.push(block);
    else justification.push(block);
  }
  return { answer, justification };
}

/**
 * The three strata of a finished answer, in the words of the answer's language. An
 * answer-section block is the WHY (the reading the sentence rests on) unless it is the
 * ACTION (the moves); a templated executive is the answer itself and takes no label.
 */
export type AnswerStratum = 'answer' | 'why' | 'action';

export function stratumOfBlock(block: CheckpointBlockV2): AnswerStratum {
  if (block.category === 'answer_template') return 'answer';
  return block.category === 'actions' ? 'action' : 'why';
}

type SectionLabelProps = {
  stratum: Exclude<AnswerStratum, 'answer'>;
  language: AnswerLanguage;
  id?: string;
};

/** A stratum's label: 12px caps, the smallest step of the scale, in the answer's language. */
export function SectionLabel({ stratum, language, id }: SectionLabelProps) {
  return (
    <p
      id={id}
      data-report-label={stratum}
      className={cn(JAINA_TYPE.label, 'text-muted-foreground')}
    >
      {SECTION_LABELS[language][stratum]}
    </p>
  );
}

type JainaJustificationSectionProps = {
  blocks: CheckpointBlockV2[];
  renderBlock: (block: CheckpointBlockV2) => ReactNode;
  /** Set ahead of the blocks: a templated answer's own justification (`TemplateJustification`). */
  leading?: ReactNode;
  /** The answer's language; the heading follows it. */
  language?: AnswerLanguage;
  className?: string;
};

/**
 * The charts, tables and figures the executive answer rests on, under a heading
 * that says so. Always open: the evidence is part of the report, not a disclosure
 * the reader has to find. Renders nothing when there is no evidence to show, so an
 * answer without figures never carries an empty heading.
 */
export function JainaJustificationSection({
  blocks,
  renderBlock,
  leading,
  language = 'en',
  className,
}: JainaJustificationSectionProps) {
  const headingId = useId();
  if (blocks.length === 0 && !leading) return null;
  const labels = SECTION_LABELS[language];

  return (
    <section
      aria-labelledby={headingId}
      data-report-section="justification"
      className={cn('space-y-3 border-t border-border/50 pt-4', className)}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3
          id={headingId}
          data-report-label="evidence"
          className={cn(JAINA_TYPE.label, 'text-muted-foreground')}
        >
          {labels.evidence}
        </h3>
        <p className="text-xs text-muted-foreground">{labels.evidenceDetail}</p>
      </header>
      <div className="space-y-4 border-l border-border/50 pl-3">
        {leading}
        {blocks.map((block) => (
          <Fragment key={block.block_id}>{renderBlock(block)}</Fragment>
        ))}
      </div>
    </section>
  );
}
