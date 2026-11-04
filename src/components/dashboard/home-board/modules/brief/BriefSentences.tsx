'use client';

// The brief's sentences as the read wrote them, each citation a small number.

import type { HomeBriefSentence } from '@continuum/contracts';
import { sentenceParts } from './briefEvidence';

export function BriefSentence({ sentence }: { sentence: Pick<HomeBriefSentence, 'text'> }) {
  return (
    <>
      {sentenceParts(sentence.text).map((part, index) =>
        'n' in part ? (
          <sup
            className="ml-px font-medium text-[0.65rem] text-muted-foreground tabular-nums"
            data-citation={part.n}
            // biome-ignore lint/suspicious/noArrayIndexKey: a sentence's parts never reorder
            key={index}
          >
            {part.n}
          </sup>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a sentence's parts never reorder
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
