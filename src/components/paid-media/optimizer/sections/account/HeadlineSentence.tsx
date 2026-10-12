// The Overview's sentence, drawn from the parts ./overviewModel composes. The words are the
// model's; this file only styles them: a figure in mono at the sentence's own weight, and the
// decisions clause in the primary colour when there is one to take.

import { cn } from '@/lib/utils';
import * as typeScale from '../../typeScale';
import type { HeadlineSegment } from './overviewModel';

export function HeadlineSentence({
  segments,
  source,
}: {
  segments: readonly HeadlineSegment[];
  /** Which producer the figures come from, carried as `data-source`. */
  source?: string;
}) {
  return (
    <p
      className={`${typeScale.headline} max-w-[62ch] text-foreground`}
      data-source={source}
      data-testid="overview-headline"
    >
      {segments.map((segment, index) => {
        const key = `${segment.kind}-${index}`;
        if (segment.kind === 'text') return <span key={key}>{segment.text}</span>;
        if (segment.kind === 'figure')
          return (
            <span className="font-mono tabular-nums" key={key} {...segment.figure}>
              {segment.text}
            </span>
          );
        return (
          <span
            className={cn(segment.count > 0 && 'text-primary-ink')}
            data-testid="overview-decisions"
            key={key}
          >
            {segment.figure ? (
              <span className="font-mono tabular-nums">{segment.figure}</span>
            ) : null}
            {segment.words}
          </span>
        );
      })}
    </p>
  );
}
