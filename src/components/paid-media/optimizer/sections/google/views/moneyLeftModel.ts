// "Money left on the table" (P6 view 2): per campaign, Google's impression share and what it
// lost to budget and to rank, in separate columns because they call for opposite actions
// (presentation standard §10). What more budget would buy is the Optimizer's G03 projection when
// a pending card holds one, otherwise a linear range on the window, labelled as such: never one
// figure, because Google does not sell the lost auctions at today's price.

import type { GoogleCampaignRow, GoogleTopCampaigns, PlatformCard } from '@continuum/contracts';
import { formatCurrency } from '../../../format';
import { campaignField } from '../googleReads';
import { type Cell, missing, resultsText, shareText, shown } from './cell';

export type BudgetLimitedCard = Extract<PlatformCard, { variant: 'google_budget_limited' }>;

export type MoneyLeftRow = {
  id: string;
  name: string;
  share: Cell;
  lostToBudget: Cell;
  lostToRank: Cell;
  budgetPerDay: Cell;
  /** What more budget buys, with its basis (Optimizer projection or linear). */
  buys: Cell;
  buysBasis: string | null;
  /** Spend per day the auctions lost to budget would take at today's price; null unknown. */
  extraSpendPerDay: number | null;
  rankOverBudget: boolean;
};

export type MoneyLeftModel = {
  rows: MoneyLeftRow[];
  /** Campaigns that serve on no Search inventory: Google reports them no impression share. */
  offSearch: number;
  /** Rows losing any impressions to budget, and the spend per day that would reach them. */
  budgetLimited: number;
  extraSpendPerDay: number;
  rankLimited: number;
};

/** Channel types with no Search inventory: Google reports them no impression share at all. */
const OFF_SEARCH = new Set(['DISPLAY', 'VIDEO', 'DEMAND_GEN', 'DISCOVERY', 'SMART', 'LOCAL']);

function windowDays(range: { since: string; until: string }): number {
  const days = (Date.parse(range.until) - Date.parse(range.since)) / 86_400_000 + 1;
  return Number.isFinite(days) && days >= 1 ? Math.round(days) : 1;
}

function shareCell(field: { value: number; reason: null } | { value: null; reason: string }): Cell {
  return field.reason === null ? shown(shareText(field.value)) : missing(field.reason);
}

/** Recovering the impressions lost to budget means buying `lost / won` more of what the
 *  campaign buys now. HIGH: at today's price. LOW: none — the lost auctions are the pricier
 *  ones, and G03's own floor is the raise buying only what the old budget did. */
function linear(
  row: GoogleCampaignRow,
  won: number,
  lost: number,
  days: number,
  currency: string | null,
): Pick<MoneyLeftRow, 'buys' | 'buysBasis' | 'extraSpendPerDay'> {
  const growth = lost / won;
  const extraSpendPerDay = (row.metrics.spend / days) * growth;
  const basis = `linear on these ${days} days, not a projection`;
  const spendText = `+${formatCurrency(extraSpendPerDay, currency)}/day`;
  if (row.metrics.conversions === null) {
    return { buys: shown(`${spendText} reaches them`), buysBasis: basis, extraSpendPerDay };
  }
  const extraResults = (row.metrics.conversions / days) * growth;
  return {
    buys: shown(`+0–${resultsText(extraResults)} results/day for ${spendText}`),
    buysBasis: basis,
    extraSpendPerDay,
  };
}

function buysOf(
  row: GoogleCampaignRow,
  card: BudgetLimitedCard | undefined,
  days: number,
  currency: string | null,
): Pick<MoneyLeftRow, 'buys' | 'buysBasis' | 'extraSpendPerDay'> {
  const won = campaignField(row, 'search_impression_share');
  const lost = campaignField(row, 'search_budget_lost_impression_share');
  const fallback =
    won.reason === null && lost.reason === null && won.value > 0
      ? lost.value === 0
        ? {
            buys: shown('Nothing lost to budget'),
            buysBasis: null,
            extraSpendPerDay: 0,
          }
        : linear(row, won.value, lost.value, days, currency)
      : {
          buys: missing(lost.reason ?? won.reason ?? 'Google reported no impression share won'),
          buysBasis: null,
          extraSpendPerDay: null,
        };
  const projection = card?.projection;
  if (!card || !projection || card.proposed_budget_per_day === null) return fallback;
  const low = resultsText(projection.results_per_day_low);
  const high = resultsText(projection.results_per_day_high);
  return {
    buys: shown(
      `At ${formatCurrency(card.proposed_budget_per_day, card.currency ?? currency)}/day: about ${low}–${high} ${card.result_label}/day (now ${resultsText(projection.results_per_day_now)})`,
    ),
    buysBasis: `Optimizer projection on ${projection.basis_days} days`,
    extraSpendPerDay: fallback.extraSpendPerDay,
  };
}

export function buildMoneyLeft(
  read: GoogleTopCampaigns,
  budgetCards: readonly BudgetLimitedCard[],
  currency: string | null,
): MoneyLeftModel {
  const days = windowDays(read.range);
  const cardByName = new Map(budgetCards.map((card) => [card.campaign_name, card]));
  let offSearch = 0;
  const rows: MoneyLeftRow[] = [];
  for (const row of read.rows) {
    if (OFF_SEARCH.has(row.labels?.channel_type ?? '')) {
      offSearch += 1;
      continue;
    }
    const budget = campaignField(row, 'budget_per_day');
    const lostToBudget = campaignField(row, 'search_budget_lost_impression_share');
    const lostToRank = campaignField(row, 'search_rank_lost_impression_share');
    rows.push({
      id: row.id,
      name: row.name,
      share: shareCell(campaignField(row, 'search_impression_share')),
      lostToBudget: shareCell(lostToBudget),
      lostToRank: shareCell(lostToRank),
      budgetPerDay:
        budget.reason === null
          ? shown(`${formatCurrency(budget.value, currency)}/day`)
          : missing(budget.reason),
      ...buysOf(row, cardByName.get(row.name), days, currency),
      rankOverBudget:
        lostToRank.reason === null &&
        lostToBudget.reason === null &&
        lostToRank.value > lostToBudget.value,
    });
  }
  rows.sort((a, b) => (b.extraSpendPerDay ?? -1) - (a.extraSpendPerDay ?? -1));
  const limited = rows.filter((row) => (row.extraSpendPerDay ?? 0) > 0);
  return {
    rows,
    offSearch,
    budgetLimited: limited.length,
    extraSpendPerDay: limited.reduce((sum, row) => sum + (row.extraSpendPerDay ?? 0), 0),
    rankLimited: rows.filter((row) => row.rankOverBudget).length,
  };
}
