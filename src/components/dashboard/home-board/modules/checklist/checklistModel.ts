// The client checklist (recommend mode: the client applies the changes, as at Pink Elephant).
// Read-only: the pending recommendations of every portfolio where Continuum writes nothing (active,
// not observing, every platform's writes off), as items the team can export or send. The count is
// optimizer_list_portfolios' pending_recommendations over those portfolios; the items are each
// portfolio's pending recommendations from its performance read, with the words the Optimizer
// stored and the money per day only where the engine sized it.

import {
  PlatformCardSchema,
  type PortfolioListItem,
  type RecommendationRow,
} from '@continuum/contracts';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { platformWritable } from '@/components/paid-media/optimizer/platformWrites';
import { portfolioCurrency } from '@/components/paid-media/optimizer/portfolioCurrency';
import { recommendationLabel } from '@/components/paid-media/optimizer/reportModel';
import { platformCardTitle } from '@/components/paid-media/optimizer/sections/platformCards/platformCardModel';
import {
  impactPerDay,
  queueHeadlineLine,
} from '@/components/paid-media/optimizer/sections/recQueueModel';

export const CHECKLIST_MISSING =
  'No portfolio recommends changes for the client to apply yet — set one up in the Optimizer.';

export const EMAIL_NOTE =
  "Send by email sends the brand's Continuum Report to the people you pick. It is the existing report, not this list: attach the exported checklist to send every item.";

export type ChecklistPortfolio = {
  id: string;
  name: string;
  open: number;
  portfolio: PortfolioListItem;
};

export type ChecklistView =
  | { state: 'missing' }
  | { state: 'ready'; open: number; portfolios: ChecklistPortfolio[] };

/** Active, proposing changes, and no platform Continuum may write: the client applies them. */
export function clientApplies(portfolio: PortfolioListItem): boolean {
  if (portfolio.status !== 'active' || portfolio.apply_mode === 'observe') return false;
  const platforms = portfolio.platforms.length > 0 ? portfolio.platforms : ['meta'];
  return !platforms.some((platform) => platformWritable(portfolio, platform));
}

export function checklistViewOf(rows: readonly PortfolioListItem[]): ChecklistView {
  const portfolios = rows.filter(clientApplies).map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    open: portfolio.pending_recommendations,
    portfolio,
  }));
  if (portfolios.length === 0) return { state: 'missing' };
  portfolios.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  return {
    state: 'ready',
    open: portfolios.reduce((sum, portfolio) => sum + portfolio.open, 0),
    portfolios,
  };
}

export type ChecklistItem = {
  id: string;
  portfolioName: string;
  title: string;
  /** The Optimizer's reason, as stored (in the account's language). */
  detail: string | null;
  /** "$2,260 MXN/day" where the engine sized it; null otherwise. */
  impact: string | null;
  /** The day the recommendation was raised (YYYY-MM-DD). */
  raisedOn: string | null;
};

function titleOf(rec: RecommendationRow, currency: string | null): string {
  const card = PlatformCardSchema.safeParse(rec.seed?.platform_card);
  if (card.success) return platformCardTitle(card.data);
  const headline = queueHeadlineLine(rec, currency);
  const label = recommendationLabel(rec.kind).label;
  const subject = rec.adset_name ? ` · ${rec.adset_name}` : '';
  return headline ? `${label}: ${headline}` : `${label}${subject}`;
}

export function checklistItemsOf(
  recommendations: readonly RecommendationRow[],
  portfolio: PortfolioListItem,
  accountCurrency: string | null,
): ChecklistItem[] {
  const currency = portfolioCurrency(portfolio, accountCurrency);
  return recommendations
    .filter((rec) => rec.status === 'pending')
    .map((rec) => {
      const perDay = impactPerDay(rec);
      return {
        id: rec.id,
        portfolioName: portfolio.name,
        title: titleOf(rec, currency),
        detail: rec.reason,
        impact: perDay > 0 ? `${formatCurrency(perDay, currency)}/day` : null,
        raisedOn: rec.created_at ? rec.created_at.slice(0, 10) : null,
      };
    });
}

function csvCell(value: string | null): string {
  if (value == null) return '';
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180: CRLF rows, quoted where a cell carries a comma, a quote or a line break. */
export function checklistCsv(items: readonly ChecklistItem[]): string {
  const header = ['Portfolio', 'Item', 'Why', 'Impact per day', 'Raised'];
  const rows = items.map((item) =>
    [item.portfolioName, item.title, item.detail, item.impact, item.raisedOn]
      .map(csvCell)
      .join(','),
  );
  return `${[header.join(','), ...rows].join('\r\n')}\r\n`;
}

export function checklistFileName(brandName: string | null, day: Date): string {
  const slug = (brandName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const date = day.toISOString().slice(0, 10);
  return `${slug ? `${slug}-` : ''}client-checklist-${date}.csv`;
}
