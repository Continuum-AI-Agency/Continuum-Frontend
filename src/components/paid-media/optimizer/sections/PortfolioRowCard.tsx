'use client';

// One portfolio as ONE LINE of the Overview — Performance+ redesign, proposal O1
// (docs/performance-plus-redesign/overview.html, the "Portafolios" block). The name and what
// it buys on the left, then three figures over the window the latest cycle measured — cost
// per result against its target, results, spend — and a chip that says how it sits against
// that target. Every figure comes from `portfolioWindow()` in account/overviewModel, the same
// rows the headline sentence is built from, so the row can be checked against the tiles.

import type { AccountCandidate, PortfolioListItem } from '@continuum/contracts';
import { getOptimizationMetricDefinition, rankAccountCandidates } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { ApplyModePill } from '../ApplyModePill';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import { type FigureUnit, figureProps, formatCpa, formatCurrency, humanize } from '../format';
import { pendingWorkCount } from '../reportModel';
import * as typeScale from '../typeScale';
import {
  type PortfolioWindow,
  resultWords,
  type TileState,
  vsTargetLabel,
} from './account/overviewModel';
import { StalenessChips } from './StalenessChips';

type PortfolioRowCardProps = {
  portfolio: PortfolioListItem;
  currency?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  /** Warm the portfolio's detail reads on hover/focus so opening it paints from cache. */
  onPrefetch?: () => void;
  /** This portfolio's 7-day window from `portfolioWindow()` in sections/account/overviewModel.ts.
   *  Null/absent = no cycle yet: the three figures render as '—' and the chip says 'sin ciclo aún'. */
  window?: PortfolioWindow | null;
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

const CHIP_TONE: Record<TileState, StatusTone> = {
  ok: 'success',
  warn: 'warning',
  bad: 'danger',
  none: 'muted',
};

/** The cost figure wears the state's colour; the other two are plain facts. */
const COST_TONE: Record<TileState, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
  none: 'text-foreground',
};

/**
 * "33% sobre" / "12% bajo" / "en objetivo" — `vsTargetLabel` with the word the chip's
 * column already says. "0 resultados" outranks the target: a cost cannot be read from
 * nothing. `null` window is a portfolio no cycle has measured yet.
 */
export function stateChipLabel(window: PortfolioWindow | null | undefined): string {
  if (!window) return 'sin ciclo aún';
  if (window.results === 0) return '0 resultados';
  if (window.target == null) return 'sin objetivo';
  return vsTargetLabel(window.vsTargetPct).replace(/ (sobre|bajo) objetivo$/, ' $1');
}

function decisionsSuffix(pending: number): string {
  if (pending === 0) return '';
  return ` · ${pending} ${pending === 1 ? 'decisión' : 'decisiones'}`;
}

type FigureProps = {
  figureKey: string;
  raw: number | null;
  unit: FigureUnit;
  currency: string | null | undefined;
  text: string;
  caption: string;
  tone?: string;
  testId: string;
};

function Figure({ figureKey, raw, unit, currency, text, caption, tone, testId }: FigureProps) {
  return (
    <div className="min-w-0 sm:text-right" data-testid={testId}>
      <p
        className={cn('font-mono font-semibold tabular-nums', typeScale.body, tone)}
        {...figureProps(figureKey, raw, currency, 'd7', unit)}
      >
        {text}
      </p>
      <p className={cn('truncate text-muted-foreground', typeScale.caption)}>{caption}</p>
    </div>
  );
}

export function PortfolioRowCard({
  portfolio,
  currency,
  selected,
  onSelect,
  onPrefetch,
  window = null,
}: PortfolioRowCardProps) {
  const pending = pendingWorkCount(portfolio);
  const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
  const words = resultWords(window?.kind ?? metric.kpiField, metric.resultLabel);
  const state: TileState = window?.state ?? 'none';
  const figureKey = (name: string) => `portfolio-row.${portfolio.id}.${name}`;

  const costCaption =
    window == null
      ? `por ${words.one}`
      : window.target != null
        ? `por ${words.one} · obj. ${formatCpa(window.target, currency)}`
        : `por ${words.one} · sin objetivo`;

  return (
    <button
      className={cn(
        'flex w-full flex-col gap-2 rounded-lg border border-border/70 bg-card px-4 py-3 text-left transition-colors',
        'sm:grid sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(5.5rem,auto))_auto] sm:items-center sm:gap-x-4',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        onSelect && 'hover:border-primary/50 hover:bg-accent/40',
        selected && 'border-primary ring-1 ring-primary',
      )}
      data-portfolio-id={portfolio.id}
      data-state={state}
      data-testid="portfolio-row"
      onClick={onSelect}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
      type="button"
    >
      <div className="min-w-0">
        <p className={cn('truncate font-semibold tracking-tight', typeScale.body)}>
          {portfolio.name}
        </p>
        <div
          className={cn(
            'mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground',
            typeScale.caption,
          )}
        >
          <span>{humanize(portfolio.objective)}</span>
          <span aria-hidden>·</span>
          <span>
            {portfolio.adset_count} {portfolio.adset_count === 1 ? 'conjunto' : 'conjuntos'}
          </span>
          <span aria-hidden>·</span>
          <span>{formatCurrency(portfolio.daily_total, currency)}/día</span>
          <span aria-hidden>·</span>
          <ApplyModePill
            applyMode={portfolio.apply_mode}
            autopilotPaused={portfolio.autopilot_paused}
            scopes={portfolio.autopilot_scopes ?? null}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:contents">
        <Figure
          caption={costCaption}
          currency={currency}
          figureKey={figureKey('cost')}
          raw={window?.costPerResult ?? null}
          testId="portfolio-row-cost"
          text={window ? formatCpa(window.costPerResult, currency) : '—'}
          tone={COST_TONE[state]}
          unit="currency"
        />
        <Figure
          caption={`${words.many} 7d`}
          currency={currency}
          figureKey={figureKey('results')}
          raw={window?.results ?? null}
          testId="portfolio-row-results"
          text={window ? window.results.toLocaleString('es-MX') : '—'}
          unit="count"
        />
        <Figure
          caption={currency ? `${currency} 7d` : '7d'}
          currency={currency}
          figureKey={figureKey('spend')}
          raw={window?.spend ?? null}
          testId="portfolio-row-spend"
          text={window ? formatCurrency(window.spend, currency) : '—'}
          unit="currency"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        <StatusChip testId="portfolio-state-chip" tone={CHIP_TONE[state]}>
          {stateChipLabel(window)}
          {decisionsSuffix(pending)}
        </StatusChip>
        <StalenessChips portfolio={portfolio} />
      </div>
    </button>
  );
}
