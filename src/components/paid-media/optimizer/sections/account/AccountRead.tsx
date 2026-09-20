'use client';

// The account read: what the optimizer opens on, before anyone picks a portfolio.
//
// Guards first, then the ranked list. The order is the whole argument: if measurement is
// broken or the target is wrong, a list ordered by money is an instrument pointing precisely
// at the wrong number, so those two are read BEFORE the list and never inside it.
//
// Every figure here came from a detector. The card shows the real money per day; the RANK
// used a discounted value, and the class chip is what says so out loud.

import type { AccountCandidate, AccountDetector } from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  accountGuards,
  CHART_SHAPE_READING,
  chartShapeFor,
  IMPACT_CLASS_COPY,
  IMPACT_TIER_COPY,
  impactTier,
  rankAccountCandidates,
} from '@continuum/contracts';
import { AlertTriangleIcon, SparklesIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';
import { AccountChartView } from './AccountChartView';

const TIER_VARIANT = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
} as const;

export type AccountReadProps = {
  candidates: AccountCandidate[];
  currency: string | null;
  /** The account's daily spend — the scale the impact tiers are read against. */
  dailySpend: number | null;
  /** Detectors that could not ask, and what they lacked. Shown so silence is never read as health. */
  starved?: Array<{ detector: AccountDetector; missing: string }>;
  /** 'brief' when Jaina wrote today's words, 'fallback' when the read is code-composed. */
  source?: 'brief' | 'fallback';
  onOpenPortfolio?: (portfolioId: string) => void;
};

function Card({
  candidate,
  currency,
  dailySpend,
  lead,
  onOpenPortfolio,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  dailySpend: number | null;
  lead: boolean;
  onOpenPortfolio?: (portfolioId: string) => void;
}) {
  const meta = ACCOUNT_DETECTOR_META[candidate.detector];
  const tier = impactTier(candidate.impact_per_day, dailySpend);
  const shape = chartShapeFor(candidate.detector);
  const target = candidate.cta.kind === 'portfolio' ? candidate.cta.target_id : null;
  return (
    <article
      className={cn(
        'rounded-lg border bg-card p-4',
        lead
          ? 'border-primary/30 bg-gradient-to-br from-primary/5 to-transparent'
          : 'border-border/60',
      )}
      data-detector={candidate.detector}
    >
      <div
        className={cn(
          'grid gap-4',
          lead
            ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
            : 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]',
        )}
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="text-3xs" variant={TIER_VARIANT[tier]}>
              {IMPACT_TIER_COPY[tier]}
            </Badge>
            <Badge className="text-3xs" variant="muted">
              {IMPACT_CLASS_COPY[candidate.impact_class]}
            </Badge>
            {candidate.confidence < 0.7 ? (
              <span className="text-3xs text-muted-foreground">
                {Math.round(candidate.confidence * 100)}% confidence
              </span>
            ) : null}
          </div>
          <h3 className={cn('font-semibold text-foreground', lead ? 'text-base' : 'text-sm')}>
            {meta.label}
          </h3>
          <p className="text-muted-foreground text-xs">{meta.compares}</p>
          <p className="flex flex-wrap items-baseline gap-x-2 text-2xs text-muted-foreground">
            <span
              className={cn(
                'font-mono font-semibold tabular-nums text-foreground',
                lead ? 'text-xl' : 'text-base',
              )}
            >
              {formatCurrency(candidate.impact_per_day, currency)}
            </span>
            <span className="text-foreground">/day</span>
          </p>
          <p className="text-2xs text-muted-foreground">{candidate.impact_basis}</p>
          {target && onOpenPortfolio ? (
            <Button
              className="mt-1"
              onClick={() => onOpenPortfolio(target)}
              size="sm"
              type="button"
              variant={lead ? 'default' : 'secondary'}
            >
              Open the portfolio
            </Button>
          ) : null}
        </div>
        <div className="min-w-0 space-y-1.5">
          {candidate.chart ? (
            <>
              <AccountChartView chart={candidate.chart} currency={currency} />
              <p className="text-3xs text-muted-foreground">{CHART_SHAPE_READING[shape]}</p>
            </>
          ) : (
            <p className="text-2xs text-muted-foreground">No chart for this one yet.</p>
          )}
        </div>
      </div>
    </article>
  );
}

export function AccountRead({
  candidates,
  currency,
  dailySpend,
  starved = [],
  source = 'fallback',
  onOpenPortfolio,
}: AccountReadProps) {
  const guards = accountGuards(candidates);
  const ranked = rankAccountCandidates(candidates);

  if (guards.length === 0 && ranked.length === 0) {
    return (
      <section
        className="rounded-lg border border-border/60 border-dashed bg-muted/10 p-5"
        data-testid="account-read"
      >
        <h2 className="font-semibold text-foreground text-sm">Nothing to move today</h2>
        <p className="mt-1 text-muted-foreground text-xs">
          Every check ran and none of them found money worth moving across this account.
        </p>
        {starved.length > 0 ? <Starved starved={starved} /> : null}
      </section>
    );
  }

  return (
    <section className="space-y-3" data-testid="account-read">
      {guards.map((guard) => (
        <div
          className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
          data-guard={guard.detector}
          key={guard.id}
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 space-y-1">
            <h3 className="font-semibold text-foreground text-sm">
              {ACCOUNT_DETECTOR_META[guard.detector].label}
            </h3>
            <p className="text-muted-foreground text-xs">{guard.impact_basis}</p>
            <p className="text-3xs text-muted-foreground">
              Read this before the list below: it decides whether the rest of these figures mean
              anything.
            </p>
          </div>
        </div>
      ))}

      {ranked.length > 0 ? (
        <>
          <header className="flex flex-wrap items-baseline justify-between gap-2 pt-1">
            <h2 className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
              <SparklesIcon className="size-3.5 text-primary" />
              Across the account, most worth doing first
            </h2>
            <p className="text-3xs text-muted-foreground">
              {source === 'brief' ? 'Jaina, from today’s run' : 'Draft read from today’s run'}
            </p>
          </header>
          {ranked.map((candidate, index) => (
            <Card
              candidate={candidate}
              currency={currency}
              dailySpend={dailySpend}
              key={candidate.id}
              lead={index === 0}
              onOpenPortfolio={onOpenPortfolio}
            />
          ))}
        </>
      ) : null}

      {starved.length > 0 ? <Starved starved={starved} /> : null}
    </section>
  );
}

/** What could not be asked, by name. A gap nobody can name is a gap nobody closes. */
function Starved({ starved }: { starved: Array<{ detector: AccountDetector; missing: string }> }) {
  return (
    <details className="mt-3 rounded-lg border border-border/60 bg-muted/10 p-3">
      <summary className="cursor-pointer text-2xs text-muted-foreground">
        {starved.length} checks could not run today
      </summary>
      <ul className="mt-2 space-y-1">
        {starved.map((row) => (
          <li className="text-2xs text-muted-foreground" key={row.detector}>
            <span className="text-foreground">{ACCOUNT_DETECTOR_META[row.detector].label}</span> —{' '}
            {row.missing}
          </li>
        ))}
      </ul>
    </details>
  );
}
