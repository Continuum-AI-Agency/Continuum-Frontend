'use client';

// What a portfolio opens on: its main recommendation, wide, as a piece of news — then the
// growth line, then two insights under it.
//
// The figure the lead card carries is the recommendation's OWN (the budget that moved, the
// spend that bought nothing). Money per day moved to a support line and is printed day AND
// month, because "$14/day" is a figure a reader has to finish in their head, and because
// leading twenty-five different findings with the same small-business sentence was the
// complaint this screen exists to answer.
//
// The justification layouts live in ./news — three of them, picked from what a card holds.
// Entrance is a short stagger; after that the only motion is the 5s breath on a connector.
// Everything is static under prefers-reduced-motion.

import type { CycleItemRow } from '@continuum/contracts';
import { IMPACT_TIER_COPY, type ImpactTier, impactTier } from '@continuum/contracts';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { AccountChartView } from '../account/AccountChartView';
import { asOfLine } from '../recQueueModel';
import type { HeroCta, HeroView } from './heroModel';
import { InsightCard } from './news/InsightCard';
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
  onCta: (cta: HeroCta) => void;
  explainHref: string;
};

export function PortfolioHero({
  view,
  currency,
  portfolioId,
  dailyTotal,
  items = [],
  nextCycleAt,
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
  // beside it. When the window cannot be drawn honestly the sentence carries the read alone.
  const chart = (
    <div
      className="rounded-md border border-border/50 bg-background/40 p-3"
      data-testid="hero-chart"
    >
      {view.chart ? (
        <>
          <AccountChartView chart={view.chart} currency={currency} />
          {view.chartReading ? (
            <p className="mt-1.5 text-3xs text-muted-foreground">
              {view.chartReading}
              {view.chart.shape === 'interval' && asOfDay ? <> · as of {asOfDay}</> : null}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-2xs text-muted-foreground">
          Not enough priced days in this window to draw it yet.
        </p>
      )}
    </div>
  );

  return (
    <motion.section
      animate="visible"
      className="flex flex-col gap-3"
      data-testid="portfolio-hero"
      initial={play ? 'hidden' : false}
      variants={groupVariants}
    >
      <motion.div variants={heroVariants}>
        {news.lead ? (
          <NewsCard
            asOfLine={asOfLine(view.asOf, nextCycleAt) ?? 'Awaiting the first cycle'}
            card={news.lead}
            chart={chart}
            currency={currency}
            draft={view.brief.model === 'deterministic'}
            explainHref={explainHref}
            onCta={onCta}
            tier={tierOf(news.lead.impactPerDay)}
          />
        ) : null}
      </motion.div>

      <motion.p
        className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground"
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
        <span className="max-w-[65ch]">{view.brief.growth_sentence}</span>
      </motion.p>

      {news.insights.length > 0 ? (
        <motion.div
          className="grid gap-2 sm:grid-cols-2"
          data-testid="portfolio-news-insights"
          variants={groupVariants}
        >
          {news.insights.map((card) => (
            <motion.div key={card.id} variants={tileVariants}>
              <InsightCard
                card={card}
                currency={currency}
                onCta={onCta}
                tier={tierOf(card.impactPerDay)}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : null}
    </motion.section>
  );
}
