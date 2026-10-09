'use client';

// What a portfolio opens on (P1, "Lectura continua"): a continuous read with no box around
// it. The bar above it (./PortfolioHeaderLine, mounted by the workspace) carries the name, the
// mode, the tabs and the controls; this is everything under it, separated by space, never by
// frames:
//
//   1. the anchor number — cost per result, very large, in the colour of the target — with its
//      unit, target and the window before (./PortfolioAnchor); beside it the news: the status
//      sentence, Jaina's read when she wrote something it does not say, the opportunity, a
//      blocker only when one exists (./PortfolioHeadline), and the grey line of facts whose
//      settings open Manage (./PortfolioHeaderLine);
//   2. four tiles in one row, split by thin vertical hairlines (./PortfolioTiles);
//   3. the last cycle and its projection in one caption (./BeforeAfterStrip);
//   4. Jaina's bar, a light primary band (./JainaPortfolioPanel);
//
// and under it "What the Optimizer found": the day's findings as a list, one line each,
// highest impact first, the rest behind "N more findings" (./news). The order is the brief's
// own ranking — `buildPortfolioNews` hands the cards back sorted — and the lead is not always
// first: when Jaina picked a lower candidate the maximum stands above it, and the lead's
// "chosen over the biggest number" line explains the pair.
//
// Entrance is a short stagger; everything is static under prefers-reduced-motion.

import type { CycleItemRow } from '@continuum/contracts';
import { IMPACT_TIER_COPY, type ImpactTier, impactTier } from '@continuum/contracts';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { asOfLine } from '../recQueueModel';
import { BeforeAfterStrip, type BeforeAfterStripProps } from './BeforeAfterStrip';
import { anchorOf, type PortfolioHeadline as HeadlineModel, relevantTiles } from './headlineModel';
import type { HeroHeader, HeroSetting } from './heroHeaderModel';
import type { HeroCta, HeroView } from './heroModel';
import { JainaPortfolioPanel, type JainaPortfolioPanelProps } from './JainaPortfolioPanel';
import { NEWS_LIST, NEWS_PANE, NEWS_ROW_SIZE } from './news/cardShape';
import { InsightCard } from './news/InsightCard';
import type { NewsTier } from './news/NewsCard';
import { NewsCard } from './news/NewsCard';
import { buildPortfolioNews, type NewsCardModel } from './news/newsModel';
import { PortfolioAnchor } from './PortfolioAnchor';
import { PortfolioFactsLine } from './PortfolioHeaderLine';
import { PortfolioHeadline } from './PortfolioHeadline';
import { PortfolioTiles } from './PortfolioTiles';

const TIER_TONE: Record<ImpactTier, 'destructive' | 'warning' | 'muted'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
};

const EASE = [0.16, 1, 0.3, 1] as const;

/** The read above the findings: blocks separated by space, no frame around or inside it. */
const MODULE = 'flex flex-col gap-5';

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
  /** The grey line of facts under the sentences; the name and controls live in the bar.
   *  Absent with the other blocks, the hero is the findings alone. */
  header?: HeroHeader;
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

  const facts = header ? (
    <PortfolioFactsLine header={header} onEditSetting={onEditSetting} />
  ) : null;

  if (view.state === 'first_cycle') {
    return (
      <section className={cn(NEWS_PANE, 'flex flex-col gap-6')} data-testid="portfolio-hero">
        <div className={MODULE} data-testid="portfolio-module">
          {facts}
          <div className="h-24 animate-pulse rounded-md bg-muted/70" />
          <p className="text-muted-foreground text-xs">
            Jaina writes her first read after the first cycle.
          </p>
          {jaina ? <JainaPortfolioPanel {...jaina} /> : null}
        </div>
      </section>
    );
  }

  const resultLabel = view.brief.growth.result_label;

  const cell = (card: NewsCardModel) => (
    <motion.div
      data-testid="portfolio-news-cell"
      key={card.id}
      variants={card === news.lead ? heroVariants : tileVariants}
    >
      {card === news.lead ? (
        <NewsCard
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
  const anchor = headline
    ? anchorOf({
        growth: view.brief.growth,
        words: headline.words,
        currency,
        days: headline.days,
        beforeAfter: beforeAfter?.model ?? null,
      })
    : null;
  const tiles = headline
    ? relevantTiles({ headline, brief: view.brief, items, dailyTotal, currency })
    : [];
  const hasModule = Boolean(header || headline || beforeAfter || jaina);
  const asOf = asOfLine(view.asOf, nextCycleAt, stale) ?? 'Awaiting the first cycle';
  const findingCount = news.cards.length;

  return (
    <motion.section
      animate="visible"
      className={cn(NEWS_PANE, 'flex flex-col gap-6')}
      data-testid="portfolio-hero"
      initial={play ? 'hidden' : false}
      variants={groupVariants}
    >
      {hasModule ? (
        <motion.div className={MODULE} data-testid="portfolio-module" variants={tileVariants}>
          {headline && anchor ? (
            <div className="grid grid-cols-1 items-start gap-4 @[40rem]/news:grid-cols-[auto_minmax(0,1fr)] @[40rem]/news:gap-9">
              <PortfolioAnchor
                anchor={anchor}
                currency={currency}
                onEditSetting={onEditSetting}
                window={beforeAfter?.window ?? view.brief.growth.window}
              />
              <div className="flex min-w-0 max-w-[64ch] flex-col gap-2">
                <PortfolioHeadline headline={headline} onEditSetting={onEditSetting} />
                {facts}
              </div>
            </div>
          ) : (
            facts
          )}
          {tiles.length > 0 ? <PortfolioTiles onEditSetting={onEditSetting} tiles={tiles} /> : null}
          {beforeAfter ? (
            // The workspace hands the strip its words in the Overview's vocabulary; the
            // module speaks the headline's.
            <BeforeAfterStrip {...beforeAfter} words={headline?.words ?? beforeAfter.words} />
          ) : null}
          {jaina ? <JainaPortfolioPanel {...jaina} /> : null}
        </motion.div>
      ) : null}

      <section className="flex flex-col gap-1" data-testid="portfolio-findings">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h3 className="font-semibold text-foreground text-sm">What the Optimizer found</h3>
          <p className="text-muted-foreground text-xs" data-testid="portfolio-findings-meta">
            {findingCount} finding{findingCount === 1 ? '' : 's'} · {asOf}
          </p>
        </div>
        <motion.div className={NEWS_LIST} data-testid="portfolio-news-row" variants={groupVariants}>
          {row.map(cell)}
        </motion.div>

        {more.length > 0 ? (
          <details
            className="group border-border/60 border-t pt-3"
            data-testid="portfolio-news-more"
          >
            <summary className="cursor-pointer list-none text-muted-foreground text-xs hover:text-foreground">
              <span className="group-open:hidden">
                {more.length} more finding{more.length === 1 ? '' : 's'}
              </span>
              <span className="hidden group-open:inline">Fewer findings</span>
            </summary>
            <div className={NEWS_LIST}>{more.map(cell)}</div>
          </details>
        ) : null}
      </section>
    </motion.section>
  );
}
