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
import { cn } from '@/lib/utils';
import { JAINA_TYPE } from '../reading';
import { BlockHeading } from './BlockHeading';
import { JAINA_MODULE } from './modules';

type SurveyBlockProps = { block: SurveyBlockV2; isStreaming: boolean };

export default function SurveyBlock({ block }: SurveyBlockProps) {
  return (
    <section className={JAINA_MODULE.neutral} data-jaina-module="block" data-testid="survey-block">
      <BlockHeading
        title={block.title}
        leading={<CalmRule play testId="survey-calm-rule" />}
        className="gap-2"
      />

      <p
        className={cn(
          'flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground',
          JAINA_TYPE.table,
        )}
        data-testid="survey-figure"
      >
        <span className={cn(JAINA_TYPE.figure, 'text-foreground')}>“{block.term}”</span>
        <span className="text-foreground">was read as</span>
      </p>

      <p className={cn('mt-0.5 text-foreground', JAINA_TYPE.body)} data-testid="survey-sentence">
        {block.used}
      </p>

      {/* Never a control. The reader asks for another reading by asking. */}
      <p
        className={cn('mt-1 text-muted-foreground', JAINA_TYPE.table)}
        data-testid="survey-alternatives"
      >
        It could also have meant {block.alternatives.join('; ')}.
      </p>
    </section>
  );
}
