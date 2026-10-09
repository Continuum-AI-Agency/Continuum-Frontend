import { sectionOfBlockCategory } from '@continuum/contracts';
import { Fragment, type ReactNode, useId } from 'react';
import type { CheckpointBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { type AnswerLanguage, SECTION_LABELS } from '../answerLanguage';
import { BlockHeading } from '../blocks/BlockHeading';
import { FLATTEN_NESTED_MODULE, JAINA_MODULE_GAP } from '../blocks/modules';
import { narrativeThreeOf } from '../blocks/narrativeShape';
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
 * ACTION (the moves). The J2 card's own parts take no label: the templated executive, the
 * window line, the metric tiles and a narrative that carries its three boxes each say what
 * they are on their own face, and "Por qué" over a row of tiles would label a label.
 */
export type AnswerStratum = 'answer' | 'why' | 'action';

export function stratumOfBlock(block: CheckpointBlockV2): AnswerStratum {
  switch (block.category) {
    case 'answer_template':
    case 'data_scope':
    case 'metric_grid':
      return 'answer';
    case 'actions':
      return 'action';
    case 'narrative':
      return narrativeThreeOf(block) ? 'answer' : 'why';
    default:
      return 'why';
  }
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

/**
 * One evidence block, folded. The disclosure line is the block's own heading — title and
 * provenance affordance — so the heading the block draws for itself is hidden inside the
 * fold rather than printed twice. The first fold is open by default (J3's rule, adopted by
 * the recommendation: everything that is neither the answer nor its reading folds, and the
 * reader still sees the first table without a click); the rest open on demand.
 *
 * The fold IS the module: the neutral fill, no border. The block inside would draw its own
 * module, so its fill is flattened into the fold's rather than stacked on it.
 */
function EvidenceFold({
  block,
  open,
  children,
}: {
  block: CheckpointBlockV2;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-xl bg-muted/40"
      data-evidence-fold={block.block_id}
      open={open}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 marker:content-none sm:px-4">
        <BlockHeading
          title={block.title}
          provenance={block.provenance}
          datasetId={'dataset_id' in block ? block.dataset_id : undefined}
          evidenceRefs={'evidence_refs' in block ? block.evidence_refs : undefined}
          className="mb-0"
        />
      </summary>
      {/* The block draws this same heading for itself; inside the fold the summary is it. */}
      <div
        className={cn(
          'px-3 pb-3 sm:px-4 sm:pb-4 [&_[data-block-heading]]:hidden',
          FLATTEN_NESTED_MODULE,
        )}
      >
        {children}
      </div>
    </details>
  );
}

type JainaJustificationSectionProps = {
  blocks: CheckpointBlockV2[];
  renderBlock: (block: CheckpointBlockV2) => ReactNode;
  /** Set ahead of the blocks: a templated answer's own justification (`TemplateJustification`). */
  leading?: ReactNode;
  /** The answer's language; the heading follows it. */
  language?: AnswerLanguage;
  /** False on paper: an export prints every block unfolded, because paper cannot click. */
  fold?: boolean;
  className?: string;
};

/**
 * The charts, tables and figures the executive answer rests on, under a heading that says
 * so. The section is always open — the evidence is part of the report, not a disclosure
 * the reader has to find — and each block inside it folds, the first open by default.
 * Paper cannot click, so the export document passes `fold={false}`. Renders nothing when
 * there is no evidence to show, so an answer without figures never carries an empty
 * heading.
 */
export function JainaJustificationSection({
  blocks,
  renderBlock,
  leading,
  language = 'en',
  fold = true,
  className,
}: JainaJustificationSectionProps) {
  const headingId = useId();
  if (blocks.length === 0 && !leading) return null;
  const labels = SECTION_LABELS[language];

  return (
    <section
      aria-labelledby={headingId}
      data-report-section="justification"
      className={cn('flex flex-col', JAINA_MODULE_GAP, className)}
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
      <div className={cn('flex flex-col', JAINA_MODULE_GAP)}>
        {leading}
        {blocks.map((block, index) =>
          fold ? (
            <EvidenceFold key={block.block_id} block={block} open={index === 0}>
              {renderBlock(block)}
            </EvidenceFold>
          ) : (
            <Fragment key={block.block_id}>{renderBlock(block)}</Fragment>
          ),
        )}
      </div>
    </section>
  );
}
