'use client';

// Am I on plan — one figure, one sentence, and the shape underneath that says the same thing.
//
// This was two labelled bars on two rows with a coloured status chip above them, and it asked
// the reader to do the comparison: read one bar, read the other, decide which is further along.
// Pacing IS that comparison, so the block should have already made it. The figure is the pace
// ratio — spend against the share of the period that has run — and it is the only number a
// reader needs to know whether to act.
//
// The rule under it is the comparison drawn once: the fill is the budget spent, the tick is
// the calendar. Fill past the tick is money ahead of time, and it is visible without reading
// either number. It is drawn the way `optimizer/.../news/JustificationBlock` draws its
// interval — a hairline and a marker, no gradient, no shine.
//
// Figure typography follows `optimizer/sections/account/candidateHeadline.tsx`; those
// components are typed on `AccountCandidate` and a pacing block is not one, so the rules are
// mirrored rather than imported. `CalmRule`, which is generic, IS imported, so this surface
// breathes on the same rhythm as every other.

import { CalmRule } from '@/components/paid-media/optimizer/sections/account/candidateHeadline';
import { formatValue } from '@/lib/jaina/formatValue';
import type { GoalPacingBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';

type GoalPacingBlockProps = { block: GoalPacingBlockV2; isStreaming: boolean };

/**
 * The words, not a colour code.
 *
 * A red chip on "ahead of plan" tells a reader that spending fast is an error, and for a
 * flight that is deliberately front-loaded it is not. The sentence says what happened; the
 * reader owns the verdict.
 */
const STATUS_SENTENCE: Record<GoalPacingBlockV2['status'], string> = {
  on_track: 'on plan',
  underpacing: 'behind the calendar',
  overpacing: 'ahead of the calendar',
};

const pct = (share: number) => `${Math.round(share * 100)}%`;

export default function GoalPacingBlock({ block }: GoalPacingBlockProps) {
  const money = (value: number) =>
    block.currency_code
      ? formatValue(value, 'currency', { currency: block.currency_code })
      : formatValue(value, 'number');
  const spentShare = block.budget > 0 ? Math.min(1, block.spent / block.budget) : 0;

  return (
    <section data-testid="goal-pacing-block">
      <div className="mb-2 flex items-center gap-2">
        <CalmRule play testId="goal-pacing-calm-rule" />
        <h4 className="font-semibold text-foreground text-sm">{block.title}</h4>
      </div>

      {/* The one figure. Nothing is appended to the label: "of plan" already carries the
       *  comparison, and pace_ratio is a ratio to the plan by definition. */}
      <p
        className="flex flex-wrap items-baseline gap-x-1.5 text-2xs text-muted-foreground"
        data-testid="goal-pacing-figure"
      >
        <span className="font-mono font-semibold text-2xl text-foreground tabular-nums">
          {pct(block.pace_ratio)}
        </span>
        <span className="text-foreground">of plan · {STATUS_SENTENCE[block.status]}</span>
      </p>

      {/* The one sentence. Money, then the calendar it is being judged against — in that
       *  order, because the money is the thing the reader came for. */}
      <p className="mt-0.5 text-foreground text-sm" data-testid="goal-pacing-sentence">
        <span className="tabular-nums">
          {money(block.spent)} of {money(block.budget)}
        </span>{' '}
        spent with {pct(block.elapsed_pct)} of {block.period_start} – {block.period_end} elapsed.
      </p>

      {/* The comparison, drawn once. */}
      <div className="mt-2" data-testid="goal-pacing-rule">
        <span className="relative block h-1.5 w-full">
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-foreground/10" />
          <span
            aria-hidden="true"
            className={cn('absolute inset-y-0 left-0 rounded-full bg-foreground/40')}
            data-testid="goal-pacing-spent-fill"
            style={{ width: `${Math.max(1, spentShare * 100)}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-y-[-3px] w-px bg-foreground"
            data-testid="goal-pacing-elapsed-tick"
            style={{ left: `${Math.min(100, Math.max(0, block.elapsed_pct * 100))}%` }}
          />
        </span>
        <p className="mt-1 text-3xs text-muted-foreground">
          fill: budget spent · tick: time elapsed
        </p>
      </div>

      {/* Shown only when the model gave one. A projection printed from nothing is the block
       *  inventing the ending it was asked not to invent. */}
      {block.projected_end != null ? (
        <p
          className="mt-1 text-3xs text-muted-foreground tabular-nums"
          data-testid="goal-pacing-projection"
        >
          {money(block.projected_end)} projected by {block.period_end}
        </p>
      ) : null}
    </section>
  );
}
