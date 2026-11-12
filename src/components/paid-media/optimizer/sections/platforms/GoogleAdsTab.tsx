'use client';

import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import { useTranslations as useBetaTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useLocale, useTranslations } from 'next-intl';

// The Overview's Google tab (MP2, docs/optimizer-multiplatform/frontend.html §2): Google's own
// screen, read live for the brand's granted Google Ads customer. A sentence with figures, the
// window it covers, then four to six tiles by campaign type — each naming its entity, its figure
// and what the figure is compared with. No chart and no full-width bar. Google's
// recommendation cards and portfolio rows render under this read (OptimizerOverview's
// PlatformPortfolioSections), not here: this is Google's own read of the account.
//
// When the read cannot happen, the empty state names the reason and the one thing that fixes it.
// Under the read, in both modes: the parity sections (GoogleTabSections: the account read by
// campaign type, the campaign explorer, the bidding panel), then Google's own views.

import type { ReactNode } from 'react';
import { KpiTile } from '../../components/KpiTile';
import { figureProps, formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import { GoogleTabSections } from '../google/GoogleTabSections';
import type { GoogleReadWindow } from '../google/googleReads';
import { GoogleOwnViews } from '../google/views/GoogleOwnViews';
import { GoogleReadNotice } from './GoogleReadNotice';
import {
  type CampaignGroup,
  costPerConversion,
  costPerResult,
  figureWindowOf,
  formatConversions,
  type GoogleOverview,
  MAX_GROUP_TILES,
  MIN_TILES,
  NO_SINGLE_RESULT,
  percentAgainst,
  RESULT_WORDS,
  resultCountLabel,
  resultsApartLabel,
  windowRangeLabel,
} from './googleAdsOverviewModel';
import { PlatformReadingNote } from './PlatformReadingNote';
import { type GoogleAdsOverviewState, useGoogleAdsOverview } from './useGoogleAdsOverview';

/** Said once, where the window is named, when no source names the account's currency. */
const UNKNOWN_CURRENCY = 'currency not reported by Google';

function signedPct(pct: number, locale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
    signDisplay: pct > 0 ? 'always' : 'auto',
  }).format(pct / 100);
}
function percent(value: number, locale: UiLocale): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

/** "$33.07 MXN per lead · no sign-up yet": each result type's own cost, when counted apart. */
function costsApart(
  item: Pick<CampaignGroup, 'spend' | 'byResult'>,
  overview: GoogleOverview,
  currency: string | null,
  uiLocale: UiLocale = 'en',
  uiTranslate?: ScaleCopy,
): string {
  return overview.resultTypes
    .map((bucket) => {
      const cost = costPerResult(item.spend, item.byResult, bucket);
      if (uiTranslate)
        return uiTranslate('googleTabResultCost', {
          bucket,
          present: cost == null ? 'no' : 'yes',
          cost: cost == null ? '' : formatCurrency(cost, currency, uiLocale),
        });
      const word = RESULT_WORDS[bucket].one;
      return cost == null
        ? `no ${word} yet`
        : `${formatCurrency(cost, currency, uiLocale)} per ${word}`;
    })
    .join(' · ');
}

/** "18% below the account's 452 MXN" — the group's cost against Google's own average. */
function costComparison(
  group: CampaignGroup,
  overview: GoogleOverview,
  currency: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  if (uiTranslate) {
    const share = percent(group.sharePct, uiLocale);
    if (group.conversions == null)
      return overview.resultTypes.length > 0 && group.byResult
        ? uiTranslate('googleTabGroupShare', {
            results: costsApart(group, overview, currency, uiLocale, uiTranslate),
            share,
          })
        : uiTranslate('googleTabGroupNoResult', {
            spend: formatCurrency(group.spend, currency, uiLocale),
            share,
          });
    const cost = costPerConversion(group);
    if (cost == null)
      return uiTranslate('googleTabGroupNoConversion', {
        spend: formatCurrency(group.spend, currency, uiLocale),
        share,
      });
    const versus = percentAgainst(cost, overview.costPerConversion);
    return uiTranslate('googleTabGroupCost', {
      cost: formatCurrency(cost, currency, uiLocale),
      comparison:
        versus == null || overview.costPerConversion == null
          ? 'none'
          : versus === 0
            ? 'same'
            : versus < 0
              ? 'below'
              : 'above',
      accountCost: formatCurrency(overview.costPerConversion, currency, uiLocale),
      difference: percent(Math.abs(versus ?? 0), uiLocale),
      share,
    });
  }
  if (group.conversions == null) {
    if (overview.resultTypes.length > 0 && group.byResult) {
      return `${costsApart(group, overview, currency, uiLocale)} · ${group.sharePct}% of spend`;
    }
    return `${formatCurrency(group.spend, currency, uiLocale)} spent · ${group.sharePct}% of spend · ${NO_SINGLE_RESULT.toLowerCase()}`;
  }
  const cost = costPerConversion(group);
  if (cost == null) {
    return `${formatCurrency(group.spend, currency, uiLocale)} without a conversion · ${group.sharePct}% of spend`;
  }
  const versus = percentAgainst(cost, overview.costPerConversion);
  const against =
    versus == null || overview.costPerConversion == null
      ? ''
      : versus === 0
        ? ` · same as Google's ${formatCurrency(overview.costPerConversion, currency, uiLocale)}`
        : ` · ${Math.abs(versus)}% ${versus < 0 ? 'below' : 'above'} Google's ${formatCurrency(overview.costPerConversion, currency, uiLocale)}`;
  return `${formatCurrency(cost, currency, uiLocale)} each${against} · ${group.sharePct}% of spend`;
}

/** The group's count; with no single result each result type apart; a dash only when the read
 *  carried neither. */
function groupValue(
  group: CampaignGroup,
  overview: GoogleOverview,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  if (group.conversions != null)
    return uiTranslate
      ? uiTranslate('helper_6da454239496', {
          v0: formatConversions(group.conversions, uiLocale),
        })
      : `${formatConversions(group.conversions, uiLocale)} conv.`;
  return resultsApartLabel(group.byResult, overview.resultTypes, uiLocale, uiTranslate) ?? '—';
}

function groupLabel(group: CampaignGroup, byType: boolean, uiTranslate?: ScaleCopy): string {
  if (!byType) return group.label;
  if (uiTranslate)
    return uiTranslate('googleTabGroupLabel', {
      name: group.label,
      count: group.campaigns,
    });
  return `${group.label} · ${group.campaigns} ${group.campaigns === 1 ? 'campaign' : 'campaigns'}`;
}

function Headline({ overview, currency }: { overview: GoogleOverview; currency: string | null }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const window = figureWindowOf(overview.days);
  const change = percentAgainst(overview.spend, overview.priorSpend);
  const converting = overview.groups
    .filter((group) => group.conversions != null && group.conversions > 0)
    .slice(0, 3);
  const apart = overview.resultTypes.map((bucket) => {
    const count = overview.byResult?.[bucket] ?? 0;
    const cost = costPerResult(overview.spend, overview.byResult, bucket);
    return uiText('googleTabApartCost', {
      results: resultCountLabel(bucket, count, uiLocale, uiText),
      hasCost: cost == null ? 'no' : 'yes',
      cost: cost == null ? '' : formatCurrency(cost, currency, uiLocale),
    });
  });
  const ending = uiText('googleTabHeadlineEnding', {
    state: !overview.resultsDefined
      ? apart.length > 0
        ? 'apart'
        : 'undefined'
      : overview.spend > 0
        ? 'none'
        : 'empty',
    results: new Intl.ListFormat(uiLocale, {
      style: 'long',
      type: 'conjunction',
    }).format(apart),
  });
  return (
    <p
      className={`${typeScale.bodyLg} font-semibold leading-snug text-foreground`}
      data-testid="google-headline"
    >
      {uiText.rich('sentence_cf112fa790ba', {
        v0: () => (
          <span
            className="tabular-nums"
            {...figureProps('google.spend', overview.spend, currency, window)}
          >
            {formatCurrency(overview.spend, currency, uiLocale)}
          </span>
        ),
        v1:
          change != null
            ? uiText('googleTabHeadlineChange', {
                change: signedPct(change, uiLocale),
              })
            : '',
        v2: converting.length > 0 ? ': ' : ending,
        v3: () =>
          converting.map((group, index) => (
            <span key={group.key}>
              {uiText.rich('sentence_cefd87efeabb', {
                separator:
                  index > 0
                    ? index === converting.length - 1
                      ? uiText('list_final_separator')
                      : ', '
                    : '',
                group: group.label,
                conversions: () => (
                  <span
                    className="tabular-nums"
                    {...figureProps(
                      `google.group.${group.key}.conversions`,
                      group.conversions,
                      null,
                      window,
                      'count',
                    )}
                  >
                    {formatConversions(group.conversions ?? 0, uiLocale)}
                  </span>
                ),
                count: group.conversions ?? 0,
                cost: () => (
                  <span
                    className="tabular-nums"
                    {...figureProps(
                      `google.group.${group.key}.cost`,
                      costPerConversion(group),
                      currency,
                      window,
                    )}
                  >
                    {formatCurrency(costPerConversion(group), currency, uiLocale)}
                  </span>
                ),
              })}
            </span>
          )),
        v4: converting.length > 0 ? '.' : '',
      })}
    </p>
  );
}

function Tiles({ overview, currency }: { overview: GoogleOverview; currency: string | null }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const window = figureWindowOf(overview.days);
  const change = percentAgainst(overview.spend, overview.priorSpend);
  const groups = overview.groups.slice(0, MAX_GROUP_TILES);
  const showClicks = 2 + groups.length < MIN_TILES;
  return (
    <div
      className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6"
      data-testid="google-tiles"
    >
      <KpiTile
        figure={figureProps('google.tiles.spend', overview.spend, currency, window)}
        label={uiText('spend_85f3d55')}
        sub={
          change != null && overview.priorSpend != null
            ? uiText('googleTabPriorSpend', {
                change: signedPct(change, uiLocale),
                spend: formatCurrency(overview.priorSpend, currency, uiLocale),
              })
            : uiText('googleTabNoPrior')
        }
        testId="google-tile-spend"
        value={formatCurrency(overview.spend, currency, uiLocale)}
      />
      <KpiTile
        figure={figureProps(
          'google.tiles.conversions',
          overview.conversions,
          null,
          window,
          'count',
        )}
        label={uiText('conversions_236c262')}
        sub={
          overview.conversions == null
            ? overview.resultTypes.length > 0
              ? uiText('googleTabCountedApart', {
                  results: costsApart(overview, overview, currency, uiLocale, uiText),
                })
              : uiText('dashboardNoSingleResult')
            : overview.costPerConversion != null
              ? uiText('googleTabAttributedCost', {
                  cost: formatCurrency(overview.costPerConversion, currency, uiLocale),
                })
              : uiText('googleTabNoneRecorded')
        }
        testId="google-tile-conversions"
        value={
          overview.conversions == null
            ? (resultsApartLabel(overview.byResult, overview.resultTypes, uiLocale, uiText) ?? '—')
            : formatConversions(overview.conversions, uiLocale)
        }
      />
      {groups.map((group) => (
        <KpiTile
          figure={figureProps(
            `google.tiles.group.${group.key}`,
            group.conversions,
            null,
            window,
            'count',
          )}
          key={group.key}
          label={groupLabel(group, overview.byType, uiText)}
          sub={costComparison(group, overview, currency, uiText, uiLocale)}
          testId="google-tile-group"
          value={groupValue(group, overview, uiText, uiLocale)}
        />
      ))}
      {showClicks ? (
        <KpiTile
          figure={figureProps('google.tiles.clicks', overview.clicks, null, window, 'count')}
          label={uiText('clicks_921fc98')}
          sub={uiText('googleTabClicksShare', {
            percentage: formatDecimal(overview.ctr, 2, uiLocale) + '%',
          })}
          testId="google-tile-clicks"
          value={overview.clicks.toLocaleString(uiLocale)}
        />
      ) : null}
    </div>
  );
}

export function GoogleAdsTabView({
  state,
  readingNote = true,
}: {
  state: GoogleAdsOverviewState;
  /** False when the frame above already said what these figures are. */
  readingNote?: boolean;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  switch (state.status) {
    case 'loading':
      return (
        <p className="px-1 text-muted-foreground text-sm" data-testid="google-loading">
          {uiText('reading_google_ads_3c591ba')}
        </p>
      );
    case 'no-connection':
    case 'no-grant':
    case 'no-role':
    case 'no-access':
    case 'error':
      return <GoogleReadNotice state={state} />;
    case 'ready': {
      const { account, overview } = state;
      const currency = account.currency;
      return (
        <div className="space-y-3" data-testid="google-tab">
          <section className="space-y-1 px-1">
            <Headline currency={currency} overview={overview} />
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs"
              data-testid="google-subline"
            >
              <span>{windowRangeLabel(overview.since, overview.until, uiLocale)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {account.name ?? 'Google Ads'} ({account.account_id})
              </span>
              <span aria-hidden="true">·</span>
              <span>{uiText('attribution_what_google_reports_ea2682d')}</span>
              {currency ? null : (
                <>
                  <span aria-hidden="true">·</span>
                  <span data-testid="google-currency-unknown">
                    {uiText('googleTabUnknownCurrency')}
                  </span>
                </>
              )}
            </div>
          </section>
          <Tiles currency={currency} overview={overview} />
          {readingNote ? <PlatformReadingNote platform="google_ads" where="above" /> : null}
        </div>
      );
    }
  }
}

/**
 * The Google tab under the multi-platform frame: the producer already said what Google spent
 * and bought, so this adds only what it does not hold — the split by campaign type, as the
 * edge reads it from Google. Silent when Google cannot be read; the frame above says why.
 */
export function GoogleCampaignTypeBreakdown({ state }: { state: GoogleAdsOverviewState }) {
  const betaUiText = useBetaTranslations('scale');

  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  if (state.status === 'loading') {
    return (
      <p className="px-1 text-muted-foreground text-xs" data-testid="google-breakdown-loading">
        {uiText('reading_google_s_campaign_types_db6ef4a')}
      </p>
    );
  }
  if (state.status === 'error' || state.status === 'no-role' || state.status === 'no-access') {
    const why =
      state.status === 'error'
        ? state.message
        : state.status === 'no-role'
          ? betaUiText('beta_c118f4113383')
          : betaUiText('beta_6f1db856e8d7', {
              value0: String(state.account.name ?? state.account.account_id),
            });
    return (
      <p className="px-1 text-muted-foreground text-xs" data-testid="google-breakdown-error">
        {betaUiText('beta_a87ad3878d99')} {why}
      </p>
    );
  }
  if (state.status !== 'ready') return null;
  const { account, overview } = state;
  const window = figureWindowOf(overview.days);
  const groups = overview.groups.slice(0, MAX_GROUP_TILES);
  if (groups.length === 0) return null;
  return (
    <section className="space-y-2" data-testid="google-breakdown">
      <p className={`${typeScale.label} px-1 font-semibold text-muted-foreground`}>
        {uiText.rich('sentence_1675e7ff58cf', {
          v0: windowRangeLabel(overview.since, overview.until, uiLocale),
          v1: account.currency ? '' : ` · ${uiText('googleTabUnknownCurrency')}`,
        })}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {groups.map((group) => (
          <KpiTile
            figure={figureProps(
              `google.tiles.group.${group.key}`,
              group.conversions,
              null,
              window,
              'count',
            )}
            key={group.key}
            label={groupLabel(group, overview.byType, uiText)}
            sub={costComparison(group, overview, account.currency, uiText, uiLocale)}
            testId="google-tile-group"
            value={groupValue(group, overview, uiText, uiLocale)}
          />
        ))}
      </div>
    </section>
  );
}

export function GoogleAdsTab({
  brandId,
  mode = 'full',
  window = null,
  readingNote = true,
  children,
}: {
  brandId: string;
  /** 'breakdown' when the multi-platform frame already leads the tab. */
  mode?: 'full' | 'breakdown';
  /** The producer's window, so this read states the same dates as the frame above it; null
   *  when it has none; 'pending' while it is still answering (nothing is read yet). */
  window?: GoogleReadWindow | null | 'pending';
  readingNote?: boolean;
  /** What sits under the read and Google's own views; held until the read settles, so the
   *  read never pushes it. */
  children?: ReactNode;
}) {
  const state = useGoogleAdsOverview(brandId, window);
  return (
    <>
      {mode === 'breakdown' ? (
        <GoogleCampaignTypeBreakdown state={state} />
      ) : (
        <GoogleAdsTabView readingNote={readingNote} state={state} />
      )}
      {state.status === 'ready' ? (
        <>
          <GoogleTabSections
            brandId={brandId}
            currency={state.account.currency}
            customerId={state.account.account_id}
            lastCompleteDay={window && window !== 'pending' ? window.until : null}
            resultBucket={state.resultBucket}
          />
          <GoogleOwnViews
            brandId={brandId}
            currency={state.account.currency}
            customerId={state.account.account_id}
            resultBucket={state.resultBucket}
            window={{
              since: state.overview.since,
              until: state.overview.until,
            }}
          />
        </>
      ) : null}
      {state.status === 'loading' ? null : children}
    </>
  );
}
