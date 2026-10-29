'use client';

// Idea 1, the account read by campaign type: under the tab's headline, each type's cost per
// conversion against the portfolio CPA goal its campaigns are held to. The goal is the
// portfolio's, never Google's target CPA; a type no portfolio holds reads "no target". With no
// single result (no portfolio goal, campaigns' goals naming several), each result type has its
// own count and cost columns instead of one conversions column of "—".

import type { GoogleResultBucket } from '@continuum/contracts';
import { currencyColumnSuffix, formatCurrency, formatCurrencyInColumn } from '../../format';
import {
  costPerResult,
  formatConversions,
  NO_SINGLE_RESULT,
  RESULT_WORDS,
  resultTypesOf,
} from '../platforms/googleAdsOverviewModel';
import { type Totals, type TypeRow, totalsOf } from './campaignExplorerModel';
import {
  BandText,
  GoogleSection,
  Missing,
  ReasonNotes,
  ScrollTable,
  TD,
  TD_NUM,
  TH,
  TH_NUM,
} from './GoogleSection';

function Cost({
  value,
  conversions,
  currency,
}: {
  value: number | null;
  conversions: number | null;
  currency: string | null;
}) {
  if (conversions == null) return <Missing reason={NO_SINGLE_RESULT} />;
  if (value == null) return <Missing reason="No conversion in the window to price" />;
  return <>{formatCurrencyInColumn(value, currency)}</>;
}

/** Each result type's count and cost, for a row (or the total) when they are counted apart. */
function ApartCells({
  row,
  types,
  currency,
}: {
  row: Pick<Totals, 'spend' | 'byResult'>;
  types: readonly GoogleResultBucket[];
  currency: string | null;
}) {
  return types.map((bucket) => {
    const cost = costPerResult(row.spend, row.byResult, bucket);
    return [
      <td className={TD_NUM} key={`${bucket}:count`}>
        {formatConversions(row.byResult?.[bucket] ?? 0)}
      </td>,
      <td className={TD_NUM} key={`${bucket}:cost`}>
        {cost == null ? (
          <Missing reason={`No ${RESULT_WORDS[bucket].one} in the window to price`} />
        ) : (
          formatCurrencyInColumn(cost, currency)
        )}
      </td>,
    ];
  });
}

function summaryOf(
  rows: readonly TypeRow[],
  currency: string | null,
  apart: readonly GoogleResultBucket[],
): string {
  if (rows.length === 0) return 'No campaign spent in the window.';
  return rows
    .slice(0, 3)
    .map((row) => {
      const cost =
        row.conversions == null
          ? apart.length > 0
            ? apart
                .map((bucket) => {
                  const each = costPerResult(row.spend, row.byResult, bucket);
                  return each == null
                    ? `no ${RESULT_WORDS[bucket].one} yet`
                    : `${formatCurrency(each, currency)} per ${RESULT_WORDS[bucket].one}`;
                })
                .join(', ')
            : 'conversions not counted'
          : row.cost == null
            ? 'no conversion yet'
            : `${formatCurrency(row.cost, currency)} per conversion`;
      const band = row.band.label === '—' ? '' : ` · ${row.band.label}`;
      return `${row.label}: ${cost}${band}`;
    })
    .join('; ')
    .concat('.');
}

export const ACCOUNT_READ_TITLE = 'Cost per conversion by campaign type';

export function AccountReadByType({
  rows,
  currency,
}: {
  rows: readonly TypeRow[];
  currency: string | null;
}) {
  const totals: Totals = totalsOf(rows);
  const code = currencyColumnSuffix(currency);
  // Counted apart only when there is no single result and every campaign carries the counts.
  const apart = totals.conversions == null ? resultTypesOf(rows) : [];
  return (
    <GoogleSection
      showLabel="Show the table"
      summary={summaryOf(rows, currency, apart)}
      testId="google-account-by-type"
      title={ACCOUNT_READ_TITLE}
    >
      {rows.length === 0 ? null : (
        <>
          <ScrollTable testId="google-by-type-table">
            <thead>
              <tr>
                <th className={TH} scope="col">
                  Campaign type
                </th>
                <th className={TH_NUM} scope="col">
                  Spend{code}
                </th>
                <th className={TH_NUM} scope="col">
                  Share
                </th>
                {apart.length > 0 ? (
                  apart.map((bucket) => [
                    <th className={TH_NUM} key={`${bucket}:count`} scope="col">
                      {RESULT_WORDS[bucket].column}
                    </th>,
                    <th className={TH_NUM} key={`${bucket}:cost`} scope="col">
                      Cost / {RESULT_WORDS[bucket].one}
                      {code}
                    </th>,
                  ])
                ) : (
                  <>
                    <th className={TH_NUM} scope="col">
                      Conversions
                    </th>
                    <th className={TH_NUM} scope="col">
                      Cost / conv.{code}
                    </th>
                  </>
                )}
                <th className={TH_NUM} scope="col">
                  Goal{code}
                </th>
                <th className={TH} scope="col">
                  vs goal
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className="border-border/60 border-t"
                  data-testid="google-by-type-row"
                  key={row.key}
                >
                  <td className={TD}>
                    {row.label}
                    <span className="block text-muted-foreground text-xs">
                      {row.campaigns} {row.campaigns === 1 ? 'campaign' : 'campaigns'}
                    </span>
                  </td>
                  <td className={TD_NUM}>{formatCurrencyInColumn(row.spend, currency)}</td>
                  <td className={TD_NUM}>{row.sharePct}%</td>
                  {apart.length > 0 ? (
                    <ApartCells currency={currency} row={row} types={apart} />
                  ) : (
                    <>
                      <td className={TD_NUM}>
                        {row.conversions == null ? (
                          <Missing reason={NO_SINGLE_RESULT} />
                        ) : (
                          formatConversions(row.conversions)
                        )}
                      </td>
                      <td className={TD_NUM}>
                        <Cost conversions={row.conversions} currency={currency} value={row.cost} />
                      </td>
                    </>
                  )}
                  <td className={TD_NUM}>
                    {row.band.goal != null ? (
                      formatCurrencyInColumn(row.band.goal, currency)
                    ) : (
                      <Missing reason={row.band.reason ?? 'No goal'} />
                    )}
                  </td>
                  <td className={TD}>
                    <BandText band={row.band} />
                  </td>
                </tr>
              ))}
              <tr
                className="border-border border-t font-semibold"
                data-testid="google-by-type-total"
              >
                <td className={TD}>All campaigns</td>
                <td className={TD_NUM}>{formatCurrencyInColumn(totals.spend, currency)}</td>
                <td className={TD_NUM}>100%</td>
                {apart.length > 0 ? (
                  <ApartCells currency={currency} row={totals} types={apart} />
                ) : (
                  <>
                    <td className={TD_NUM}>
                      {totals.conversions == null ? (
                        <Missing reason={NO_SINGLE_RESULT} />
                      ) : (
                        formatConversions(totals.conversions)
                      )}
                    </td>
                    <td className={TD_NUM}>
                      <Cost
                        conversions={totals.conversions}
                        currency={currency}
                        value={totals.cost}
                      />
                    </td>
                  </>
                )}
                <td className={TD_NUM} />
                <td className={TD} />
              </tr>
            </tbody>
          </ScrollTable>
          <ReasonNotes
            reasons={rows.map((row) => (row.band.label === '—' ? row.band.reason : null))}
          />
        </>
      )}
    </GoogleSection>
  );
}
