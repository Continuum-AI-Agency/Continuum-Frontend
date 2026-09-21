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
//   'open'        mirrored   — the figure moves to the LEFT and the words to its right, and
//                 the bar has no closing end. The shape says what the sentence says.
//
// The only motion is the connector: a 5s breath on the glyph or rule that joins the halves.
// No sheen, nothing that moves while a person is reading a number.

import { motion, useReducedMotion } from 'motion/react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatHeadline, formatPerPeriod } from '../../../format';
import type { JustificationModel, NewsCardModel } from './justification';
import { pickJustification } from './justification';

/**
 * The connector, breathing on a ~5s rhythm.
 *
 * The only motion on the card, and it is on the JOIN between the two halves — never on a
 * figure. A number that fades while someone is reading it is a number they read twice.
 */
function Breath({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{children}</span>;
  return (
    <motion.span
      animate={{ opacity: [0.45, 1, 0.45] }}
      className={className}
      data-testid="news-breath"
      transition={{ duration: 5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
    >
      {children}
    </motion.span>
  );
}

/** The big number and the words that belong to it. Nothing is appended to the label. */
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
  const headline = card.headline ? formatHeadline(card.headline, currency) : null;
  if (!headline) return null;
  return (
    <p
      className={cn('flex flex-col gap-0.5', align === 'right' ? 'sm:text-right' : 'text-left')}
      data-testid="news-figure"
    >
      <span
        className={cn(
          'font-semibold text-foreground tabular-nums leading-none tracking-tight',
          size === 'lead' ? 'text-3xl' : 'text-xl',
        )}
      >
        {headline.figure}
      </span>
      <span className="text-2xs text-muted-foreground">{headline.label}</span>
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
      <Breath className="relative block h-1.5 w-full">
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
      </Breath>
      <p className="flex items-baseline justify-between gap-2 text-3xs text-muted-foreground tabular-nums">
        <span>{formatCurrency(interval.low, currency)}</span>
        <span>{open ? 'no upper bound' : formatCurrency(interval.high, currency)}</span>
      </p>
    </div>
  );
}

/** The support line every card carries: the same money, said at both sizes a person uses. */
function Support({ card, currency }: { card: NewsCardModel; currency: string | null }) {
  if (card.moneyPerDay == null) return null;
  return (
    <p className="text-2xs text-muted-foreground tabular-nums" data-testid="news-support">
      {formatPerPeriod(card.moneyPerDay, currency)}
    </p>
  );
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
          className="grid items-end gap-x-5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]"
          data-justification="arithmetic"
        >
          <p className="flex flex-wrap items-baseline gap-2 text-sm text-foreground tabular-nums sm:justify-end sm:text-right">
            <span className="text-muted-foreground">{formatCurrency(headline.from, currency)}</span>
            <Breath className="text-muted-foreground">→</Breath>
            <span className="font-medium">{formatCurrency(headline.to, currency)}</span>
          </p>
          <div aria-hidden className="hidden bg-border sm:block sm:h-10 sm:w-px" />
          <Figure align="left" card={card} currency={currency} size={size} />
        </div>
      );
    }
    if (model === 'bounded') {
      return (
        <div
          className="grid items-end gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          data-justification="bounded"
        >
          <div className="flex flex-col gap-2">
            <IntervalRule card={card} currency={currency} open={false} />
          </div>
          <Figure align="right" card={card} currency={currency} size={size} />
        </div>
      );
    }
    return (
      <div
        className="grid items-end gap-x-6 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)]"
        data-justification="open"
      >
        <Figure align="left" card={card} currency={currency} size={size} />
        <div className="flex flex-col gap-1.5">
          {card.interval ? <IntervalRule card={card} currency={currency} open /> : null}
          <p className="max-w-[65ch] text-2xs text-muted-foreground">
            {card.interval
              ? 'It bought nothing, so there is no cost per result — only a floor.'
              : 'No point estimate to give.'}
          </p>
        </div>
      </div>
    );
  })();

  return (
    <div className="flex flex-col gap-2" data-testid="news-justification">
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
