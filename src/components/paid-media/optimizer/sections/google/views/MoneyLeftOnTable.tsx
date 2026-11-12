'use client';

import { useLocale, useTranslations } from 'next-intl';

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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const COLUMNS: InsightColumn<MoneyLeftRow>[] = [
    {
      id: 'campaign',
      header: uiText('campaign_268286d'),
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
      header: uiText('budget_1c6225e'),
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

  const model = buildMoneyLeft(
    read,
    cards.filter((card): card is BudgetLimitedCard => card.variant === 'google_budget_limited'),
    currency,
    uiText,
    uiLocale,
  );
  if (model.rows.length === 0 && model.offSearch === 0) {
    return <ChartEmpty message={uiText('no_campaign_spent_in_this_window_952d69e')} />;
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
        {uiText.rich('sentence_67f2f545e743', {
          v0: windowRangeLabel(read.range.since, read.range.until, uiLocale),
        })}
      </ScopeLine>
      <div className="space-y-1 text-sm" data-testid="money-left-headline">
        <p>
          {model.budgetLimited > 0 ? (
            <>
              {uiText.rich('sentence_64bffde097a9', {
                count: model.budgetLimited,
                amount: () => (
                  <span className="font-semibold tabular-nums">
                    {uiText.rich('sentence_e456c61af445', {
                      v0: formatCurrency(model.extraSpendPerDay, currency, uiLocale),
                    })}
                  </span>
                ),
              })}
            </>
          ) : (
            <>{uiText('no_campaign_is_known_to_lose_impressions_to_b_7f79277')}</>
          )}
        </p>
        {model.rankLimited > 0 ? (
          <p className="text-muted-foreground">
            {uiText.rich('sentence_7fa57110464e', { count: model.rankLimited })}
          </p>
        ) : null}
      </div>
      {model.rows.length > 0 ? (
        <InsightDataTable columns={COLUMNS} getRowId={(row) => row.id} rows={model.rows} />
      ) : null}
      {model.offSearch > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="money-left-off-search">
          {uiText.rich('sentence_cd8c29456987', { count: model.offSearch })}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {uiText('a_raise_goes_through_the_optimizer_s_budget_c_a1ad5b6')}
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
