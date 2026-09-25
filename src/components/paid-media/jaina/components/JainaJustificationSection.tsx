import { sectionOfBlockCategory } from '@continuum/contracts';
import { Fragment, type ReactNode, useId } from 'react';
import type { CheckpointBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';

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

type JainaJustificationSectionProps = {
  blocks: CheckpointBlockV2[];
  renderBlock: (block: CheckpointBlockV2) => ReactNode;
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
  className,
}: JainaJustificationSectionProps) {
  const headingId = useId();
  if (blocks.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      data-report-section="justification"
      className={cn('space-y-3 border-t border-border/50 pt-4', className)}
    >
      <header className="space-y-0.5">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          Justification
        </h3>
        <p className="text-xs text-muted-foreground">The data behind the answer</p>
      </header>
      <div className="space-y-4 border-l border-border/50 pl-3">
        {blocks.map((block) => (
          <Fragment key={block.block_id}>{renderBlock(block)}</Fragment>
        ))}
      </div>
    </section>
  );
}
