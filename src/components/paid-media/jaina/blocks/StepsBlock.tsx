'use client';

// How to do something, in the order it is done (Ramiro, 2026-10-13: "cuando le pregunto cómo
// aprovechar una oportunidad, no me da pasos").
//
// Each step is one numbered move: the action set semibold because it is the line the reader
// acts on, then where it is done (an Ads Manager location or a Continuum surface) in muted
// ink, then what it should change. The figure a step stands on, when it stands on one, leads
// its own line in the figure face, money by the one rule (M1, `formatMoney`).
//
// A neutral module, not the decision tint: the steps are instructions the reader carries out
// on the platform, not a move Jaina is asking them to approve.

import { formatValue } from '@/lib/jaina/formatValue';
import type { StepsBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JAINA_TYPE } from '../reading';
import { BlockHeading } from './BlockHeading';
import { blockFigureAttributes } from './blockFigure';
import { BlockSourcesFooter, CitationChips } from './citations';
import { MediaText } from './mediaText';
import { JAINA_MODULE } from './modules';

type StepsBlockProps = { block: StepsBlockV2; isStreaming: boolean };
type StepFigure = NonNullable<StepsBlockV2['items'][number]['figure']>;

function StepFigureLine({ figure }: { figure: StepFigure }) {
  const text = formatValue(figure.value, figure.format, {
    currency: figure.currency ?? undefined,
    percentBasis: figure.percent_basis ?? null,
  });
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted-foreground">
      <span
        className={cn(JAINA_TYPE.figure, 'text-foreground')}
        {...blockFigureAttributes(figure.label, figure.value, figure.currency)}
      >
        {text}
      </span>
      {figure.unit ? <span>{figure.unit}</span> : null}
      <span>· {figure.label}</span>
    </p>
  );
}

export default function StepsBlock({ block }: StepsBlockProps) {
  return (
    <div className={JAINA_MODULE.neutral} data-jaina-module="block">
      <BlockHeading title={block.title} />
      <ol className="flex flex-col gap-3" data-steps={block.block_id}>
        {block.items.map((item, index) => (
          <li
            key={`${index}-${item.action}`}
            className="grid grid-cols-[1.5rem_1fr] gap-x-2"
            data-step={index + 1}
          >
            <span
              aria-hidden
              className={cn(JAINA_TYPE.figure, 'text-sm leading-6 text-muted-foreground')}
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className={cn(JAINA_TYPE.body, 'font-semibold text-foreground')}>
                <MediaText>{item.action}</MediaText>
                <CitationChips
                  citeIds={item.cite_ids}
                  citations={block.citations}
                  className="ml-1"
                />
              </p>
              <p className="text-sm text-muted-foreground" data-step-where>
                {item.where}
              </p>
              <p className={cn(JAINA_TYPE.body, 'text-foreground')} data-step-effect>
                <MediaText>{item.expected_effect}</MediaText>
              </p>
              {item.figure ? <StepFigureLine figure={item.figure} /> : null}
            </div>
          </li>
        ))}
      </ol>
      <BlockSourcesFooter citations={block.citations} />
    </div>
  );
}
