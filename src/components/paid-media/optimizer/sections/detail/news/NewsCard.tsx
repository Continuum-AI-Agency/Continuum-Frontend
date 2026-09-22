'use client';

// The lead: the portfolio's main recommendation, read like a piece of news.
//
// One figure, one sentence, and the argument between them. The chart, when there is one that
// argues THIS card's argument, is passed in and sits UNDER the justification — it is the same
// claim drawn, so it belongs inside this card rather than beside it.
//
// The card's box is its own: `CARD_FRAME.lead` caps the width and floors the height, so the
// slot it is mounted in can no longer decide its shape. See ./cardShape.

import { ExternalLinkIcon, SparklesIcon } from 'lucide-react';
import type * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HeroCta } from '../heroModel';
import { CARD_FRAME } from './cardShape';
import { JustificationBlock } from './JustificationBlock';
import type { NewsCardModel } from './justification';

/** The money this card is worth, read against the portfolio's daily total. Null when the
 *  finding carries no sized money at all. */
export type NewsTier = { label: string; tone: 'destructive' | 'warning' | 'muted' } | null;

export type NewsCardProps = {
  card: NewsCardModel;
  currency: string | null;
  tier: NewsTier;
  /** 'draft read' when no model has written today's words yet. */
  draft: boolean;
  /** The claim drawn, when it can be drawn honestly. */
  chart?: React.ReactNode;
  /** The as-of / next-cycle line, composed by the caller. */
  asOfLine: string | null;
  explainHref: string;
  onCta: (cta: HeroCta) => void;
};

export function NewsCard({
  card,
  currency,
  tier,
  draft,
  chart,
  asOfLine,
  explainHref,
  onCta,
}: NewsCardProps) {
  const cta = card.cta;
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4',
        CARD_FRAME.lead,
      )}
      data-testid="portfolio-news-lead"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill variant="default" className="uppercase tracking-wide">
          {card.eyebrow}
        </Pill>
        {tier ? <Pill variant={tier.tone}>{tier.label}</Pill> : null}
        <span className="inline-flex items-center gap-1 text-3xs text-muted-foreground">
          <SparklesIcon aria-hidden className="size-3" /> Jaina{draft ? ' · draft read' : ''}
        </span>
      </div>

      <h2
        className="max-w-[65ch] text-balance font-semibold text-foreground text-lg leading-snug"
        data-testid="hero-headline"
      >
        {card.claim}
      </h2>

      <JustificationBlock card={card} currency={currency} size="lead" />

      {card.reason ? (
        <p className="max-w-[65ch] text-muted-foreground text-xs">{card.reason}</p>
      ) : null}
      {card.chosenOver ? (
        <p className="max-w-[65ch] text-2xs text-muted-foreground" data-testid="news-chosen-over">
          <span className="font-medium text-foreground">Chosen over the biggest number:</span>{' '}
          {card.chosenOver}
        </p>
      ) : null}

      {chart ?? null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-0.5">
        {cta ? (
          <Button onClick={() => onCta(cta)} size="sm" type="button">
            {cta.label}
          </Button>
        ) : null}
        <a
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'h-8 gap-1 px-2 text-2xs',
          )}
          href={explainHref}
        >
          Explain with Jaina <ExternalLinkIcon aria-hidden className="size-3" />
        </a>
      </div>

      {asOfLine ? <p className="text-3xs text-muted-foreground">{asOfLine}</p> : null}
    </article>
  );
}
