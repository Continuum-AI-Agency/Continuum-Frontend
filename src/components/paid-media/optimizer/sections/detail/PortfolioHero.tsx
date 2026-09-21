'use client';

// The first thing a portfolio shows: how it is growing, and the one thing worth doing
// today. Entrance: tiles rise in a short stagger, the hero card settles in, the numbers
// count up once per portfolio. Everything is static under prefers-reduced-motion.

import { IMPACT_TIER_COPY, type ImpactTier, impactTier } from '@continuum/contracts';
import { ExternalLinkIcon, SparklesIcon } from 'lucide-react';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type Variants,
} from 'motion/react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';
import { AccountChartView } from '../account/AccountChartView';
import { asOfLine } from '../recQueueModel';
import type { HeroCta, HeroView } from './heroModel';

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

/** A number that counts up on first paint, once. */
function CountUp({
  value,
  format,
  play,
}: {
  value: number;
  format: (n: number) => string;
  play: boolean;
}) {
  const mv = useMotionValue(play ? 0 : value);
  const [shown, setShown] = React.useState(play ? 0 : value);
  useMotionValueEvent(mv, 'change', (v) => setShown(v));
  React.useEffect(() => {
    if (!play) {
      mv.set(value);
      setShown(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: 'easeOut' });
    return () => controls.stop();
  }, [value, play, mv]);
  return <>{format(shown)}</>;
}

const TIER_VARIANT: Record<ImpactTier, 'destructive' | 'warning' | 'muted'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
};

const MODULE_LABEL: Record<string, string> = {
  budget: 'Budget',
  pause: 'Pause',
  creative: 'Creative',
  audience: 'Audience',
  none: 'Growth',
};

export type PortfolioHeroProps = {
  view: HeroView;
  currency: string | null;
  portfolioId: string;
  /** The portfolio's daily total, the scale the impact tiers are read against. */
  dailyTotal: number | null;
  nextCycleAt: string | null;
  onCta: (cta: HeroCta) => void;
  explainHref: string;
};

export function PortfolioHero({
  view,
  currency,
  portfolioId,
  dailyTotal,
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
  const { brief, cta } = view;
  const asOfDay = cycleDay(view.asOf);
  const hero = brief.hero;
  const secondary = brief.secondary
    .map((id) => brief.candidates.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .slice(0, 2);

  if (view.state === 'first_cycle') {
    return (
      <section
        className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
        data-testid="portfolio-hero"
      >
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div className="h-20 animate-pulse rounded-lg bg-muted/70" key={i} />
          ))}
        </div>
        <div className="rounded-lg border border-border/60 border-dashed p-4 text-2xs text-muted-foreground">
          Jaina writes your first read after the first cycle.
        </div>
      </section>
    );
  }

  return (
    <motion.section
      animate="visible"
      className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
      data-testid="portfolio-hero"
      initial={play ? 'hidden' : false}
      variants={groupVariants}
    >
      <div className="space-y-2">
        {/* One chart instead of three tiles. The tiles froze the same window into three
         *  numbers; the chart draws it. When the window cannot be drawn honestly the
         *  chart is null and the sentence below carries the read alone. */}
        <motion.div
          className="rounded-lg border border-border/60 bg-card p-3"
          data-testid="hero-chart"
          variants={tileVariants}
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
          <span>{brief.growth_sentence}</span>
        </motion.p>
      </div>

      <motion.div
        className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4"
        variants={heroVariants}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            className="text-3xs uppercase"
            variant={hero.module === 'none' ? 'muted' : 'default'}
          >
            {MODULE_LABEL[hero.module] ?? hero.module}
          </Badge>
          <span className="inline-flex items-center gap-1 text-3xs text-muted-foreground">
            <SparklesIcon className="size-3" /> Jaina
            {brief.model === 'deterministic' ? ' · draft read' : ''}
          </span>
        </div>
        <p
          className="font-semibold text-base text-foreground leading-snug"
          data-testid="hero-headline"
        >
          {hero.headline}
        </p>
        {hero.why ? <p className="text-muted-foreground text-xs">{hero.why}</p> : null}
        {hero.impact_per_day != null ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-2xs text-muted-foreground">
            <Badge
              className="text-3xs"
              variant={TIER_VARIANT[impactTier(hero.impact_per_day, dailyTotal)]}
            >
              {IMPACT_TIER_COPY[impactTier(hero.impact_per_day, dailyTotal)]}
            </Badge>
            <span className="font-mono font-semibold text-foreground text-xl tabular-nums">
              <CountUp
                format={(n) => formatCurrency(n, currency)}
                play={play}
                value={hero.impact_per_day}
              />
            </span>
            <span className="text-foreground">/day</span>
            {hero.impact_basis ? <span> · {hero.impact_basis}</span> : null}
          </p>
        ) : null}
        {hero.justification ? (
          <p className="text-2xs text-muted-foreground">
            <span className="font-medium text-foreground">Why this over the biggest number:</span>{' '}
            {hero.justification}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
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
            Explain with Jaina <ExternalLinkIcon className="size-3" />
          </a>
        </div>
        {secondary.length > 0 ? (
          <p className="text-3xs text-muted-foreground">
            Also worth a look:{' '}
            {secondary.map((c, i) => (
              <span key={c.id}>
                {i > 0 ? ' · ' : ''}
                {MODULE_LABEL[c.module]?.toLowerCase()} on{' '}
                {c.adset_name ?? c.adset_id ?? 'the portfolio'} (
                {IMPACT_TIER_COPY[impactTier(c.impact_per_day, dailyTotal)].toLowerCase()})
              </span>
            ))}
          </p>
        ) : null}
        <p className="text-3xs text-muted-foreground">
          {asOfLine(view.asOf, nextCycleAt) ?? 'Awaiting the first cycle'}
        </p>
      </motion.div>
    </motion.section>
  );
}
