'use client';

// An insight: the same vocabulary at half the volume. Two of these sit under the lead.
//
// It is deliberately the SAME JustificationBlock, at `size="insight"`. The alternative —
// a second, smaller card designed on its own — is how two cards on one screen end up
// arguing in two different registers about the same account.
//
// Its box is its own too. `CARD_FRAME.insight` is on this element, not on the grid the
// caller writes, which is what makes "two insights stretched across the screen" unreachable
// rather than merely discouraged. See ./cardShape.

import * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HeroCta } from '../heroModel';
import { CARD_FRAME } from './cardShape';
import { JustificationBlock } from './JustificationBlock';
import type { NewsCardModel } from './justification';
import type { NewsTier } from './NewsCard';

export type InsightCardProps = {
  card: NewsCardModel;
  currency: string | null;
  tier: NewsTier;
  onCta: (cta: HeroCta) => void;
};

export function InsightCard({ card, currency, tier, onCta }: InsightCardProps) {
  const cta = card.cta;
  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card p-3',
        CARD_FRAME.insight,
      )}
      data-testid="portfolio-news-insight"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill className="uppercase tracking-wide">{card.eyebrow}</Pill>
        {tier ? <Pill variant={tier.tone}>{tier.label}</Pill> : null}
      </div>
      <h3 className="max-w-[65ch] text-balance font-medium text-foreground text-sm leading-snug">
        {card.claim}
      </h3>
      <JustificationBlock card={card} currency={currency} size="insight" />
      {card.reason ? (
        <p className="max-w-[65ch] text-2xs text-muted-foreground">{card.reason}</p>
      ) : null}
      {cta ? (
        <div className="mt-auto">
          <Button
            className="h-7 px-2 text-2xs"
            onClick={() => onCta(cta)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {cta.label}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
