'use client';

// The two lines every candidate leads with, in one place so a full-width card and a list row
// cannot say the same finding differently.
//
// A detector is priced in money per day because a ranking needs ONE comparable scale, and money
// is the only scale twenty-five different questions share. But money per day is rarely what the
// detector actually found: a transfer found one side 33% cheaper, a share detector found 92% of
// the budget in one place. So `headline` leads — the detector's own figure, in the detector's
// own terms — and money drops to a support line in day AND month.
//
// When a detector holds no headline the money leads instead and the support line carries the
// month alone. That fallback is a finished card, not a hole: `impact_per_day` is present on
// every candidate ever written, so the card always has a figure to lead with.

import type { AccountCandidate, CandidateHeadline } from '@continuum/contracts';
import { perPeriod } from '@continuum/contracts';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { cn } from '@/lib/utils';
import {
  type FigureUnit,
  figureProps,
  formatCurrency,
  formatHeadline,
  formatPercent,
  formatPerPeriod,
} from '../../format';

/** The calm rhythm. One short rule breathes inside the first fifth of it and rests for the rest. */
export const CALM_SECONDS = 5;

const ruleVariants: Variants = {
  still: { scaleX: 1 },
  calm: {
    scaleX: [1, 1.08, 1, 1],
    transition: {
      duration: CALM_SECONDS,
      times: [0, 0.09, 0.2, 1],
      repeat: Number.POSITIVE_INFINITY,
      ease: 'easeInOut',
    },
  },
};

/**
 * The one element that moves, on every surface that carries this vocabulary.
 *
 * Defined once so a card and a portfolio row cannot drift into two different rhythms, and so
 * "nothing sweeps, nothing shines, and nothing moves at all under `prefers-reduced-motion`"
 * is one rule rather than a convention each surface re-implements.
 */
export function CalmRule({ play, testId }: { play: boolean; testId?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      animate={play && !reduce ? 'calm' : 'still'}
      aria-hidden="true"
      className="block h-0.5 w-14 origin-left rounded-full bg-foreground/30"
      data-testid={testId}
      initial="still"
      variants={ruleVariants}
    />
  );
}

/** How large the leading figure sits. The card leads a screen; a row leads a line. */
export type HeadlineSize = 'row' | 'column' | 'card';

const FIGURE_SIZE: Record<HeadlineSize, string> = {
  row: 'text-base',
  column: 'text-xl',
  card: 'text-3xl',
};

/** One side of a `from → to`, printed in the headline's own unit. */
function sideFigure(unit: CandidateHeadline['unit'], value: number, currency: string | null) {
  if (unit === 'percent') return formatPercent(value);
  if (unit === 'currency_per_day') return formatCurrency(value, currency);
  return value.toLocaleString('en-US');
}

/** The headline's unit in the figure-provenance vocabulary (see `figureProps`). */
export function headlineFigureUnit(unit: CandidateHeadline['unit']): FigureUnit {
  if (unit === 'percent') return 'percent';
  if (unit === 'currency_per_day') return 'currency';
  return 'count';
}

/**
 * The figure the card leads with, and the words that follow it.
 *
 * Nothing is appended to `label`: the detector already wrote its own period and its own
 * direction into it ("a day undelivered", "under plan"), and gluing "/day" onto a label that
 * ends in one is how a screen ships "12% cheaper /day".
 */
export function HeadlineFigure({
  candidate,
  currency,
  size = 'row',
  testId,
  figureKey = 'candidate',
}: {
  candidate: AccountCandidate;
  currency: string | null;
  size?: HeadlineSize;
  testId?: string;
  /** The surface's name for this figure, e.g. `account-lead` → `account-lead.figure`. */
  figureKey?: string;
}) {
  const lead = candidate.headline
    ? formatHeadline(candidate.headline, currency)
    : { figure: formatCurrency(candidate.impact_per_day, currency), label: '/day' };
  const provenance = candidate.headline
    ? figureProps(
        `${figureKey}.figure`,
        candidate.headline.value,
        currency,
        'none',
        headlineFigureUnit(candidate.headline.unit),
      )
    : figureProps(`${figureKey}.figure`, candidate.impact_per_day, currency);
  return (
    <p
      className="flex flex-wrap items-baseline gap-x-1.5 text-2xs text-muted-foreground"
      data-headline={candidate.headline?.kind ?? 'money_fallback'}
      data-testid={testId}
    >
      <span
        className={cn('font-mono font-semibold tabular-nums text-foreground', FIGURE_SIZE[size])}
        {...provenance}
      >
        {lead.figure}
      </span>
      <span className="text-foreground">{lead.label}</span>
    </p>
  );
}

/**
 * The two sides the headline compares — "90 → 60" — and nothing when it compares nothing.
 *
 * A detector declares `from`/`to` only when it holds two priced sides of one move. Rendering a
 * single side against a null would be the card inventing the comparison the detector refused to.
 */
export function HeadlineComparison({
  candidate,
  currency,
  testId,
  figureKey = 'candidate',
}: {
  candidate: AccountCandidate;
  currency: string | null;
  testId?: string;
  figureKey?: string;
}) {
  const headline = candidate.headline;
  if (!headline || headline.from == null || headline.to == null) return null;
  const unit = headlineFigureUnit(headline.unit);
  return (
    <p className="text-3xs text-muted-foreground tabular-nums" data-testid={testId}>
      <span {...figureProps(`${figureKey}.from`, headline.from, currency, 'none', unit)}>
        {sideFigure(headline.unit, headline.from, currency)}
      </span>{' '}
      →{' '}
      <span {...figureProps(`${figureKey}.to`, headline.to, currency, 'none', unit)}>
        {sideFigure(headline.unit, headline.to, currency)}
      </span>
    </p>
  );
}

/**
 * The money, as the support line every card carries.
 *
 * Day AND month, because a figure per day is the one a reader most often multiplies in their
 * head before it means anything. When money already led — no headline — the day would only be
 * repeating the figure above, so the line carries the month alone.
 */
export function MoneyLine({
  candidate,
  currency,
  testId,
  figureKey = 'candidate',
}: {
  candidate: AccountCandidate;
  currency: string | null;
  testId?: string;
  figureKey?: string;
}) {
  const { month } = perPeriod(candidate.impact_per_day);
  const money = candidate.headline
    ? formatPerPeriod(candidate.impact_per_day, currency)
    : `${formatCurrency(month, currency)}/mo`;
  const provenance = figureProps(
    `${figureKey}.money`,
    candidate.impact_per_day,
    currency,
    'none',
    candidate.headline ? 'per-period' : 'per-month',
  );
  return (
    <p className="text-2xs text-muted-foreground tabular-nums" data-testid={testId}>
      <span className="text-foreground" {...provenance}>
        {money}
      </span>{' '}
      · {candidate.result_label}
    </p>
  );
}
