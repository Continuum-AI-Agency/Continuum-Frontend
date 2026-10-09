'use client';

// An insight: a finding beside the lead, on the same line the lead uses in "What the Optimizer
// found" — the coloured tag, the claim and its reason, the action on the right, and its own
// evidence picture one click away. It draws its evidence exactly like the lead does; an
// insight with no picture is how two of three findings once could show nothing but a sentence.
// The line's columns are decided in ./cardShape.

import { Button } from '@/components/ui/button';
import type { HeroCta } from '../heroModel';
import { FINDING_ROW } from './cardShape';
import { FindingEvidence, FindingTagCell, type NewsTier } from './NewsCard';
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
    <article className={FINDING_ROW} data-testid="portfolio-news-insight">
      <FindingTagCell card={card} tier={tier} />
      <div className="flex min-w-0 flex-col gap-1">
        {card.subject ? (
          <p className="truncate text-muted-foreground text-xs" data-testid="news-subject">
            {card.subject}
          </p>
        ) : null}
        <h3 className="text-balance font-semibold text-foreground text-sm leading-snug">
          {card.claim}
        </h3>
        {card.reason ? (
          <p className="text-muted-foreground text-xs leading-snug">{card.reason}</p>
        ) : null}
        <FindingEvidence card={card} currency={currency} resultLabel={resultLabel} />
      </div>
      {cta ? (
        <div className="@[36rem]/news:justify-self-end">
          <Button onClick={() => onCta(cta)} size="sm" type="button" variant="outline">
            {cta.label}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
