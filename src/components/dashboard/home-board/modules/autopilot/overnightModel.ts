// H07 Overnight: what the Optimizer did for the brand in the last 24 h, and how each portfolio is
// set to run. The Backend's Overnight read says what each action's outcome really was
// (overnightRead.ts). This file is what the tile draws without it, from the Optimizer's own action
// feed (optimizer_list_actions, useOptimizerActions), until the Backend deploys.
//
// The honesty rule of the feed: it sends no outcome column, and a write that failed lives in
// apply_audits beside the ones that landed. So a write is "applied" only when its own row proves
// it: a receipt whose read-back came back clean (Meta's verification.state 'verified', written by
// the Optimizer after it read the entity back). Every other write reads "Sent", and the module says
// once that outcomes arrive with an update. "Skipped by cap" needs the read and is not drawn.

import type { AdAccount, PortfolioListItem } from '@continuum/contracts';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { platformWritable } from '@/components/paid-media/optimizer/platformWrites';
import { portfolioCurrency } from '@/components/paid-media/optimizer/portfolioCurrency';
import {
  type ActionChange,
  actionCurrency,
  actorLabel,
  minorToMajor,
  readActionChange,
} from '@/components/paid-media/optimizer/sections/actionRows';
import { formatSettingsValue } from '@/components/paid-media/optimizer/sections/recQueueModel';
import type { OptimizerActionFeedRow } from '@/components/paid-media/optimizer/useOptimizerData';
import { bareAccountId } from '@/lib/paid-media/accountId';

export const OVERNIGHT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const OUTCOME_NOTE =
  'A write reads "Applied" only when the platform read it back. Every other write reads "Sent" until write outcomes arrive with an update.';

export const OVERNIGHT_MISSING =
  'No portfolio lets Continuum act here yet — every change waits for your team or the client.';

type Accounts = readonly Pick<AdAccount, 'account_id' | 'currency'>[];

/** The Home's ad accounts in the shape the Optimizer's currency readers take. */
export function accountRefsOf(
  accounts: readonly { id: string; currency: string | null }[],
): Pick<AdAccount, 'account_id' | 'currency'>[] {
  return accounts.map((account) => ({ account_id: account.id, currency: account.currency }));
}

const tsOf = (row: Pick<OptimizerActionFeedRow, 'ts'>): number => Date.parse(row.ts);

/** The actions of the 24 h before `now`, newest first. */
export function actionsInWindow<T extends Pick<OptimizerActionFeedRow, 'ts'>>(
  rows: readonly T[],
  now: Date,
): T[] {
  const since = now.getTime() - OVERNIGHT_WINDOW_MS;
  return rows
    .filter((row) => Number.isFinite(tsOf(row)) && tsOf(row) >= since)
    .sort((a, b) => tsOf(b) - tsOf(a));
}

/** The feed pages newest first, 50 rows at a time: while every loaded row is still inside the
 *  window and the feed has more, the next page may hold more of the window. */
export function needsOlderPage(
  rows: readonly Pick<OptimizerActionFeedRow, 'ts'>[],
  now: Date,
  hasNextPage: boolean,
): boolean {
  if (!hasNextPage || rows.length === 0) return false;
  const since = now.getTime() - OVERNIGHT_WINDOW_MS;
  return rows.every((row) => tsOf(row) >= since);
}

export type ActionOutcome = {
  /** applied: the row proves it · sent: the row cannot say · unconfirmed: the read-back
   *  disagreed · failed: the row says it did not land · waiting: for a person or the executor ·
   *  recorded: a setting, a decision, or something done that wrote no new value. */
  kind: 'applied' | 'sent' | 'unconfirmed' | 'failed' | 'waiting' | 'recorded';
  label: string;
};

const SENT: ActionOutcome = { kind: 'sent', label: 'Sent · outcome not readable yet' };

const UNCONFIRMED: Record<string, string> = {
  unverified: 'Sent · the read-back could not confirm it',
  value_mismatch: 'Sent · the platform shows a different value',
  delivery_changed: 'Sent · delivery changed with it',
};

const DECISION_LABELS: Record<string, string> = {
  approved: 'Recommendation approved',
  rejected: 'Recommendation dismissed',
};

export function outcomeOf(row: OptimizerActionFeedRow): ActionOutcome {
  if (row.family === 'settings') return { kind: 'recorded', label: 'Setting changed' };
  if (row.family === 'decision') {
    const status = typeof row.after?.status === 'string' ? row.after.status : null;
    return {
      kind: 'recorded',
      label: (status && DECISION_LABELS[status]) ?? `Recommendation set to ${status ?? 'unknown'}`,
    };
  }
  const receipt = row.receipt ?? null;
  if (receipt?.success === false) return { kind: 'failed', label: 'Failed' };
  const verification = receipt?.verification as { state?: unknown } | undefined;
  const state = typeof verification?.state === 'string' ? verification.state : null;
  if (receipt?.success === true && state === 'verified') {
    return { kind: 'applied', label: 'Applied · confirmed by read-back' };
  }
  if (state && UNCONFIRMED[state]) return { kind: 'unconfirmed', label: UNCONFIRMED[state] };
  return SENT;
}

function printValue(change: ActionChange, value: string | number | null, currency: string | null) {
  if (value == null) return '—';
  if (change.unit === 'money' && typeof value === 'number') {
    return formatCurrency(minorToMajor(value, currency), currency);
  }
  if (change.unit === 'money_major' && typeof value === 'number') {
    return formatCurrency(value, currency);
  }
  return String(value);
}

/** "Daily budget: $220 MXN → $275 MXN", or the change's own sentence. */
export function changeLine(row: OptimizerActionFeedRow, currency: string | null): string {
  const change = readActionChange(row);
  if (change.sentence) return change.sentence;
  if (change.before == null && change.after == null) return change.label;
  return `${change.label}: ${printValue(change, change.before, currency)} → ${printValue(change, change.after, currency)}`;
}

export type OvernightRow = {
  id: string;
  ts: string;
  portfolioName: string | null;
  change: string;
  /** The Optimizer's own reason, as stored. */
  why: string | null;
  actor: string;
  outcome: ActionOutcome;
};

export function overnightRowsOf(
  rows: readonly OptimizerActionFeedRow[],
  portfolios: readonly PortfolioListItem[],
  accounts: Accounts,
): OvernightRow[] {
  return rows.map((row) => ({
    id: row.id,
    ts: row.ts,
    portfolioName: row.portfolio_name ?? null,
    change: changeLine(row, actionCurrency(row, portfolios, accounts)),
    why: row.justification ?? null,
    actor: actorLabel(row),
    outcome: outcomeOf(row),
  }));
}

/** "2 budget writes · 1 decision". */
export function overnightSummary(rows: readonly Pick<OptimizerActionFeedRow, 'family'>[]): string {
  const count = (family: string) => rows.filter((row) => row.family === family).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    count('money') > 0 ? plural(count('money'), 'write', 'writes') : null,
    count('settings') > 0 ? plural(count('settings'), 'setting change', 'setting changes') : null,
    count('decision') > 0 ? plural(count('decision'), 'decision', 'decisions') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const MODE_LABELS: Record<string, string> = {
  observe: 'Observe',
  recommend: 'Recommend',
  autopilot: 'Autopilot',
};

/** Continuum may write at least one platform the portfolio is on. */
function canWrite(portfolio: PortfolioListItem): boolean {
  const platforms = portfolio.platforms.length > 0 ? portfolio.platforms : ['meta'];
  return platforms.some((platform) => platformWritable(portfolio, platform));
}

/** Active, not observing, and allowed to write: a portfolio that can act on its own or on an OK. */
export function hasActingPortfolio(rows: readonly PortfolioListItem[]): boolean {
  return rows.some(
    (portfolio) =>
      portfolio.status === 'active' && portfolio.apply_mode !== 'observe' && canWrite(portfolio),
  );
}

export type PortfolioRun = {
  id: string;
  name: string;
  mode: string;
  paused: boolean;
  /** Every platform's writes are off: the client applies the changes. */
  writesOff: boolean;
  /** The most a budget may move in one cycle ("20%"); null when no cap is set. */
  maxChange: string | null;
  /** The most money autopilot may move in a day; null when no cap is set. */
  maxDaily: string | null;
};

function accountCurrency(portfolio: PortfolioListItem, accounts: Accounts): string | null {
  if (!portfolio.ad_account_id) return null;
  const wanted = bareAccountId(portfolio.ad_account_id);
  return accounts.find((account) => bareAccountId(account.account_id) === wanted)?.currency ?? null;
}

/** How each active portfolio runs, read from the portfolio list (no write from the Home). */
export function portfolioRunsOf(
  rows: readonly PortfolioListItem[],
  accounts: Accounts,
): PortfolioRun[] {
  return rows
    .filter((portfolio) => portfolio.status === 'active')
    .map((portfolio) => {
      const currency = portfolioCurrency(portfolio, accountCurrency(portfolio, accounts));
      const maxPct = portfolio.max_change_pct_per_cycle ?? null;
      const maxMinor = portfolio.max_daily_apply_minor ?? null;
      return {
        id: portfolio.id,
        name: portfolio.name,
        mode: MODE_LABELS[portfolio.apply_mode] ?? portfolio.apply_mode,
        paused: portfolio.autopilot_paused === true,
        writesOff: !canWrite(portfolio),
        maxChange:
          maxPct == null ? null : formatSettingsValue('max_change_pct_per_cycle', maxPct, currency),
        maxDaily:
          maxMinor == null ? null : formatCurrency(minorToMajor(maxMinor, currency), currency),
      };
    });
}
