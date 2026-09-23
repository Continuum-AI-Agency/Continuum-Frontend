'use client';

// The three justification layouts, and nothing else. One component, three arrangements of
// the same two halves — a figure and the argument for it — so the screen reads as one
// vocabulary rather than three cards somebody designed separately.
//
// Each model has its own ANGLE, and the angle is the point: it is how a reader knows, before
// reading a word, which kind of claim is being made.
//
//   'arithmetic'  converging — the pair leans right, the figure leans left, a hairline
//                 between them. An equation meeting at its own equals sign.
//   'bounded'     diverging  — the words sit at the left edge, the figure at the right, and
//                 the interval is literally drawn as the rule spanning the gap between them.
//   'open'        mirrored   — the figure moves to the LEFT and its formula to the right, and
//                 an interval here has no closing end. The shape says what the sentence says.
//
// The leading figure, the from → to pair and the money line follow `../account/candidateHeadline`
// exactly — money leads only when no headline exists, and the support line then carries the
// MONTH alone rather than repeating the day. Those components are typed on `AccountCandidate`
// and a portfolio brief carries `BriefCandidate`, so the rules are mirrored here rather than
// imported; `CalmRule`, which is generic, IS imported, so every surface breathes on one rhythm.
//
// THE ANGLES ARE CONTAINER QUERIES, NOT BREAKPOINTS, and that correction is the whole reason
// this file changed. They were written with `sm:`, which asks about the VIEWPORT. An insight
// card is about 336px wide and on a desktop it matched `sm:` anyway, so the arithmetic angle
// laid a 20px-gapped two-column grid inside 312px and squeezed both halves — the layouts read
// as three variations of the same cramped thing instead of three different claims. `@container`
// on the block and `@[28rem]` on the bodies means a block splits only when the BLOCK has room.
//
// Below the split the three are still distinguishable, and by the part that matters: ORDER.
// Arithmetic puts the pair above its result, bounded puts the range above the estimate inside
// it, and open leads with the figure and lets the words trail — nothing closes it, which is
// what an open reading means.

import type { CandidateHeadline } from '@continuum/contracts';
import { perPeriod } from '@continuum/contracts';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatHeadline, formatPercent, formatPerPeriod } from '../../../format';
import { CalmRule } from '../../account/candidateHeadline';
import type { JustificationModel, NewsCardModel } from './justification';
import { pickJustification } from './justification';

/** How large the leading figure sits — one step louder on the lead than on an insight. The
 *  cards share a column now, so the lead's figure is a voice, not a size of box. */
const FIGURE_SIZE: Record<'lead' | 'insight', string> = {
  lead: 'text-2xl',
  insight: 'text-xl',
};

/** One side of a `from → to`, printed in the headline's OWN unit. */
function sideFigure(
  unit: CandidateHeadline['unit'],
  value: number,
  currency: string | null,
): string {
  if (unit === 'percent') return formatPercent(value);
  if (unit === 'currency_per_day') return formatCurrency(value, currency);
  return value.toLocaleString('en-US');
}

/**
 * The figure the card leads with, and the words after it.
 *
 * No headline means money leads — which is what every card in production renders today, and it
 * is a finished card, not a hole: `impact_per_day` is on every candidate ever written.
 */
function Figure({
  card,
  currency,
  size,
  align,
}: {
  card: NewsCardModel;
  currency: string | null;
  size: 'lead' | 'insight';
  align: 'left' | 'right';
}) {
  const lead = card.headline
    ? formatHeadline(card.headline, currency)
    : card.impactPerDay != null && card.impactPerDay > 0
      ? { figure: formatCurrency(card.impactPerDay, currency), label: '/day' }
      : null;
  if (!lead) return null;
  return (
    <p
      className={cn(
        'flex flex-wrap items-baseline gap-x-1.5 text-2xs text-muted-foreground',
        align === 'right'
          ? '@[28rem]/news-just:justify-end @[28rem]/news-just:text-right'
          : 'text-left',
      )}
      data-headline={card.headline?.kind ?? 'money_fallback'}
      data-testid="news-figure"
    >
      <span
        className={cn('font-mono font-semibold text-foreground tabular-nums', FIGURE_SIZE[size])}
      >
        {lead.figure}
      </span>
      <span className="text-foreground">{lead.label}</span>
    </p>
  );
}

/** The interval, drawn from its own numbers. `estimate` null leaves the right end open. */
function IntervalRule({
  card,
  currency,
  open,
}: {
  card: NewsCardModel;
  currency: string | null;
  open: boolean;
}) {
  const interval = card.interval;
  if (!interval) return null;
  const span = interval.high - interval.low;
  const at =
    interval.estimate != null && span > 0
      ? Math.min(100, Math.max(0, ((interval.estimate - interval.low) / span) * 100))
      : null;
  return (
    <div className="flex flex-col gap-1" data-testid="news-interval">
      <span className="relative block h-1.5 w-full">
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 right-0 left-0 rounded-full bg-primary/25',
            open ? '[mask-image:linear-gradient(to_right,black_45%,transparent)]' : null,
          )}
        />
        {at != null ? (
          <span
            aria-hidden
            className="absolute top-[-3px] h-3 w-0.5 rounded-full bg-primary"
            style={{ left: `calc(${at}% - 1px)` }}
          />
        ) : null}
      </span>
      <p className="flex items-baseline justify-between gap-2 text-3xs text-muted-foreground tabular-nums">
        <span>{formatCurrency(interval.low, currency)}</span>
        <span>{open ? 'no upper bound' : formatCurrency(interval.high, currency)}</span>
      </p>
    </div>
  );
}

/**
 * The money, as the support line.
 *
 * Day AND month while a headline leads; the MONTH alone when money itself led, because the day
 * would then only be repeating the figure above it.
 */
function Support({ card, currency }: { card: NewsCardModel; currency: string | null }) {
  if (card.moneyPerDay != null) {
    return (
      <p className="text-2xs text-muted-foreground tabular-nums" data-testid="news-support">
        <span className="text-foreground">{formatPerPeriod(card.moneyPerDay, currency)}</span>
      </p>
    );
  }
  if (card.impactPerDay == null || !(card.impactPerDay > 0)) return null;
  const { month } = perPeriod(card.impactPerDay);
  return (
    <p className="text-2xs text-muted-foreground tabular-nums" data-testid="news-support">
      <span className="text-foreground">{formatCurrency(month, currency)}/mo</span>
    </p>
  );
}

/** The argument beside the figure when there is no pair and no range: the formula itself. */
function OpenReading({ card }: { card: NewsCardModel }) {
  const words = card.interval
    ? 'It bought nothing, so there is no cost per result — only a floor.'
    : (card.basis ?? 'No point estimate to give.');
  return <p className="max-w-[65ch] text-2xs text-muted-foreground">{words}</p>;
}

export type JustificationBlockProps = {
  card: NewsCardModel;
  currency: string | null;
  size?: 'lead' | 'insight';
};

export function JustificationBlock({ card, currency, size = 'lead' }: JustificationBlockProps) {
  const model: JustificationModel = pickJustification(card);
  const headline = card.headline;

  const body = (() => {
    if (model === 'arithmetic' && headline?.from != null && headline.to != null) {
      return (
        <div
          className="grid items-end gap-x-5 gap-y-3 @[28rem]/news-just:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]"
          data-justification="arithmetic"
        >
          <p
            className="text-balance text-foreground text-sm tabular-nums @[28rem]/news-just:text-right"
            data-testid="news-comparison"
          >
            <span className="text-muted-foreground">
              {sideFigure(headline.unit, headline.from, currency)}
            </span>{' '}
            <span className="text-muted-foreground">→</span>{' '}
            <span className="font-medium">{sideFigure(headline.unit, headline.to, currency)}</span>
          </p>
          <div
            aria-hidden
            className="hidden bg-border @[28rem]/news-just:block @[28rem]/news-just:h-10 @[28rem]/news-just:w-px"
          />
          <Figure align="left" card={card} currency={currency} size={size} />
        </div>
      );
    }
    if (model === 'bounded') {
      return (
        <div
          className="grid items-end gap-x-6 gap-y-3 @[28rem]/news-just:grid-cols-[minmax(0,1fr)_auto]"
          data-justification="bounded"
        >
          <IntervalRule card={card} currency={currency} open={false} />
          <Figure align="right" card={card} currency={currency} size={size} />
        </div>
      );
    }
    return (
      <div
        className="grid items-end gap-x-6 gap-y-2 @[28rem]/news-just:grid-cols-[auto_minmax(0,1fr)]"
        data-justification="open"
      >
        <Figure align="left" card={card} currency={currency} size={size} />
        <div className="flex flex-col gap-1.5">
          {card.interval ? <IntervalRule card={card} currency={currency} open /> : null}
          <OpenReading card={card} />
        </div>
      </div>
    );
  })();

  return (
    <div className="@container/news-just flex flex-col gap-2" data-testid="news-justification">
      <CalmRule play testId="news-calm-rule" />
      {body}
      <Support card={card} currency={currency} />
      {card.cappedBy ? (
        <p className="text-3xs text-muted-foreground" data-testid="news-cap">
          {card.cappedBy}
        </p>
      ) : null}
    </div>
  );
}
