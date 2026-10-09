'use client';

// One portfolio as ONE ROW of a live table — Performance+ one-bar redesign, unit L1. The same
// row primitive draws the Portfolios tab and the Overview's portfolio block, so the two lists
// cannot drift into two different shapes: the name and its badges with one muted line under
// it, then five columns — cost against its target with a small bar, two plain figures, the
// decisions waiting, and the state in words. Rows are separated by a hairline, never boxed.
//
// Each row is its own size container: wide (≥ 40rem) it is a six-column grid that lines up
// with `PortfolioTableHeader`; narrow (a 390px panel) it collapses to the name line and ONE
// figures line, where each figure carries the word its column header would have said.
//
// The Overview's figures come from `portfolioWindow()` in account/overviewModel, the same rows
// the headline sentence is built from, so a row can be checked against the tiles.

import type { AccountCandidate, PortfolioListItem } from '@continuum/contracts';
import { getOptimizationMetricDefinition, rankAccountCandidates } from '@continuum/contracts';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ApplyModePill } from '../ApplyModePill';
import {
  type FigureUnit,
  type FigureWindow,
  figureProps,
  formatCpa,
  formatCurrency,
  humanize,
} from '../format';
import { pendingWorkCount } from '../reportModel';
import * as typeScale from '../typeScale';
import {
  type PortfolioWindow,
  resultWords,
  type TileState,
  targetSide,
  vsTargetLabel,
} from './account/overviewModel';
import { PlatformChip } from './platforms/PlatformChip';
import { type AdPlatform, orderPlatforms } from './platforms/platformTabsModel';
import { rosterLine, rosterTone, staleLine } from './portfolioStaleness';

// ---------------------------------------------------------------------------
// The row primitive
// ---------------------------------------------------------------------------

/** The six columns, written once for the header and every row. Literal so Tailwind sees it. */
const WIDE_GRID =
  '@[40rem]:grid @[40rem]:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_4.5rem_minmax(0,1fr)] @[40rem]:items-center @[40rem]:gap-x-4';

/** Small uppercase muted column labels over the rows. Hidden in a narrow container, where each
 *  figure names itself instead. */
export function PortfolioTableHeader({
  labels,
}: {
  labels: readonly [string, string, string, string, string, string];
}) {
  return (
    <div className="@container" data-testid="portfolio-table-header">
      <div className={cn('hidden px-2 pb-2', WIDE_GRID)}>
        {labels.map((label, index) => (
          <span
            className={cn(
              'font-semibold text-muted-foreground',
              typeScale.label,
              index >= 2 && 'text-right',
            )}
            key={label}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

type PortfolioRowProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** The name block: name line and the one muted line under it. */
  lead: ReactNode;
  /** The five column cells, in header order. */
  cells: ReactNode;
  selected?: boolean;
  [dataAttribute: `data-${string}`]: string | undefined;
};

/** One portfolio row: the whole row is the click target, separated from the next by a hairline. */
export function PortfolioRow({ lead, cells, selected, className, ...button }: PortfolioRowProps) {
  return (
    <div className="@container border-border/60 border-t first:border-t-0">
      <button
        className={cn(
          'flex w-full flex-col gap-1.5 rounded-md px-2 py-3 text-left transition-colors',
          'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          WIDE_GRID,
          selected && 'bg-accent/60',
          className,
        )}
        type="button"
        {...button}
      >
        <div className="min-w-0">{lead}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs @[40rem]:contents">
          {cells}
        </div>
      </button>
    </div>
  );
}

/** The name in semibold with its badges beside it; the name stays the row's first paragraph. */
export function PortfolioRowName({ name, badges }: { name: string; badges?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      <p className="truncate font-semibold text-sm tracking-tight">{name}</p>
      {badges}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** The cost figure wears the state's colour; every other figure is a plain fact. */
const STATE_TONE: Record<TileState, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
  none: 'text-foreground',
};

const BAR_TONE: Record<TileState, string> = {
  ok: 'bg-success/60',
  warn: 'bg-warning/60',
  bad: 'bg-destructive/60',
  none: 'bg-muted-foreground/40',
};

/** The portfolio's target in display units (per thousand for awareness). Null when none set. */
export function portfolioTarget(portfolio: PortfolioListItem): number | null {
  if (portfolio.cpa_target == null || portfolio.cpa_target <= 0) return null;
  const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
  return portfolio.cpa_target * metric.denominatorMultiplier;
}

/** Cost per result against its target — the figure in the state's colour, "/ target" muted,
 *  and a small bar filled to how much of the target the cost uses. */
export function CostVsTargetCell({
  window,
  target,
  currency,
  figureKey,
  caption,
  testId,
}: {
  window: PortfolioWindow | null;
  target: number | null;
  currency?: string | null;
  figureKey: (name: string) => string;
  caption?: string;
  testId: string;
}) {
  const state: TileState = window?.state ?? 'none';
  const cost = window?.costPerResult ?? null;
  const fill = cost != null && target != null && target > 0 ? Math.min(1, cost / target) : null;
  return (
    <div className="min-w-0" data-testid={testId}>
      <p className="flex flex-wrap items-center gap-x-1 tabular-nums">
        <span
          className={cn('font-mono font-semibold text-sm', STATE_TONE[state])}
          {...figureProps(figureKey('cost'), cost, currency, 'd7', 'currency')}
        >
          {window ? formatCpa(cost, currency) : '—'}
        </span>
        {target != null ? (
          <span className="text-muted-foreground text-xs">
            /{' '}
            <span {...figureProps(figureKey('target'), target, currency)}>
              {formatCpa(target, currency)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">no target</span>
        )}
        {fill != null ? (
          <span
            aria-hidden
            className="relative ml-1 inline-block h-1 w-12 overflow-hidden rounded-full bg-border"
            data-testid="portfolio-cost-bar"
          >
            <span
              className={cn('absolute inset-y-0 left-0 rounded-full', BAR_TONE[state])}
              style={{ width: `${Math.round(fill * 100)}%` }}
            />
          </span>
        ) : null}
      </p>
      {caption ? <p className="truncate text-muted-foreground text-xs">{caption}</p> : null}
    </div>
  );
}

/** A plain right-aligned figure. `narrowSuffix` names it when the header is hidden; `caption`
 *  names it on a surface that draws no header at all. */
export function FigureCell({
  figureKey,
  raw,
  text,
  currency,
  unit = 'currency',
  window = 'none',
  narrowSuffix,
  caption,
  testId,
}: {
  figureKey?: string;
  raw: number | null;
  text: string;
  currency?: string | null;
  unit?: FigureUnit;
  window?: FigureWindow;
  narrowSuffix?: string;
  caption?: string;
  testId?: string;
}) {
  const figure = figureKey ? figureProps(figureKey, raw, currency, window, unit) : {};
  return (
    <div className="min-w-0 tabular-nums @[40rem]:text-right" data-testid={testId}>
      <p className="font-mono text-sm">
        <span {...figure}>{text}</span>
        {narrowSuffix ? (
          <span className="font-sans text-muted-foreground text-xs @[40rem]:hidden">
            {narrowSuffix}
          </span>
        ) : null}
      </p>
      {caption ? <p className="truncate text-muted-foreground text-xs">{caption}</p> : null}
    </div>
  );
}

/** Decisions waiting, as a primary count — the one thing on the row that asks something. */
export function PendingCell({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="hidden text-muted-foreground text-sm @[40rem]:block @[40rem]:text-right">
        —
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 @[40rem]:justify-end">
      <span
        className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 font-semibold text-primary-foreground text-xs tabular-nums"
        data-testid="portfolio-pending-count"
      >
        {count}
      </span>
      <span className="text-muted-foreground text-xs @[40rem]:hidden">pending</span>
    </span>
  );
}

/**
 * "33% over" / "12% under" / "on target" — the distance to target in the words the status
 * column needs. "0 results" outranks the target: a cost cannot be read from nothing. `null`
 * window is a portfolio no cycle has measured yet. Built from the side as a value, never by
 * parsing the label's words.
 */
export function stateChipLabel(window: PortfolioWindow | null | undefined): string {
  if (!window) return 'no cycle yet';
  if (window.results === 0) return '0 results';
  if (window.target == null) return 'no target';
  const side = targetSide(window.vsTargetPct);
  if (side === 'over' || side === 'under') {
    return `${Math.abs(window.vsTargetPct ?? 0)}% ${side}`;
  }
  return vsTargetLabel(window.vsTargetPct);
}

const STATUS_TONE: Record<TileState, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
  none: 'text-muted-foreground',
};

/** The state in words, coloured by verdict. */
export function StatusCell({ window }: { window: PortfolioWindow | null }) {
  const state: TileState = window?.state ?? 'none';
  return (
    <span
      className={cn('font-semibold text-xs @[40rem]:text-right', STATUS_TONE[state])}
      data-testid="portfolio-state-chip"
    >
      {stateChipLabel(window)}
    </span>
  );
}

const ROSTER_TONE = { danger: 'text-destructive', warning: 'text-warning' } as const;

/** "last cycle 49 days ago" · "roster gone since Aug 6 · 12 of 12 ad sets" as quiet text
 *  beside the name. Nothing when the read carries no staleness. */
export function StalenessNote({ portfolio }: { portfolio: PortfolioListItem }) {
  const stale = staleLine(portfolio);
  const roster = rosterLine(portfolio);
  const tone = rosterTone(portfolio);
  if (!stale && !roster) return null;
  return (
    <>
      {stale ? (
        <span className="text-warning text-xs" data-testid="stale-chip">
          {stale}
        </span>
      ) : null}
      {roster && tone ? (
        <span className={cn('text-xs', ROSTER_TONE[tone])} data-testid="roster-chip">
          {roster}
        </span>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// The Overview's row
// ---------------------------------------------------------------------------

/**
 * Which portfolio each of today's findings belongs to, and which one leads the account.
 *
 * Ranked order decides both, so a portfolio named by two findings shows the stronger, and the
 * emphasised row is the one the lead card above is already about. Guards are excluded by
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

type PortfolioRowCardProps = {
  portfolio: PortfolioListItem;
  currency?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  /** Warm the portfolio's detail reads on hover/focus so opening it paints from cache. */
  onPrefetch?: () => void;
  /** This portfolio's 7-day window from `portfolioWindow()` in sections/account/overviewModel.ts.
   *  Null/absent = no cycle yet: the figures render as '—' and the status says 'no cycle yet'. */
  window?: PortfolioWindow | null;
  /** The platform the portfolio buys on; the row names it in a chip before the objective.
   *  Ignored when `platforms` is given. */
  platform?: AdPlatform;
  /** Every platform the portfolio holds members on (portfolioPlatforms.ts): one chip each,
   *  Meta, Google, TikTok, whatever order they arrive in. Empty while they are being read. */
  platforms?: readonly AdPlatform[];
};

/** The Overview's portfolio row. It draws no header above it, so each figure carries its own
 *  caption: cost per result vs target, results and spend over the window, decisions, state. */
export function PortfolioRowCard({
  portfolio,
  currency,
  selected,
  onSelect,
  onPrefetch,
  window = null,
  platform,
  platforms,
}: PortfolioRowCardProps) {
  const chips = platforms ? orderPlatforms(platforms) : platform ? [platform] : [];
  const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
  const words = resultWords(window?.kind ?? metric.kpiField, metric.resultLabel);
  const figureKey = (name: string) => `portfolio-row.${portfolio.id}.${name}`;

  return (
    <PortfolioRow
      cells={
        <>
          <CostVsTargetCell
            caption={`per ${words.one}`}
            currency={currency}
            figureKey={figureKey}
            target={window ? window.target : portfolioTarget(portfolio)}
            testId="portfolio-row-cost"
            window={window}
          />
          <FigureCell
            caption={`${words.many} 7d`}
            currency={currency}
            figureKey={figureKey('results')}
            raw={window?.results ?? null}
            testId="portfolio-row-results"
            text={window ? window.results.toLocaleString('en-US') : '—'}
            unit="count"
            window="d7"
          />
          <FigureCell
            caption={currency ? `${currency} 7d` : '7d'}
            currency={currency}
            figureKey={figureKey('spend')}
            raw={window?.spend ?? null}
            testId="portfolio-row-spend"
            text={window ? formatCurrency(window.spend, currency) : '—'}
            window="d7"
          />
          <PendingCell count={pendingWorkCount(portfolio)} />
          <StatusCell window={window} />
        </>
      }
      data-portfolio-id={portfolio.id}
      data-state={window?.state ?? 'none'}
      data-testid="portfolio-row"
      lead={
        <>
          <PortfolioRowName
            badges={
              <>
                <ApplyModePill
                  applyMode={portfolio.apply_mode}
                  autopilotPaused={portfolio.autopilot_paused}
                  scopes={portfolio.autopilot_scopes ?? null}
                />
                <StalenessNote portfolio={portfolio} />
              </>
            }
            name={portfolio.name}
          />
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground text-xs">
            {chips.length > 0 ? (
              <span
                className="inline-flex flex-wrap items-center gap-1"
                data-testid="portfolio-row-platforms"
              >
                {chips.map((held) => (
                  <PlatformChip key={held} platform={held} />
                ))}
              </span>
            ) : null}
            <span>{humanize(portfolio.objective)}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {portfolio.adset_count} {portfolio.adset_count === 1 ? 'ad set' : 'ad sets'}
            </span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {formatCurrency(portfolio.daily_total, currency)}/day
            </span>
          </div>
        </>
      }
      onClick={onSelect}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
      selected={selected}
    />
  );
}
