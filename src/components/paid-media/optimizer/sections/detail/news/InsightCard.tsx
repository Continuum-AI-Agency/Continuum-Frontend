'use client';

// An insight: the same card as the lead, in the same vocabulary — chips, claim, the band with
// its own evidence and figure, the why, the action. It gets a visual exactly like the lead
// does; an insight with no chart slot is how two of the three cards in a row ended up able to
// draw nothing bigger than a 6px rule.
//
// Its box is the row's column — the same `CARD_FRAME` the lead gets, so the three cards in a
// row share a width and a height. See ./cardShape.

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HeroCta } from '../heroModel';
import { CardBand } from './CardBand';
import { CARD_FRAME } from './cardShape';
import { CardChips, type NewsTier } from './NewsCard';
import type { NewsCardModel } from './newsModel';

export type InsightCardProps = {
  card: NewsCardModel;
  currency: string | null;
  /** The objective's own result word ("leads", "conversations"). */
  resultLabel: string;
  tier: NewsTier;
  onCta: (cta: HeroCta) => void;
};

export function InsightCard({ card, currency, resultLabel, tier, onCta }: InsightCardProps) {
  const cta = card.cta;
  return (
    <article
      className={cn(
        'flex-col gap-1.5 overflow-hidden rounded-lg border border-border/60 bg-card px-4 pt-3.5 pb-3',
        CARD_FRAME,
      )}
      data-testid="portfolio-news-insight"
    >
      <CardChips card={card} tier={tier} />
      {card.subject ? (
        <p className="truncate text-muted-foreground text-xs" data-testid="news-subject">
          {card.subject}
        </p>
      ) : null}
      <h3 className="line-clamp-2 text-balance font-semibold text-base text-foreground leading-snug">
        {card.claim}
      </h3>

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
      {cta ? (
        <div className="pt-0.5">
          <Button
            className="h-8 px-2 text-xs"
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
