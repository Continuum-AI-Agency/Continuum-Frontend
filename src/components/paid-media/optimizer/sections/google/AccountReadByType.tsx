'use client';

import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { googleCopy } from './googlePresentation';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useLocale, useTranslations } from 'next-intl';

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
  const uiLocale = useLocale();
  if (conversions == null) return <Missing reason={NO_SINGLE_RESULT} />;
  if (value == null) return <Missing reason="No conversion in the window to price" />;
  return <>{formatCurrencyInColumn(value, currency, uiLocale)}</>;
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  return types.map((bucket) => {
    const cost = costPerResult(row.spend, row.byResult, bucket);
    return [
      <td className={TD_NUM} key={`${bucket}:count`}>
        {formatConversions(row.byResult?.[bucket] ?? 0, uiLocale)}
      </td>,
      <td className={TD_NUM} key={`${bucket}:cost`}>
        {cost == null ? (
          <Missing
            reason={uiText('googleResultNoPrice', {
              result: uiText('googleResultLabel', { bucket }),
            })}
          />
        ) : (
          formatCurrencyInColumn(cost, currency, uiLocale)
        )}
      </td>,
    ];
  });
}

function summaryOf(
  rows: readonly TypeRow[],
  currency: string | null,
  apart: readonly GoogleResultBucket[],
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  if (rows.length === 0)
    return uiTranslate
      ? uiTranslate('no_campaign_spent_in_the_window_c21127f')
      : 'No campaign spent in the window.';
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
                    ? uiTranslate
                      ? uiTranslate('googleResultNoneYet', {
                          result: uiTranslate('googleResultLabel', { bucket }),
                        })
                      : `no ${RESULT_WORDS[bucket].one} yet`
                    : uiTranslate
                      ? uiTranslate('googleCostPerResult', {
                          cost: formatCurrency(each, currency, uiLocale),
                          result: uiTranslate('googleResultLabel', { bucket }),
                        })
                      : `${formatCurrency(each, currency, uiLocale)} per ${RESULT_WORDS[bucket].one}`;
                })
                .join(', ')
            : googleCopy('conversions not counted', uiTranslate)
          : row.cost == null
            ? googleCopy('no conversion yet', uiTranslate)
            : uiTranslate
              ? uiTranslate('googleCostPerConversion', {
                  cost: formatCurrency(row.cost, currency, uiLocale),
                })
              : `${formatCurrency(row.cost, currency, uiLocale)} per conversion`;
      const band = row.band.label === '—' ? '' : ` · ${row.band.label}`;
      return `${googleCopy(row.label, uiTranslate)}: ${cost}${band}`;
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const totals: Totals = totalsOf(rows);
  const code = currencyColumnSuffix(currency);
  // Counted apart only when there is no single result and every campaign carries the counts.
  const apart = totals.conversions == null ? resultTypesOf(rows) : [];
  return (
    <GoogleSection
      showLabel={googleCopy('Show the table', uiText)}
      summary={summaryOf(rows, currency, apart, uiText, uiLocale)}
      testId="google-account-by-type"
      title={googleCopy(ACCOUNT_READ_TITLE, uiText)}
    >
      {rows.length === 0 ? null : (
        <>
          <ScrollTable testId="google-by-type-table">
            <thead>
              <tr>
                <th className={TH} scope="col">
                  {uiText('campaign_type_37d390b')}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText('helper_ffca96014e32', { v0: code })}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText('share_29887a5')}
                </th>
                {apart.length > 0 ? (
                  apart.map((bucket) => [
                    <th className={TH_NUM} key={`${bucket}:count`} scope="col">
                      {uiText('googleResultColumn', { bucket })}
                    </th>,
                    <th className={TH_NUM} key={`${bucket}:cost`} scope="col">
                      {uiText.rich('sentence_27f06c90c1ce', {
                        v0: uiText('googleResultLabel', { bucket }),
                        v1: code,
                      })}
                    </th>,
                  ])
                ) : (
                  <>
                    <th className={TH_NUM} scope="col">
                      {uiText('conversions_236c262')}
                    </th>
                    <th className={TH_NUM} scope="col">
                      {uiText.rich('sentence_1376b7fc3ded', { v0: code })}
                    </th>
                  </>
                )}
                <th className={TH_NUM} scope="col">
                  {uiText.rich('sentence_dea6237d1a01', { v0: code })}
                </th>
                <th className={TH} scope="col">
                  {uiText('vs_goal_597a6ce')}
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
                    {googleCopy(row.label, uiText)}
                    <span className="block text-muted-foreground text-xs">
                      {uiText('campaign_count', { count: row.campaigns })}
                    </span>
                  </td>
                  <td className={TD_NUM}>
                    {formatCurrencyInColumn(row.spend, currency, uiLocale)}
                  </td>
                  <td className={TD_NUM}>{row.sharePct}%</td>
                  {apart.length > 0 ? (
                    <ApartCells currency={currency} row={row} types={apart} />
                  ) : (
                    <>
                      <td className={TD_NUM}>
                        {row.conversions == null ? (
                          <Missing reason={NO_SINGLE_RESULT} />
                        ) : (
                          formatConversions(row.conversions, uiLocale)
                        )}
                      </td>
                      <td className={TD_NUM}>
                        <Cost conversions={row.conversions} currency={currency} value={row.cost} />
                      </td>
                    </>
                  )}
                  <td className={TD_NUM}>
                    {row.band.goal != null ? (
                      formatCurrencyInColumn(row.band.goal, currency, uiLocale)
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
                <td className={TD}>{uiText('all_campaigns_ffdb9c4')}</td>
                <td className={TD_NUM}>
                  {formatCurrencyInColumn(totals.spend, currency, uiLocale)}
                </td>
                <td className={TD_NUM}>100%</td>
                {apart.length > 0 ? (
                  <ApartCells currency={currency} row={totals} types={apart} />
                ) : (
                  <>
                    <td className={TD_NUM}>
                      {totals.conversions == null ? (
                        <Missing reason={NO_SINGLE_RESULT} />
                      ) : (
                        formatConversions(totals.conversions, uiLocale)
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
