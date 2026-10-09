'use client';

// A templated answer, in two halves that sit in two places on the page:
//   `TemplateExecutive`     — the one sentence and the chart of what it claims, in the ANSWER;
//   `TemplateJustification` — the sections in the block's layout, under the JUSTIFICATION.
// `JainaReportV2` and the export document place each half; any other surface that renders a
// block through `BlockRenderer` gets both, stacked (the default export).

import type { AnswerTemplateBlockV2, CheckpointBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JAINA_LEAD } from '../blocks/modules';
import { JAINA_ANSWER_PROSE } from '../reading';
import { FigureText } from './Figure';
import { Steps } from './layouts/Steps';
import { TEMPLATE_RENDERERS } from './registry';

export const isAnswerTemplateBlock = (block: CheckpointBlockV2): block is AnswerTemplateBlockV2 =>
  block.category === 'answer_template';

export function TemplateExecutive({ block }: { block: AnswerTemplateBlockV2 }) {
  const { Hero } = TEMPLATE_RENDERERS[block.template_id];
  return (
    <div className="space-y-3" data-template={block.template_id} data-template-part="executive">
      <p className={cn(JAINA_ANSWER_PROSE, JAINA_LEAD)}>
        <FigureText text={block.executive.sentence} figures={block.figures} />
      </p>
      <Hero block={block} />
    </div>
  );
}

export function TemplateJustification({
  block,
  narrated = false,
}: {
  block: AnswerTemplateBlockV2;
  /** The report carries a three-box narrative restating this template's found and why. */
  narrated?: boolean;
}) {
  const { SectionBody } = TEMPLATE_RENDERERS[block.template_id];
  // `steps` is the one layout built and the default for every template; null reads as steps.
  return (
    <div data-template={block.template_id} data-template-part="justification">
      <Steps block={block} SectionBody={SectionBody} narrated={narrated} />
    </div>
  );
}

export default function TemplateBlock({
  block,
}: {
  block: AnswerTemplateBlockV2;
  isStreaming: boolean;
}) {
  return (
    <div className="space-y-4">
      <TemplateExecutive block={block} />
      <TemplateJustification block={block} />
    </div>
  );
}
