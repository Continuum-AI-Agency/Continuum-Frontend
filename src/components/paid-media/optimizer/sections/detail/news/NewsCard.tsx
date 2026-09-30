'use client';

// The lead: the portfolio's main recommendation, read like a piece of news.
//
// Claim above, the band in the middle, one or two lines of why below, the action at the
// bottom. The band (./CardBand) is the card's own evidence drawn, with the figure on its
// top-left corner, and it is `flex-1`: whatever height the row gives the card becomes picture,
// never a gap. Nothing else in the card is allowed to grow.
//
// Its box is the row's column, the same box every other card in the row gets: `CARD_FRAME`
// fills the cell, shares the row's height, and floors its own height against the cell's width.
// The lead is louder than an insight in what it carries — the Jaina chip, the chosen-over
// line, the Explain link — never in its size. See ./cardShape.

import { ExternalLinkIcon, SparklesIcon } from 'lucide-react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HeroCta } from '../heroModel';
import { CardBand } from './CardBand';
import { CARD_FRAME } from './cardShape';
import type { NewsCardModel } from './newsModel';

/** The money this card is worth, read against the portfolio's daily total. Null when the
 *  finding carries no sized money at all. */
export type NewsTier = { label: string; tone: 'destructive' | 'warning' | 'muted' } | null;

export type NewsCardProps = {
  card: NewsCardModel;
  currency: string | null;
  /** The objective's own result word ("leads", "conversations"). */
  resultLabel: string;
  tier: NewsTier;
  /** 'draft read' when no model has written today's words yet. */
  draft: boolean;
  /** The as-of / next-cycle line, composed by the caller. */
  asOfLine: string | null;
  explainHref: string;
  onCta: (cta: HeroCta) => void;
};

/** The chips above a card: what kind of finding, and how much it is worth. */
export function CardChips({
  card,
  tier,
  children,
}: {
  card: NewsCardModel;
  tier: NewsTier;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <Pill className="shrink-0 text-xs" variant="default">
        {card.eyebrow}
      </Pill>
      {tier ? (
        <Pill className="shrink-0 text-xs" variant={tier.tone}>
          {tier.label}
        </Pill>
      ) : null}
      {children}
    </div>
  );
}

export function NewsCard({
  card,
  currency,
  resultLabel,
  tier,
  draft,
  asOfLine,
  explainHref,
  onCta,
}: NewsCardProps) {
  const cta = card.cta;
  return (
    <article
      className={cn(
        'flex-col gap-1.5 overflow-hidden rounded-lg border border-border/60 bg-card px-4 pt-3.5 pb-3',
        CARD_FRAME,
      )}
      data-testid="portfolio-news-lead"
    >
      <CardChips card={card} tier={tier}>
        <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
          <SparklesIcon aria-hidden className="size-3" /> Jaina{draft ? ' · draft read' : ''}
        </span>
      </CardChips>
      {card.subject ? (
        <p className="truncate text-muted-foreground text-xs" data-testid="news-subject">
          {card.subject}
        </p>
      ) : null}
      <h2
        className="line-clamp-2 text-balance font-semibold text-base text-foreground leading-snug"
        data-testid="hero-headline"
      >
        {card.claim}
      </h2>

      <CardBand
        currency={currency}
        figure={card.figure}
        id={card.id}
        resultLabel={resultLabel}
        tone={card.tone}
        visual={card.visual}
      />

      {card.reason ? (
        <p className="line-clamp-2 text-muted-foreground text-sm leading-snug">{card.reason}</p>
      ) : null}
      {card.chosenOver ? (
        <p className="line-clamp-2 text-muted-foreground text-xs" data-testid="news-chosen-over">
          <span className="font-medium text-foreground">Chosen over the biggest number:</span>{' '}
          {card.chosenOver}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {cta ? (
          <Button onClick={() => onCta(cta)} size="sm" type="button">
            {cta.label}
          </Button>
        ) : null}
        <a
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 gap-1 px-2 text-xs')}
          href={explainHref}
        >
          Explain with Jaina <ExternalLinkIcon aria-hidden className="size-3" />
        </a>
      </div>

      {asOfLine ? <p className="text-muted-foreground text-xs">{asOfLine}</p> : null}
    </article>
  );
}
