'use client';

// Ambiguity, surfaced — the one block whose subject is a WORD rather than a number.
//
// A report that ranks by "underperforming" has already answered a question the reader never
// asked: which reading of it. This block says so. It leads with the term itself, set in the
// same weight every other block gives its figure, because on this surface the term IS the
// figure — it is the thing the rest of the report was computed against.
//
// The alternatives were pills. A pill is a control, and these are not: choosing another
// reading is a follow-up message, not a widget state, and a row of things that look pressable
// and are not is a promise the surface cannot keep. They read as a sentence instead.
//
// `CalmRule` is imported from `optimizer/sections/account/candidateHeadline`, so this surface
// breathes on the one rhythm the product uses.

import { CalmRule } from '@/components/paid-media/optimizer/sections/account/candidateHeadline';
import type { SurveyBlockV2 } from '@/lib/jaina/schemas';

type SurveyBlockProps = { block: SurveyBlockV2; isStreaming: boolean };

export default function SurveyBlock({ block }: SurveyBlockProps) {
  return (
    <section data-testid="survey-block">
      <div className="mb-2 flex items-center gap-2">
        <CalmRule play testId="survey-calm-rule" />
        <h4 className="font-semibold text-foreground text-sm">{block.title}</h4>
      </div>

      <p
        className="flex flex-wrap items-baseline gap-x-1.5 text-2xs text-muted-foreground"
        data-testid="survey-figure"
      >
        <span className="font-mono font-semibold text-foreground text-xl">“{block.term}”</span>
        <span className="text-foreground">was read as</span>
      </p>

      <p className="mt-0.5 text-foreground text-sm" data-testid="survey-sentence">
        {block.used}
      </p>

      {/* Never a control. The reader asks for another reading by asking. */}
      <p className="mt-1 text-3xs text-muted-foreground" data-testid="survey-alternatives">
        It could also have meant {block.alternatives.join('; ')}.
      </p>
    </section>
  );
}
