'use client';

// Ambiguity, surfaced. The report used one reading of a loaded term; this says which, and
// offers the alternatives — the first option is always "keep it". Read-only here: choosing
// an alternative is a follow-up message, not a widget state.

import type { SurveyBlockV2 } from '@/lib/jaina/schemas';

type SurveyBlockProps = { block: SurveyBlockV2; isStreaming: boolean };

export default function SurveyBlock({ block }: SurveyBlockProps) {
  return (
    <div
      className="rounded-md border border-border/60 border-dashed px-3 py-2 text-xs"
      data-testid="survey-block"
    >
      <p className="text-foreground">
        <span className="font-medium">“{block.term}”</span> was read as{' '}
        <span className="font-medium">{block.used}</span>. Keep it, or ask for:
      </p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {block.alternatives.map((alt) => (
          <li
            className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground"
            key={alt}
          >
            {alt}
          </li>
        ))}
      </ul>
    </div>
  );
}
