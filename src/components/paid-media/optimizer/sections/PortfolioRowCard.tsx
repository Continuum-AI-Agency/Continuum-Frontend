'use client';

// One portfolio card for the Overview: what it buys and at what target, how it applies
// moves, its daily budget, where it is in its flight, and whether anything waits on a
// decision. Everything on it comes from the list read — no per-portfolio fetch.
//
// It also carries the one thing today's account read found INSIDE this portfolio, in the same
// register as the account lead card above it: one sentence, one figure, the shared money line,
// and no second opinion. A list of portfolios that says only "$500/day, 2 ad sets" makes the
// reader open every one of them to discover which is the one worth opening.

import type { AccountCandidate, PortfolioListItem } from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  clipLine,
  getOptimizationMetricDefinition,
  rankAccountCandidates,
} from '@continuum/contracts';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ApplyModePill } from '../ApplyModePill';
import { StatusChip } from '../components/StatusChip';
import { formatCpa, formatCurrency, humanize, portfolioLevelLabel } from '../format';
import { pendingWorkCount } from '../reportModel';
import { CalmRule, HeadlineFigure, MoneyLine } from './account/candidateHeadline';
import { daysBetween, isIsoDate, todayIso } from './detail/rangeModel';

type PortfolioRowCardProps = {
  portfolio: PortfolioListItem;
  currency?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  // Warm the portfolio's detail reads on hover/focus so opening it paints from cache.
  onPrefetch?: () => void;
  /** Today's best finding inside this portfolio. Absent renders no band at all — a portfolio
   *  with nothing to say says nothing, rather than an empty frame where a figure belongs. */
  lead?: AccountCandidate | null;
  /** True on the single portfolio holding the account's top finding: the one card whose rule
   *  breathes. Twenty cards breathing at once is not a calm screen, it is a flicker. */
  emphasis?: boolean;
};

/**
 * Which portfolio each of today's findings belongs to, and which one leads the account.
 *
 * Ranked order decides both, so a portfolio named by two findings shows the stronger, and the
 * emphasised card is the one the lead card above is already about. Guards are excluded by
 * `rankAccountCandidates` — a guard says the figures cannot be trusted, which is a statement
 * about the whole account and never a portfolio's recommendation.
 */
export function portfolioLeads(candidates: readonly AccountCandidate[]): {
  leads: Map<string, AccountCandidate>;
  emphasised: string | null;
} {
  const leads = new Map<string, AccountCandidate>();
  let emphasised: string | null = null;
  for (const candidate of rankAccountCandidates(candidates)) {
    for (const portfolioId of candidate.portfolio_ids) {
      if (!leads.has(portfolioId)) leads.set(portfolioId, candidate);
      emphasised ??= portfolioId;
    }
  }
  return { leads, emphasised };
}

/** Day X of N for a portfolio inside its flight; null outside one. */
export function flightProgress(
  portfolio: Pick<PortfolioListItem, 'period_start' | 'period_end'>,
  today: string = todayIso(),
): { day: number; days: number; pct: number } | null {
  const start = portfolio.period_start;
  const end = portfolio.period_end;
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return null;
  const days = daysBetween(start, end) + 1;
  const day = daysBetween(start, today) + 1;
  if (day < 1 || day > days) return null;
  return { day, days, pct: Math.min(100, (day / days) * 100) };
}

export function PortfolioRowCard({
  portfolio,
  currency,
  selected,
  onSelect,
  onPrefetch,
  lead = null,
  emphasis = false,
}: PortfolioRowCardProps) {
  const pending = pendingWorkCount(portfolio);
  const metric = getOptimizationMetricDefinition(
    (portfolio.target_metric ?? portfolio.objective) as Parameters<
      typeof getOptimizationMetricDefinition
    >[0],
  );
  const target =
    portfolio.cpa_target != null && portfolio.cpa_target > 0
      ? portfolio.cpa_target * metric.denominatorMultiplier
      : null;
  const flight = flightProgress(portfolio);

  return (
    <button
      className={cn(
        'flex w-full flex-col gap-2 rounded-lg border border-border/70 bg-card px-4 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        onSelect && 'hover:border-primary/50 hover:bg-accent/40',
        selected && 'border-primary ring-1 ring-primary',
      )}
      onClick={onSelect}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
      type="button"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm tracking-tight">{portfolio.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            <span>{humanize(portfolio.objective)}</span>
            <Badge className="text-3xs font-medium" variant="muted">
              {portfolioLevelLabel(portfolio.level)}
            </Badge>
            <Badge className="text-3xs font-medium" variant="teal">
              {humanize(portfolio.mode)}
            </Badge>
            <ApplyModePill
              applyMode={portfolio.apply_mode}
              autopilotPaused={portfolio.autopilot_paused}
              scopes={portfolio.autopilot_scopes ?? null}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold text-sm tabular-nums">
            {formatCurrency(portfolio.daily_total, currency)}
          </p>
          <p className="text-2xs text-muted-foreground">
            /day · {portfolio.adset_count} ad {portfolio.adset_count === 1 ? 'set' : 'sets'}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center gap-1.5">
        <StatusChip tone="muted">
          {target != null
            ? `${metric.targetLabel} ${formatCpa(target, currency)}`
            : `${metric.costLabel} · no target`}
        </StatusChip>
        {flight ? (
          <StatusChip hint={`Flight day ${flight.day} of ${flight.days}`} tone="info">
            Flight · day {flight.day}/{flight.days}
          </StatusChip>
        ) : null}
        {pending > 0 ? (
          <StatusChip tone="warning">
            {pending} {pending === 1 ? 'decision' : 'decisions'} waiting
          </StatusChip>
        ) : (
          <StatusChip tone="success">clean</StatusChip>
        )}
      </div>
      {flight ? (
        <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary/60" style={{ width: `${flight.pct}%` }} />
        </div>
      ) : null}

      {lead ? (
        <div
          className="mt-1 w-full space-y-1 border-border/60 border-t pt-2"
          data-detector={lead.detector}
          data-testid="portfolio-lead"
        >
          <p className="truncate text-2xs text-muted-foreground">
            {clipLine(ACCOUNT_DETECTOR_META[lead.detector]?.label ?? lead.detector)}
          </p>
          <HeadlineFigure candidate={lead} currency={currency ?? null} size="row" />
          <CalmRule play={emphasis} testId="portfolio-lead-rule" />
          <MoneyLine candidate={lead} currency={currency ?? null} />
        </div>
      ) : null}
    </button>
  );
}
