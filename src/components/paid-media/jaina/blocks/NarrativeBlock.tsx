'use client';

import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import type { NarrativeBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JUDGEMENT_LABEL, JUDGEMENT_RULE, judgeValue } from '../reading';
import { BlockSourcesFooter, CitationChip, parseNarrativeCitations } from './citations';
import { MediaText } from './mediaText';

type NarrativeBlockProps = {
  block: NarrativeBlockV2;
  isStreaming: boolean;
};

function NarrativeBody({ block, isStreaming }: NarrativeBlockProps) {
  const mode = isStreaming ? 'streaming' : 'static';
  const segments = parseNarrativeCitations(block.body, block.citations);

  // No resolvable `[cite:id]` markers → render the body exactly as before
  // (single markdown pass). Unmatched markers are already stripped by the
  // parser, so a raw `[cite:id]` literal is never handed to markdown.
  if (segments.length === 1 && segments[0].kind === 'text') {
    return (
      <SafeMarkdown
        content={segments[0].value}
        mode={mode}
        className="text-sm leading-relaxed text-muted-foreground"
      />
    );
  }

  // Mixed prose + inline citations: render each text run through markdown and
  // drop the citation chip at the marker's position. `[&_p]:inline` keeps the
  // per-run paragraphs flowing on one line so chips sit within the sentence.
  return (
    <div className="text-sm leading-relaxed text-muted-foreground [&_p]:m-0 [&_p]:inline">
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <SafeMarkdown key={`text-${index}`} content={segment.value} mode={mode} />
        ) : (
          <CitationChip key={segment.key} resolved={segment.resolved} />
        ),
      )}
    </div>
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
