'use client';

// What a portfolio opens on: its vital signs (./PortfolioVitals — name, mode, settings and six
// readings against their references), then the day's news as ONE ROW — three cards across the pane, highest
// impact on the left — and the growth recap as the row's footer. Then the rest of the modules.
//
// The row is the whole layout decision. Three equal columns on a desktop pane, two on a
// tablet, one on a phone, measured on the pane and not the window (`NEWS_PANE` /
// `NEWS_ROW` in ./news/cardShape). Every card fills its column and the cards in a row share
// a height, so the pane holds no blank beside a card that was given less than it. The order
// is the brief's own ranking — `buildPortfolioNews` hands the cards back sorted — and the
// lead is not always first: when Jaina picked a lower candidate the maximum stands to its
// left, and the lead's "chosen over the biggest number" line explains the pair.
//
// The first row is exactly one desktop row. A fourth card (a brief lists up to three
// secondaries when the hero is not the maximum) does not wrap into a lone card with the
// blank beside it that this file was rewritten to remove; it sits behind "N more", which
// says it exists and, being the lowest-impact finding by construction, can wait a click.
//
// The recap is the row's FOOTER when the row is full — the owner's order was "the three
// actions first, then the rest" — and sits BESIDE the cards when it is not, taking every
// column they left empty, so one card and its recap are still a composed row. Its verdict
// half is already honest: `heroModel` overlays the run's pacing verdict on the stored brief
// and strips a pace clause the verdict does not support.
//
// Every card in the row draws its own evidence in a band that grows to fill the card
// (./news/CardBand): the lead AND the insights, from the same status body — the cycle's
// recommendations and its ad-set rows, joined in ./news/newsModel. Entrance is a short
// stagger; everything is static under prefers-reduced-motion.

import type { CycleItemRow } from '@continuum/contracts';
import { IMPACT_TIER_COPY, type ImpactTier, impactTier } from '@continuum/contracts';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { figureProps } from '../../format';
import { asOfLine } from '../recQueueModel';
import type { HeroCta, HeroView } from './heroModel';
import { NEWS_CELL, NEWS_PANE, NEWS_ROW, NEWS_ROW_SIZE, RECAP_BESIDE_SPAN } from './news/cardShape';
import { InsightCard } from './news/InsightCard';
import type { NewsTier } from './news/NewsCard';
import { NewsCard } from './news/NewsCard';
import { buildPortfolioNews, type NewsCardModel } from './news/newsModel';
import { PortfolioVitals, type PortfolioVitalsProps } from './PortfolioVitals';

const TIER_TONE: Record<ImpactTier, 'destructive' | 'warning' | 'muted'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
};

const EASE = [0.16, 1, 0.3, 1] as const;

const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};
const heroVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE } },
};
const groupVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export type PortfolioHeroProps = {
  view: HeroView;
  currency: string | null;
  portfolioId: string;
  /** The portfolio's daily total, the scale the impact tiers are read against. */
  dailyTotal: number | null;
  /**
   * The cycle's reallocation rows.
   *
   * The only place the budget PAIR (current → final) and the engine's confidence interval
   * live, and therefore the only thing that lets a card show its arithmetic rather than
   * assert a conclusion. An empty array is fine: every card still renders, leading with its
   * sentence instead of a figure it does not hold.
   */
  items?: readonly CycleItemRow[];
  nextCycleAt: string | null;
  /** True once the portfolio has missed a cycle: the dateline then calls nextCycleAt an
   *  attempt, because the scheduler will claim the portfolio then but no cycle has landed
   *  on it in weeks. Absent reads as fresh. */
  stale?: boolean;
  onCta: (cta: HeroCta) => void;
  explainHref: string;
  /** The header and vital-sign rows above the news. Absent, the hero is the news alone. */
  vitals?: PortfolioVitalsProps;
};

/** The growth read: the flight's pacing pill when there is a flight, and the sentence. */
function Recap({
  view,
  placement,
  className,
}: {
  view: HeroView;
  placement: 'beside' | 'footer';
  className?: string;
}) {
  return (
    <motion.p
      className={cn(
        'flex flex-wrap items-center gap-2 text-2xs text-muted-foreground',
        placement === 'beside' && 'self-center',
        className,
      )}
      data-placement={placement}
      data-testid="portfolio-news-recap"
      variants={tileVariants}
    >
      {view.pacingLine ? (
        <Badge
          className="text-3xs"
          variant={
            view.pacingTone === 'success'
              ? 'success'
              : view.pacingTone === 'warning'
                ? 'warning'
                : 'muted'
          }
        >
          {view.pacingLine}
        </Badge>
      ) : null}
      {/* The sentence carries figures inside prose, so the node declares the one it is
       *  about (cost per result, else spend) and the bench reads every money token in it
       *  against the growth figures under the screen's currency rule. */}
      <span
        className="max-w-[65ch]"
        {...figureProps(
          'recap.sentence',
          view.brief.growth.cost_per_result ?? view.brief.growth.spend,
          view.brief.growth.currency,
          view.brief.growth.window,
          'sentence',
        )}
      >
        {view.brief.growth_sentence}
      </span>
    </motion.p>
  );
}

export function PortfolioHero({
  view,
  currency,
  portfolioId,
  dailyTotal,
  items = [],
  nextCycleAt,
  stale = false,
  onCta,
  explainHref,
  vitals,
}: PortfolioHeroProps) {
  const reduce = useReducedMotion();
  // Play the entrance once per portfolio, not on every refetch.
  const playedFor = React.useRef<string | null>(null);
  const play = !reduce && playedFor.current !== portfolioId;
  React.useEffect(() => {
    playedFor.current = portfolioId;
  }, [portfolioId]);
  const news = React.useMemo(
    () => buildPortfolioNews({ view, items, target: view.brief.growth.target }),
    [view, items],
  );
  const tierOf = React.useCallback(
    (perDay: number | null): NewsTier => {
      if (perDay == null || !(perDay > 0)) return null;
      const tier = impactTier(perDay, dailyTotal);
      return { label: IMPACT_TIER_COPY[tier], tone: TIER_TONE[tier] };
    },
    [dailyTotal],
  );

  if (view.state === 'first_cycle') {
    return (
      <section className="grid gap-3" data-testid="portfolio-hero">
        {vitals ? <PortfolioVitals {...vitals} /> : null}
        <div className="h-24 animate-pulse rounded-lg bg-muted/70" />
        <div className="rounded-lg border border-border/60 border-dashed p-4 text-2xs text-muted-foreground">
          Jaina writes your first read after the first cycle.
        </div>
      </section>
    );
  }

  const resultLabel = view.brief.growth.result_label;

  const cell = (card: NewsCardModel) => (
    <motion.div
      className={NEWS_CELL}
      data-testid="portfolio-news-cell"
      key={card.id}
      variants={card === news.lead ? heroVariants : tileVariants}
    >
      {card === news.lead ? (
        <NewsCard
          asOfLine={asOfLine(view.asOf, nextCycleAt, stale) ?? 'Awaiting the first cycle'}
          card={card}
          currency={currency}
          draft={view.brief.model === 'deterministic'}
          explainHref={explainHref}
          onCta={onCta}
          resultLabel={resultLabel}
          tier={tierOf(card.impactPerDay)}
        />
      ) : (
        <InsightCard
          card={card}
          currency={currency}
          onCta={onCta}
          resultLabel={resultLabel}
          tier={tierOf(card.impactPerDay)}
        />
      )}
    </motion.div>
  );

  const row = news.cards.slice(0, NEWS_ROW_SIZE);
  const more = news.cards.slice(NEWS_ROW_SIZE);
  const recapBeside = row.length < NEWS_ROW_SIZE;

  return (
    <motion.section
      animate="visible"
      className={cn(NEWS_PANE, 'flex flex-col gap-3')}
      data-testid="portfolio-hero"
      initial={play ? 'hidden' : false}
      variants={groupVariants}
    >
      {vitals ? (
        <motion.div variants={tileVariants}>
          <PortfolioVitals {...vitals} />
        </motion.div>
      ) : null}

      <motion.div className={NEWS_ROW} data-testid="portfolio-news-row" variants={groupVariants}>
        {row.map(cell)}
        {recapBeside ? (
          <Recap
            className={
              row.length === 1 || row.length === 2 ? RECAP_BESIDE_SPAN[row.length] : 'col-span-full'
            }
            placement="beside"
            view={view}
          />
        ) : null}
      </motion.div>

      {recapBeside ? null : <Recap placement="footer" view={view} />}

      {more.length > 0 ? (
        <details className="group" data-testid="portfolio-news-more">
          <summary className="cursor-pointer list-none text-2xs text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">
              {more.length} more finding{more.length === 1 ? '' : 's'}
            </span>
            <span className="hidden group-open:inline">Fewer findings</span>
          </summary>
          <div className={cn(NEWS_ROW, 'mt-3')}>{more.map(cell)}</div>
        </details>
      ) : null}
    </motion.section>
  );
}
