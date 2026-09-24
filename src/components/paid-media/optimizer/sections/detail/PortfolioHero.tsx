'use client';

// What a portfolio opens on: the day's news as ONE ROW — three cards across the pane, highest
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
// The figure the lead card carries is the recommendation's OWN (the budget that moved, the
// spend that bought nothing). Money per day moved to a support line and is printed day AND
// month, because "$14/day" is a figure a reader has to finish in their head. The
// justification layouts live in ./news — three of them, picked from what a card holds.
// Entrance is a short stagger; after that the only motion is the 5s breath on a connector.
// Everything is static under prefers-reduced-motion.
//
// Whether the lead draws a chart is not decided here either: `buildPortfolioNews` hands back
// `leadChart`, which is `view.chart` only when the chart draws the figure the lead leads
// with. A chart that argues about a different quantity is withheld in silence.

import type { CycleItemRow } from '@continuum/contracts';
import { IMPACT_TIER_COPY, type ImpactTier, impactTier } from '@continuum/contracts';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { figureProps } from '../../format';
import { AccountChartView } from '../account/AccountChartView';
import { asOfLine } from '../recQueueModel';
import type { HeroCta, HeroView } from './heroModel';
import { NEWS_CELL, NEWS_PANE, NEWS_ROW, NEWS_ROW_SIZE, RECAP_BESIDE_SPAN } from './news/cardShape';
import { InsightCard } from './news/InsightCard';
import type { NewsCardModel } from './news/justification';
import type { NewsTier } from './news/NewsCard';
import { NewsCard } from './news/NewsCard';
import { buildPortfolioNews } from './news/newsModel';

const TIER_TONE: Record<ImpactTier, 'destructive' | 'warning' | 'muted'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
};

const EASE = [0.16, 1, 0.3, 1] as const;

const CYCLE_DAY = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

/**
 * The day the figures were computed, for a chart that carries no dates of its own.
 *
 * `rates` puts its window on its own x axis. `interval` cannot: the candidate supplies an
 * amount per day and nothing that says over which days it was observed, so the only date
 * that is actually known is the cycle that produced it. That one is named, and nothing is
 * inferred about the observation window — see heroChart.ts.
 */
function cycleDay(iso: string | null): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : CYCLE_DAY.format(at);
}

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
}: PortfolioHeroProps) {
  const reduce = useReducedMotion();
  // Play the entrance once per portfolio, not on every refetch.
  const playedFor = React.useRef<string | null>(null);
  const play = !reduce && playedFor.current !== portfolioId;
  React.useEffect(() => {
    playedFor.current = portfolioId;
  }, [portfolioId]);
  const asOfDay = cycleDay(view.asOf);
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
        <div className="h-24 animate-pulse rounded-lg bg-muted/70" />
        <div className="rounded-lg border border-border/60 border-dashed p-4 text-2xs text-muted-foreground">
          Jaina writes your first read after the first cycle.
        </div>
      </section>
    );
  }

  // The chart belongs INSIDE the lead card: it is the same claim drawn, not a second panel
  // beside it. Three outcomes, and only one of them is a box with a message in it:
  //
  //   the chart agrees   — drawn, with the line saying which reading it is.
  //   no chart at all    — the window cannot be drawn honestly, and saying so is the honest
  //                        thing to put in the space.
  //   a chart that does
  //   not argue THIS
  //   card's argument    — nothing. Not a box, not an apology. The chart was about a
  //                        different quantity, and a placeholder explaining its absence would
  //                        only be a second thing on the card that is not the argument.
  const chart = news.leadChart ? (
    <div
      className="rounded-md border border-border/50 bg-background/40 p-3"
      data-testid="hero-chart"
    >
      <AccountChartView chart={news.leadChart} currency={currency} />
      {view.chartReading ? (
        <p className="mt-1.5 text-3xs text-muted-foreground">
          {view.chartReading}
          {news.leadChart.shape === 'interval' && asOfDay ? <> · as of {asOfDay}</> : null}
        </p>
      ) : null}
    </div>
  ) : view.chart ? null : (
    <div
      className="rounded-md border border-border/50 bg-background/40 p-3"
      data-testid="hero-chart"
    >
      <p className="text-2xs text-muted-foreground">
        Not enough priced days in this window to draw it yet.
      </p>
    </div>
  );

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
          chart={chart}
          currency={currency}
          draft={view.brief.model === 'deterministic'}
          explainHref={explainHref}
          onCta={onCta}
          tier={tierOf(card.impactPerDay)}
        />
      ) : (
        <InsightCard
          card={card}
          currency={currency}
          onCta={onCta}
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
