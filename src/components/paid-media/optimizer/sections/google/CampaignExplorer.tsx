'use client';

import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { googleCopy } from './googlePresentation';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useLocale, useTranslations } from 'next-intl';

// Idea 3, the campaign explorer: every campaign that spent, as a scatter of spend against cost
// per conversion with the portfolio CPA goal as a dashed line, and the same campaigns as a
// table (the chart's data, reachable). A campaign's name opens its detail. Read-only: a change
// is made through the recommendation cards, never from here.

import { currencyColumnSuffix, formatCurrency, formatCurrencyInColumn } from '../../format';
import { percentLabel } from '../platformCards/platformCardModel';
import {
  formatConversions,
  NO_SINGLE_RESULT,
  ownResultsLabel,
} from '../platforms/googleAdsOverviewModel';
import { type CampaignView, type Figure, sharedGoal } from './campaignExplorerModel';
import {
  BandText,
  FigureText,
  GoogleSection,
  Missing,
  ReasonNotes,
  ScrollTable,
  TD,
  TD_NUM,
  TH,
  TH_NUM,
} from './GoogleSection';

/** Standard §4: at most ~25 rows in a table; the rest are named, not dropped silently. */
const MAX_ROWS = 25;

const STATUS_WORDS: Readonly<Record<string, string>> = {
  ENABLED: 'Active',
  PAUSED: 'Paused',
  REMOVED: 'Removed',
};

export function statusWords(status: Figure<string>, uiTranslate?: ScaleCopy): string | null {
  return status.value
    ? STATUS_WORDS[status.value]
      ? googleCopy(STATUS_WORDS[status.value], uiTranslate)
      : uiTranslate
        ? uiTranslate('googleControlCode', { code: status.value })
        : status.value.toLowerCase()
    : null;
}

const W = 320;
const H = 160;
const PAD = { left: 8, right: 8, top: 8, bottom: 8 };

const DOT_TONE: Record<string, string> = {
  over: 'fill-destructive',
  under: 'fill-success',
  on_goal: 'fill-success',
};

function Scatter({ rows, currency }: { rows: readonly CampaignView[]; currency: string | null }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const points = rows.filter((row) => row.cost != null);
  if (points.length === 0) return null;
  const goal = sharedGoal(rows)?.goal ?? null;
  const maxX = Math.max(...points.map((row) => row.spend));
  const maxY = Math.max(...points.map((row) => row.cost ?? 0), goal ?? 0) * 1.1;
  const x = (value: number) => PAD.left + (value / (maxX || 1)) * (W - PAD.left - PAD.right);
  const y = (value: number) => H - PAD.bottom - (value / (maxY || 1)) * (H - PAD.top - PAD.bottom);
  return (
    <figure className="space-y-1">
      <svg
        aria-label={uiText('spend_against_cost_per_conversion_one_dot_per_1a2e53d')}
        className="h-40 w-full max-w-xl"
        data-testid="google-explorer-scatter"
        role="img"
        viewBox={`0 0 ${W} ${H}`}
      >
        <line
          className="stroke-border"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
        />
        {goal != null ? (
          <line
            className="stroke-muted-foreground"
            data-testid="google-explorer-goal-line"
            strokeDasharray="4 3"
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(goal)}
            y2={y(goal)}
          />
        ) : null}
        {points.map((row) => (
          <circle
            className={DOT_TONE[row.band.kind] ?? 'fill-muted-foreground'}
            cx={x(row.spend)}
            cy={y(row.cost ?? 0)}
            data-testid="google-explorer-dot"
            key={row.id}
            r={4}
          >
            <title>
              {uiText('template_c8785ed70bdc', {
                v0: row.name,
                v1: formatCurrency(row.spend, currency, uiLocale),
                v2: formatCurrency(row.cost, currency, uiLocale),
              })}
            </title>
          </circle>
        ))}
      </svg>
      <figcaption className="text-muted-foreground text-xs">
        {uiText.rich('sentence_8e5fbe101662', {
          hasGoal: goal != null ? 'yes' : 'no',
          goal: goal != null ? formatCurrency(goal, currency, uiLocale) : '',
        })}
      </figcaption>
    </figure>
  );
}

/** "3 of 7 campaigns pay over their goal, with 62% of the spend": the pattern the scatter shows. */
export function explorerSummary(
  rows: readonly CampaignView[],
  currency: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  const spending = rows.filter((row) => row.spend > 0);
  if (spending.length === 0)
    return uiTranslate
      ? uiTranslate('no_campaign_spent_in_the_window_c21127f')
      : 'No campaign spent in the window.';
  const total = spending.reduce((sum, row) => sum + row.spend, 0);
  const over = spending.filter((row) => row.band.kind === 'over');
  const held = spending.filter((row) => row.goal);
  const noun = spending.length === 1 ? 'campaign' : 'campaigns';
  if (held.length === 0)
    return uiTranslate
      ? uiTranslate('googleExplorerNoPortfolio', {
          count: spending.length,
          spend: formatCurrency(total, currency, uiLocale),
        })
      : `${spending.length} ${noun} spent ${formatCurrency(total, currency, uiLocale)}; no portfolio holds them, so none has a target.`;
  if (over.length === 0)
    return uiTranslate
      ? uiTranslate('googleExplorerOnGoal', {
          count: spending.length,
          spend: formatCurrency(total, currency, uiLocale),
        })
      : `${spending.length} ${noun} spent ${formatCurrency(total, currency, uiLocale)}; none pays over its goal.`;
  const overSpend = over.reduce((sum, row) => sum + row.spend, 0);
  const share = Math.round((overSpend / total) * 100);
  return uiTranslate
    ? uiTranslate('googleExplorerOverGoal', {
        over: over.length,
        total: spending.length,
        share: percentLabel(share / 100, uiLocale),
        spend: formatCurrency(total, currency, uiLocale),
      })
    : `${over.length} of ${spending.length} ${noun} pay over their goal, with ${share}% of the ${formatCurrency(total, currency, uiLocale)} spent.`;
}

const share = (value: number, locale: UiLocale = 'en') => percentLabel(value, locale);

export const EXPLORER_TITLE = 'Campaigns';

export function CampaignExplorer({
  rows,
  currency,
  onOpenCampaign,
}: {
  rows: readonly CampaignView[];
  currency: string | null;
  onOpenCampaign: (campaignId: string) => void;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const shown = rows.slice(0, MAX_ROWS);
  const code = currencyColumnSuffix(currency);
  return (
    <GoogleSection
      showLabel={googleCopy('Show the campaigns', uiText)}
      summary={explorerSummary(rows, currency, uiText, uiLocale)}
      testId="google-campaign-explorer"
      title={googleCopy(EXPLORER_TITLE, uiText)}
    >
      {rows.length === 0 ? null : (
        <>
          <Scatter currency={currency} rows={rows} />
          <ScrollTable testId="google-explorer-table">
            <thead>
              <tr>
                <th className={TH} scope="col">
                  {uiText('campaign_268286d')}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText('helper_ffca96014e32', { v0: code })}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText('conv_d3875d6')}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText.rich('sentence_1376b7fc3ded', { v0: code })}
                </th>
                <th className={TH} scope="col">
                  {uiText('vs_goal_597a6ce')}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText('lost_to_budget_d856931')}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText('lost_to_rank_3029ccc')}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr
                  className="border-border/60 border-t"
                  data-campaign-id={row.id}
                  data-testid="google-explorer-row"
                  key={row.id}
                >
                  <td className={TD}>
                    <button
                      className="hit-area text-left font-medium text-primary-ink hover:underline"
                      onClick={() => onOpenCampaign(row.id)}
                      type="button"
                    >
                      {row.name}
                    </button>
                    <span className="block text-muted-foreground text-xs">
                      {row.typeLabel ? `${row.typeLabel} · ` : ''}
                      {statusWords(row.status, uiText) ?? (
                        <Missing reason={row.status.reason ?? 'Google did not report it'} />
                      )}
                    </span>
                  </td>
                  <td className={TD_NUM}>
                    {formatCurrencyInColumn(row.spend, currency, uiLocale)}
                  </td>
                  <td className={TD_NUM}>
                    {row.conversions == null
                      ? (ownResultsLabel(row.byResult, uiLocale, uiText) ?? (
                          <Missing reason={NO_SINGLE_RESULT} />
                        ))
                      : formatConversions(row.conversions, uiLocale)}
                  </td>
                  <td className={TD_NUM}>
                    {row.cost != null ? (
                      formatCurrencyInColumn(row.cost, currency, uiLocale)
                    ) : (
                      <Missing
                        reason={
                          row.conversions == null
                            ? NO_SINGLE_RESULT
                            : 'No conversion in the window to price'
                        }
                      />
                    )}
                  </td>
                  <td className={TD}>
                    <BandText band={row.band} />
                  </td>
                  <td className={TD_NUM}>
                    <FigureText
                      figure={row.budgetLost}
                      format={(value) => share(value, uiLocale)}
                    />
                  </td>
                  <td className={TD_NUM}>
                    <FigureText figure={row.rankLost} format={(value) => share(value, uiLocale)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
          {rows.length > shown.length ? (
            <p className="text-muted-foreground text-xs" data-testid="google-explorer-truncated">
              {uiText.rich('sentence_a32c06d9194c', { count: rows.length - shown.length })}
            </p>
          ) : null}
          <ReasonNotes
            reasons={shown.flatMap((row) => [
              row.budgetLost.reason,
              row.rankLost.reason,
              row.band.label === '—' ? row.band.reason : null,
            ])}
          />
        </>
      )}
    </GoogleSection>
  );
}
