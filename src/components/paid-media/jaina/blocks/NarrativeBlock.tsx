'use client';

import type { NarrativeBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JUDGEMENT_LABEL, JUDGEMENT_RULE, judgeValue } from '../reading';
import { BlockSourcesFooter } from './citations';
import { MediaText } from './mediaText';
import { JainaProse } from './prose';

type NarrativeBlockProps = {
  block: NarrativeBlockV2;
  isStreaming: boolean;
};

// Citations, severity marks and bold entities are all placed by `JainaProse`; this block
// only says what ink its body is set in.
function NarrativeBody({ block, isStreaming }: NarrativeBlockProps) {
  return (
    <JainaProse
      content={block.body}
      citations={block.citations}
      mode={isStreaming ? 'streaming' : 'static'}
      className="text-sm leading-relaxed text-muted-foreground"
    />
  );
}

export default function NarrativeBlock({ block, isStreaming }: NarrativeBlockProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
      <NarrativeBody block={block} isStreaming={isStreaming} />
      {block.highlights.length > 0 && (
        <ul className="space-y-2">
          {block.highlights.map((highlight, index) => {
            // Through `reading.ts` rather than a local emerald/amber/red map: one answer to
            // "why is this rule red", and design tokens that follow the theme — the raw
            // palette literals this replaced kept their light values in dark mode while
            // every other judged figure on screen moved.
            const judgement = judgeValue(highlight.severity);
            return (
              <li
                key={index}
                className={cn('border-l-2 pl-3 py-1', JUDGEMENT_RULE[judgement])}
                title={`${highlight.category || 'Highlight'}: ${JUDGEMENT_LABEL[judgement]}`}
              >
                {highlight.category && (
                  <span className="inline-block text-xs font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5 mb-1">
                    {highlight.category}
                  </span>
                )}
                <p className="text-sm text-foreground">
                  <MediaText>{highlight.text}</MediaText>
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <BlockSourcesFooter citations={block.citations} />
    </div>
  );
}
