'use client';

// "Money left on the table" (P6 view 2): impression share lost to budget and to rank, side by
// side, and what more budget would buy. Read-only; a raise goes through the Optimizer's G03 card.

import type { GoogleTopCampaigns, PlatformCard } from '@continuum/contracts';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { ChartEmpty } from '../../../charts/ChartStates';
import { formatCurrency } from '../../../format';
import { windowRangeLabel } from '../../platforms/googleAdsOverviewModel';
import { type GoogleReadTarget, type GoogleReadWindow, useGoogleCampaigns } from '../googleReads';
import { reasonsOf } from './cell';
import { type BudgetLimitedCard, buildMoneyLeft, type MoneyLeftRow } from './moneyLeftModel';
import {
  CellText,
  ReadGate,
  ReasonNotes,
  ScopeLine,
  usePendingGoogleCards,
  type ViewRead,
  viewRead,
} from './viewParts';

const COLUMNS: InsightColumn<MoneyLeftRow>[] = [
  {
    id: 'campaign',
    header: 'Campaign',
    cell: (row) => <span className="block min-w-36 font-medium">{row.name}</span>,
  },
  {
    id: 'share',
    header: 'Impr. share',
    align: 'right',
    cell: (row) => <CellText cell={row.share} />,
  },
  {
    id: 'budget-lost',
    header: 'Lost · budget',
    align: 'right',
    cell: (row) => <CellText cell={row.lostToBudget} />,
  },
  {
    id: 'rank-lost',
    header: 'Lost · rank',
    align: 'right',
    cell: (row) => <CellText cell={row.lostToRank} />,
  },
  {
    id: 'budget',
    header: 'Budget',
    align: 'right',
    cell: (row) => <CellText cell={row.budgetPerDay} />,
  },
  {
    id: 'buys',
    header: 'More budget buys',
    sortValue: (row) => row.extraSpendPerDay ?? -1,
    cell: (row) => (
      <span className="block min-w-44" data-testid="money-left-buys">
        <CellText cell={row.buys} />
        {row.buysBasis ? (
          <span className="block text-muted-foreground text-xs">{row.buysBasis}</span>
        ) : null}
      </span>
    ),
  },
];

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function MoneyLeftBody({
  read,
  cards,
  currency,
}: {
  read: GoogleTopCampaigns;
  cards: readonly PlatformCard[];
  currency: string | null;
}) {
  const model = buildMoneyLeft(
    read,
    cards.filter((card): card is BudgetLimitedCard => card.variant === 'google_budget_limited'),
    currency,
  );
  if (model.rows.length === 0 && model.offSearch === 0) {
    return <ChartEmpty message="No campaign spent in this window." />;
  }
  const reasons = reasonsOf(
    model.rows.flatMap((row) => [
      row.share,
      row.lostToBudget,
      row.lostToRank,
      row.budgetPerDay,
      row.buys,
    ]),
  );
  return (
    <div className="space-y-3">
      <ScopeLine>
        {windowRangeLabel(read.range.since, read.range.until)} · Google's impression share on Search
        inventory, per campaign
      </ScopeLine>
      <div className="space-y-1 text-sm" data-testid="money-left-headline">
        <p>
          {model.budgetLimited > 0 ? (
            <>
              {plural(model.budgetLimited, 'campaign loses', 'campaigns lose')} impressions to
              budget: up to{' '}
              <span className="font-semibold tabular-nums">
                +{formatCurrency(model.extraSpendPerDay, currency)}/day
              </span>{' '}
              would reach those auctions at today's price.
            </>
          ) : (
            <>No campaign is known to lose impressions to budget.</>
          )}
        </p>
        {model.rankLimited > 0 ? (
          <p className="text-muted-foreground">
            {plural(model.rankLimited, 'campaign loses', 'campaigns lose')} more to rank than to
            budget: budget won't buy those back; Quality Score and bids do.
          </p>
        ) : null}
      </div>
      {model.rows.length > 0 ? (
        <InsightDataTable columns={COLUMNS} getRowId={(row) => row.id} rows={model.rows} />
      ) : null}
      {model.offSearch > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="money-left-off-search">
          {plural(model.offSearch, 'campaign serves', 'campaigns serve')} off Search (Display,
          Video, Demand Gen): Google reports them no impression share.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        A raise goes through the Optimizer's budget card in Actions; this view changes nothing.
      </p>
      <ReasonNotes reasons={reasons} />
    </div>
  );
}

export function MoneyLeftOnTableView({
  read,
  cards,
  currency,
}: {
  read: ViewRead<GoogleTopCampaigns>;
  cards: readonly PlatformCard[];
  currency: string | null;
}) {
  return (
    <ReadGate read={read}>
      {(data) => <MoneyLeftBody cards={cards} currency={data.currency ?? currency} read={data} />}
    </ReadGate>
  );
}

export function MoneyLeftOnTable({
  currency,
  window,
  ...target
}: GoogleReadTarget & { currency: string | null; window: GoogleReadWindow }) {
  const query = useGoogleCampaigns({ ...target, window });
  const cards = usePendingGoogleCards(target.brandId);
  return <MoneyLeftOnTableView cards={cards} currency={currency} read={viewRead(query)} />;
}
