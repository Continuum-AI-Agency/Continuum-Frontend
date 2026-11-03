// H06 Budget pacing: spend to date against the plan, per portfolio and in total per currency.
//
// A plan exists only where an Optimizer portfolio holds a complete flight (period_budget,
// period_start, period_end — `flightOf`). The spend is the engine's own figure: the latest cycle's
// pacing block (`actualSpendToDate`), accepted by the same rule the portfolio page's
// buildFlightPacing uses — only a block that paced THIS flight (`pacingPlanFreshness` current, or
// an unversioned block on the same budget). The flat fallback ('fixed' / 'observed') and a verdict
// about an earlier plan are never read as spend.
//
// "Expected" is arithmetic on the same figures: plan × the share of the period the spend covers.
// The engine's spend runs through the day before its cycle (cycle on day N covers N − 1 complete
// days), so expected = plan × (N − 1) / period days, the engine's own idealCumulative. Ahead or
// behind is spent − expected. No projection, no range: nothing here estimates a day not yet spent.
//
// Money is never added across currencies: totals are per currency, and the tile leads with the
// currency most running plans are in.
//
// Headline (bench anchor): `data-value` = Σ latest_run.pacing.actualSpendToDate over the brand's
// portfolios whose flight contains today and whose currency is the lead one, rounded to cents.
// Direct read: optimizer_list_portfolios(p_brand_id) → rows with a complete flight around today;
// for each, optimizer_get_portfolio_performance(p_portfolio_id, 10).latest_run.pacing (the RPC the
// optimizer-status edge wraps) where source = 'pacing' and planVersion matches the row.

import {
  addDays,
  type CycleRunPacing,
  daysBetween,
  flightOf,
  type PacingFlight,
  type PortfolioListItem,
  pacingPlanFreshness,
} from '@continuum/contracts';
import {
  type FlightPacingStatus,
  pacingStatus,
} from '@/components/paid-media/optimizer/charts/flightPacingModel';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import { bareAccountId } from '@/lib/paid-media/accountId';

export type PacingPortfolio = Pick<
  PortfolioListItem,
  | 'id'
  | 'name'
  | 'status'
  | 'ad_account_id'
  | 'currency'
  | 'period_budget'
  | 'period_start'
  | 'period_end'
>;

/** One portfolio's latest cycle, as far as its pacing block. */
export type PacingRunRead =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'ready'; pacing: CycleRunPacing | null };

export type PortfoliosRead =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'ready'; rows: readonly PacingPortfolio[] };

export type SpendReading =
  | { status: 'pending' }
  | { status: 'error' }
  /** The latest cycle did not pace this flight (no cycle yet, the flat fallback, or a verdict
   *  about an earlier plan). */
  | { status: 'unread' }
  | {
      status: 'read';
      spent: number;
      /** Complete days of the period the spend covers. */
      daysCovered: number;
      /** The last day the spend covers (YYYY-MM-DD); null before the first day closed. */
      through: string | null;
      expected: number;
      gap: number;
      /** Gap against expected, whole percent; null when nothing was expected yet. */
      gapPct: number | null;
      pace: FlightPacingStatus;
    };

type RowBase = {
  id: string;
  name: string;
  adAccountId: string | null;
  currency: string | null;
  plan: number;
  start: string;
  end: string;
  periodDays: number;
};

export type PacingRow =
  | (RowBase & { kind: 'running'; spend: SpendReading })
  | (RowBase & { kind: 'not_started' })
  | (RowBase & { kind: 'ended' });

export type PacingCurrencyGroup = {
  currency: string | null;
  spent: number;
  plan: number;
  expected: number;
  gap: number;
  gapPct: number | null;
  pace: FlightPacingStatus;
  /** Running flights with a spend reading in this currency. */
  portfolios: number;
  /** The latest day any of them covers. */
  through: string | null;
};

export type PacingView =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'missing'; reason: string }
  | {
      state: 'ready';
      headline: PacingCurrencyGroup;
      groups: PacingCurrencyGroup[];
      rows: PacingRow[];
    };

export const PACING_MISSING = {
  noPlan: 'No portfolio has a budget plan for this period — set one in the Optimizer.',
  notPaced:
    'The Optimizer has not read spend against this period’s plan yet — it does on its next daily cycle.',
} as const;

const KIND_ORDER: Record<PacingRow['kind'], number> = { running: 0, not_started: 1, ended: 2 };

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function gapPercent(gap: number, expected: number): number | null {
  return expected > 0 ? Math.round((gap / expected) * 100) : null;
}

/** The engine's ±5% verdict, on the figures shown; on plan while nothing is expected yet. */
function paceAgainst(spent: number, expected: number): FlightPacingStatus {
  return expected > 0 ? pacingStatus(spent / expected) : 'on_track';
}

/** The engine's spend for this flight, or null when its latest block is not about this plan. */
function engineSpend(
  pacing: CycleRunPacing | null,
  portfolio: PacingPortfolio,
  flight: PacingFlight,
): { spent: number; dayIndex: number | null } | null {
  if (!pacing || pacing.source !== 'pacing' || typeof pacing.actualSpendToDate !== 'number') {
    return null;
  }
  const { freshness } = pacingPlanFreshness(pacing, portfolio);
  const samePlan =
    freshness === 'current' ||
    (freshness === 'unversioned' &&
      typeof pacing.periodBudget === 'number' &&
      Math.abs(pacing.periodBudget - flight.periodBudget) < 0.5);
  if (!samePlan) return null;
  return {
    spent: pacing.actualSpendToDate,
    dayIndex: typeof pacing.dayIndex === 'number' ? pacing.dayIndex : null,
  };
}

function spendReading(
  run: PacingRunRead | undefined,
  portfolio: PacingPortfolio,
  flight: PacingFlight,
  periodDays: number,
  todayIndex: number,
): SpendReading {
  if (!run || run.status === 'pending') return { status: 'pending' };
  if (run.status === 'error') return { status: 'error' };
  const engine = engineSpend(run.pacing, portfolio, flight);
  if (!engine) return { status: 'unread' };
  const dayIndex = engine.dayIndex ?? todayIndex;
  const daysCovered = Math.min(periodDays, Math.max(0, dayIndex - 1));
  const expected = cents((flight.periodBudget * daysCovered) / periodDays);
  const spent = cents(engine.spent);
  const gap = cents(spent - expected);
  return {
    status: 'read',
    spent,
    daysCovered,
    through: daysCovered > 0 ? addDays(flight.periodStart, daysCovered - 1) : null,
    expected,
    gap,
    gapPct: gapPercent(gap, expected),
    pace: paceAgainst(spent, expected),
  };
}

function currencyOf(portfolio: PacingPortfolio, accounts: readonly HomeAdAccount[]): string | null {
  if (portfolio.currency) return portfolio.currency;
  if (!portfolio.ad_account_id) return null;
  const wanted = bareAccountId(portfolio.ad_account_id);
  return accounts.find((account) => bareAccountId(account.id) === wanted)?.currency ?? null;
}

function rowOf(
  portfolio: PacingPortfolio,
  runs: ReadonlyMap<string, PacingRunRead>,
  accounts: readonly HomeAdAccount[],
  today: string,
): PacingRow | null {
  const flight = flightOf(portfolio);
  if (!flight || flight.periodEnd < flight.periodStart) return null;
  const periodDays = daysBetween(flight.periodStart, flight.periodEnd) + 1;
  const base: RowBase = {
    id: portfolio.id,
    name: portfolio.name,
    adAccountId: portfolio.ad_account_id,
    currency: currencyOf(portfolio, accounts),
    plan: flight.periodBudget,
    start: flight.periodStart,
    end: flight.periodEnd,
    periodDays,
  };
  if (today < flight.periodStart) return { ...base, kind: 'not_started' };
  if (today > flight.periodEnd) return { ...base, kind: 'ended' };
  const todayIndex = daysBetween(flight.periodStart, today) + 1;
  return {
    ...base,
    kind: 'running',
    spend: spendReading(runs.get(portfolio.id), portfolio, flight, periodDays, todayIndex),
  };
}

function groupsOf(rows: PacingRow[]): PacingCurrencyGroup[] {
  const byCurrency = new Map<string | null, PacingCurrencyGroup>();
  for (const row of rows) {
    if (row.kind !== 'running' || row.spend.status !== 'read') continue;
    const group = byCurrency.get(row.currency) ?? {
      currency: row.currency,
      spent: 0,
      plan: 0,
      expected: 0,
      gap: 0,
      gapPct: null,
      pace: 'on_track' as FlightPacingStatus,
      portfolios: 0,
      through: null,
    };
    group.spent = cents(group.spent + row.spend.spent);
    group.plan = cents(group.plan + row.plan);
    group.expected = cents(group.expected + row.spend.expected);
    group.portfolios += 1;
    const through = row.spend.through;
    if (through && (!group.through || through > group.through)) group.through = through;
    byCurrency.set(row.currency, group);
  }
  // Stable: the most running plans first, then the order the portfolios came in.
  return [...byCurrency.values()]
    .map((group) => {
      const gap = cents(group.spent - group.expected);
      return {
        ...group,
        gap,
        gapPct: gapPercent(gap, group.expected),
        pace: paceAgainst(group.spent, group.expected),
      };
    })
    .sort((a, b) => b.portfolios - a.portfolios);
}

export function pacingView(input: {
  portfolios: PortfoliosRead;
  runs: ReadonlyMap<string, PacingRunRead>;
  accounts: readonly HomeAdAccount[];
  today: string;
}): PacingView {
  const { portfolios, runs, accounts, today } = input;
  if (portfolios.status === 'pending') return { state: 'loading' };
  if (portfolios.status === 'error') return { state: 'error' };

  const rows = portfolios.rows
    .filter((portfolio) => portfolio.status !== 'archived')
    .flatMap((portfolio) => {
      const row = rowOf(portfolio, runs, accounts, today);
      return row ? [row] : [];
    })
    .map((row, index) => ({ row, index }))
    .sort((a, b) => KIND_ORDER[a.row.kind] - KIND_ORDER[b.row.kind] || a.index - b.index)
    .map(({ row }) => row);

  const running = rows.flatMap((row) => (row.kind === 'running' ? [row] : []));
  if (running.length === 0) return { state: 'missing', reason: PACING_MISSING.noPlan };
  if (running.some((row) => row.spend.status === 'pending')) return { state: 'loading' };

  const groups = groupsOf(rows);
  const [headline] = groups;
  if (!headline) {
    return running.every((row) => row.spend.status === 'error')
      ? { state: 'error' }
      : { state: 'missing', reason: PACING_MISSING.notPaced };
  }
  return { state: 'ready', headline, groups, rows };
}

/** Where a plan is set and a portfolio's pacing is read: the Optimizer, on the account. */
export function optimizerHref(adAccountId: string | null): string {
  const base = '/scale?tab=performance';
  return adAccountId ? `${base}&adAccountId=${encodeURIComponent(adAccountId)}` : base;
}
