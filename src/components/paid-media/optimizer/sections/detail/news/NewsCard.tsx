'use client';

// The lead: the portfolio's main recommendation, as the first line Jaina wrote in "What the
// Optimizer found" (P1, "Lectura continua").
//
// One finding per line, no frame: the coloured tag on the left (scale green, pause red, creative
// amber), the claim in semibold with its reason under it in muted, the action on the right.
// The lead is louder than an insight in what it carries — Jaina's attribution, the chosen-over
// line, the Explain link — never in its box. Its evidence picture (./CardBand) opens under it.
// The line's columns are decided in ./cardShape.

import { ExternalLinkIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HeroCta } from '../heroModel';
import { CardBand } from './CardBand';
import { FINDING_ROW } from './cardShape';
import type { FindingTagTone, NewsCardModel } from './newsModel';

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
  explainHref: string;
  onCta: (cta: HeroCta) => void;
};

const TAG_TEXT: Record<FindingTagTone, string> = {
  good: 'text-success',
  bad: 'text-destructive',
  warn: 'text-warning',
  muted: 'text-muted-foreground',
};

const TIER_TEXT: Record<NonNullable<NewsTier>['tone'], string> = {
  destructive: 'text-destructive',
  warning: 'text-warning',
  muted: 'text-muted-foreground',
};

/** The left column of a finding: its coloured tag, what kind it is, and what it is worth. */
export function FindingTagCell({ card, tier }: { card: NewsCardModel; tier: NewsTier }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 @[36rem]/news:flex-col">
      <span
        className={cn('font-semibold text-xs uppercase tracking-wide', TAG_TEXT[card.tag.tone])}
        data-testid="finding-tag"
        data-tone={card.tag.tone}
        title={card.eyebrow}
      >
        {card.tag.label}
      </span>
      {card.tag.detail ? (
        <span className="text-muted-foreground text-xs">{card.tag.detail}</span>
      ) : null}
      {tier ? (
        <span className={cn('text-xs', TIER_TEXT[tier.tone])} data-testid="finding-tier">
          {tier.label}
        </span>
      ) : null}
    </div>
  );
}

/** The finding's own evidence, drawn — one click away under the reason. */
export function FindingEvidence({
  card,
  currency,
  resultLabel,
}: {
  card: NewsCardModel;
  currency: string | null;
  resultLabel: string;
}) {
  return (
    <details className="group/evidence">
      <summary className="w-fit cursor-pointer list-none text-muted-foreground text-xs hover:text-foreground">
        <span className="group-open/evidence:hidden">Show the evidence</span>
        <span className="hidden group-open/evidence:inline">Hide the evidence</span>
      </summary>
      <div className="pt-2">
        <CardBand
          currency={currency}
          figure={card.figure}
          id={card.id}
          resultLabel={resultLabel}
          tone={card.tone}
          visual={card.visual}
        />
      </div>
    </details>
  );
}

export function NewsCard({
  card,
  currency,
  resultLabel,
  tier,
  draft,
  explainHref,
  onCta,
}: NewsCardProps) {
  const cta = card.cta;
  return (
    <article className={FINDING_ROW} data-testid="portfolio-news-lead">
      <FindingTagCell card={card} tier={tier} />
      <div className="flex min-w-0 flex-col gap-1">
        {card.subject ? (
          <p className="truncate text-muted-foreground text-xs" data-testid="news-subject">
            {card.subject}
          </p>
        ) : null}
        <h3
          className="text-balance font-semibold text-foreground text-sm leading-snug"
          data-testid="hero-headline"
        >
          {card.claim}
        </h3>
        {card.reason ? (
          <p className="text-muted-foreground text-xs leading-snug">{card.reason}</p>
        ) : null}
        {card.chosenOver ? (
          <p className="text-muted-foreground text-xs" data-testid="news-chosen-over">
            <span className="font-medium text-foreground">Chosen over the biggest number:</span>{' '}
            {card.chosenOver}
          </p>
        ) : null}
        {/* `text-primary` is this app's foreground utility; Jaina speaks in the brand colour. */}
        <p className="inline-flex flex-wrap items-center gap-x-1.5 text-(--primary) text-xs">
          <SparklesIcon aria-hidden className="size-3" />
          <span>Jaina{draft ? ' · draft read' : ''}</span>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <a
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            href={explainHref}
          >
            Explain with Jaina <ExternalLinkIcon aria-hidden className="size-3" />
          </a>
        </p>
        <FindingEvidence card={card} currency={currency} resultLabel={resultLabel} />
      </div>
      {cta ? (
        <div className="@[36rem]/news:justify-self-end">
          <Button onClick={() => onCta(cta)} size="sm" type="button">
            {cta.label}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
