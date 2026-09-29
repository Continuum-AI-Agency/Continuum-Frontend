'use client';

// What a portfolio opens on, in the order the redesign fixed (docs/performance-plus-redesign/
// portafolio.html, ideas 01 + 09 + 14, decided 28/09):
//
//   1. the name and its fixed facts in one line (./PortfolioHeaderLine);
//   2. the Jaina panel — her latest read on this portfolio as one sentence with a figure, a
//      field whose submit deep-links into Jaina with the portfolio as context, and the five
//      prepared questions (./JainaPortfolioPanel, inside the one primary band);
//   3. the news in two sentences with a figure — how we are doing, where the opportunity is —
//      a third only when a blocker exists, and four tiles with a state on their top border
//      (./PortfolioHeadline);
//   4. before and after the last cycle: the window before beside the window after, what the
//      cycle proposed and what landed, and the cost the pending pauses would leave
//      (./BeforeAfterStrip);
//   5. the recommendation cards, ONE ROW, highest impact on the left (./news), the rest behind
//      "N more".
//
// The six vital-sign rows that used to open the portfolio — each a full-width green/red band
// with a target mark — are gone; their figures are in the sentences and the tiles now.
//
// The card row is the one layout decision left here. Three equal columns on a desktop pane,
// two on a tablet, one on a phone, measured on the pane and not the window (`NEWS_PANE` /
// `NEWS_ROW` in ./news/cardShape). Every card fills its column and the cards in a row share
// a height. The order is the brief's own ranking — `buildPortfolioNews` hands the cards back
// sorted — and the lead is not always first: when Jaina picked a lower candidate the maximum
// stands to its left, and the lead's "chosen over the biggest number" line explains the pair.
// A fourth card sits behind "N more" rather than wrapping into a lone card with blank beside it.
//
// Entrance is a short stagger; everything is static under prefers-reduced-motion.

import type { CycleItemRow } from '@continuum/contracts';
import { IMPACT_TIER_COPY, type ImpactTier, impactTier } from '@continuum/contracts';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { asOfLine } from '../recQueueModel';
import { BeforeAfterStrip, type BeforeAfterStripProps } from './BeforeAfterStrip';
import type { PortfolioHeadline as HeadlineModel } from './headlineModel';
import type { HeroSetting } from './heroHeaderModel';
import type { HeroCta, HeroView } from './heroModel';
import { JainaPortfolioPanel, type JainaPortfolioPanelProps } from './JainaPortfolioPanel';
import { NEWS_CELL, NEWS_PANE, NEWS_ROW, NEWS_ROW_SIZE } from './news/cardShape';
import { InsightCard } from './news/InsightCard';
import type { NewsTier } from './news/NewsCard';
import { NewsCard } from './news/NewsCard';
import { buildPortfolioNews, type NewsCardModel } from './news/newsModel';
import { PortfolioHeaderLine, type PortfolioHeaderLineProps } from './PortfolioHeaderLine';
import { PortfolioHeadline } from './PortfolioHeadline';

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
  /** The blocks above the cards. Absent, the hero is the news alone. */
  header?: PortfolioHeaderLineProps;
  jaina?: JainaPortfolioPanelProps;
  headline?: HeadlineModel;
  beforeAfter?: BeforeAfterStripProps;
  /** A chip or a blocker's fix opens its field in Manage. */
  onEditSetting?: (setting: HeroSetting) => void;
};

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
  header,
  jaina,
  headline,
  beforeAfter,
  onEditSetting = () => undefined,
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
        {header ? <PortfolioHeaderLine {...header} /> : null}
        {jaina ? <JainaPortfolioPanel {...jaina} read={null} /> : null}
        <div className="h-24 animate-pulse rounded-lg bg-muted/70" />
        <div className="rounded-lg border border-border/60 border-dashed p-4 text-muted-foreground text-xs">
          Jaina escribe su primera lectura después del primer ciclo.
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

  return (
    <motion.section
      animate="visible"
      className={cn(NEWS_PANE, 'flex flex-col gap-3')}
      data-testid="portfolio-hero"
      initial={play ? 'hidden' : false}
      variants={groupVariants}
    >
      {header ? (
        <motion.div variants={tileVariants}>
          <PortfolioHeaderLine {...header} />
        </motion.div>
      ) : null}

      {jaina ? (
        <motion.div variants={tileVariants}>
          <JainaPortfolioPanel {...jaina} />
        </motion.div>
      ) : null}

      {headline ? (
        <motion.div variants={tileVariants}>
          <PortfolioHeadline headline={headline} onEditSetting={onEditSetting} />
        </motion.div>
      ) : null}

      {beforeAfter ? (
        <motion.div variants={tileVariants}>
          <BeforeAfterStrip {...beforeAfter} />
        </motion.div>
      ) : null}

      <motion.div className={NEWS_ROW} data-testid="portfolio-news-row" variants={groupVariants}>
        {row.map(cell)}
      </motion.div>

      {more.length > 0 ? (
        <details className="group" data-testid="portfolio-news-more">
          <summary className="cursor-pointer list-none text-muted-foreground text-xs hover:text-foreground">
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
