'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

// The Overview's TikTok tab (frontend.html §7, feature 06). When the multi-platform producer
// names a connected TikTok advertiser, the tab reads that advertiser's `tiktok_snapshots` — the
// entity read the Optimizer's ingest makes — and shows its spend, its results, what each result
// cost and the ad groups that spent most, over the last 7 days. With no advertiser it keeps the
// "not connected" state and shows no numbers: a mock figure here would be the first thing a
// client quotes back.

import { cn } from '@/lib/utils';
import { KpiTile } from '../../components/KpiTile';
import { figureProps, formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import { capitalise, formatResults, kindWords } from './accountPlatformMetricsModel';
import { windowRangeLabel } from './googleAdsOverviewModel';
import { PlatformChip } from './PlatformChip';
import { PlatformConnectLink } from './PlatformConnectLink';
import {
  shortAdvertiserId,
  type TikTokAdGroupRow,
  type TikTokKind,
  type TikTokOverview,
} from './tiktokAdsOverviewModel';
import { type TikTokAdsOverviewState, useTikTokAdsOverview } from './useTikTokAdsOverview';

const WINDOW = 'd7';

export function TikTokAdsEmpty() {
  const uiText = useTranslations('scale');
  return (
    <section
      className="space-y-2 rounded-lg border border-border/70 border-dashed bg-card px-4 py-5"
      data-testid="tiktok-empty"
    >
      <div className="flex flex-wrap items-center gap-2">
        <PlatformChip platform="tiktok_ads" />
        <p className={cn(typeScale.body, 'font-semibold text-foreground')}>
          {uiText('tiktok_ads_isn_t_connected_yet_4d90346')}
        </p>
      </div>
      <p className="text-muted-foreground text-sm">
        {uiText('once_a_tiktok_ads_advertiser_is_connected_and_b06e6cc')}
      </p>
      <PlatformConnectLink platform="tiktok_ads" />
    </section>
  );
}

function costLine(
  kind: TikTokKind,
  currency: string,
  uiLocale: UiLocale = 'en',
  uiTranslate?: ReturnType<typeof useTranslations<'scale'>>,
): string {
  const words = kindWords(kind.kind, uiTranslate);
  return kind.costPerResult == null
    ? uiTranslate
      ? uiTranslate('platformSpentNoKind', {
          spend: formatCurrency(kind.spend, currency, uiLocale),
          kind: words.many,
        })
      : `${formatCurrency(kind.spend, currency, uiLocale)} spent, no ${words.many}`
    : uiTranslate
      ? uiTranslate('platformCostPerKind', {
          cost: formatCurrency(kind.costPerResult, currency, uiLocale),
          kind: words.one,
        })
      : `${formatCurrency(kind.costPerResult, currency, uiLocale)} per ${words.one}`;
}

function Headline({ overview, currency }: { overview: TikTokOverview; currency: string }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const kinds = overview.kinds;
  return (
    <p
      className={`${typeScale.bodyLg} font-semibold leading-snug text-foreground`}
      data-testid="tiktok-headline"
    >
      {uiText.rich('sentence_edb39d5bac02', {
        v0: () => (
          <span
            className="tabular-nums"
            {...figureProps('tiktok.spend', overview.spend, currency, WINDOW)}
          >
            {formatCurrency(overview.spend, currency, uiLocale)}
          </span>
        ),
        v1: kinds.length > 0 ? ': ' : '.',
        v2: () =>
          kinds.map((kind, index) => (
            <span key={kind.kind}>
              {index > 0
                ? index === kinds.length - 1
                  ? uiText('list_final_separator')
                  : ', '
                : ''}
              <span
                className="tabular-nums"
                {...figureProps(
                  `tiktok.kind.${kind.kind}.results`,
                  kind.results,
                  null,
                  WINDOW,
                  'count',
                )}
              >
                {formatResults(kind.results, uiLocale)}
              </span>{' '}
              {kindWords(kind.kind, uiText).many}
              {kind.costPerResult != null ? (
                <>
                  {' '}
                  {uiText.rich('sentence_596263fd6177', {
                    v0: () => (
                      <span
                        className="tabular-nums"
                        {...figureProps(
                          `tiktok.kind.${kind.kind}.cost`,
                          kind.costPerResult,
                          currency,
                          WINDOW,
                        )}
                      >
                        {formatCurrency(kind.costPerResult, currency, uiLocale)}
                      </span>
                    ),
                  })}
                </>
              ) : null}
            </span>
          )),
        v3: kinds.length > 0 ? '.' : '',
      })}
    </p>
  );
}

function Tiles({ overview, currency }: { overview: TikTokOverview; currency: string }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const [lead, ...rest] = overview.kinds;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="tiktok-tiles">
      <KpiTile
        figure={figureProps('tiktok.tiles.spend', overview.spend, currency, WINDOW)}
        label={uiText('spend_7_days_352823b')}
        sub={uiText('platformCampaignGroupCounts', {
          campaigns: overview.campaigns,
          groups: overview.adGroups,
        })}
        testId="tiktok-tile-spend"
        value={formatCurrency(overview.spend, currency, uiLocale)}
      />
      <KpiTile
        figure={figureProps('tiktok.tiles.results', lead?.results ?? null, null, WINDOW, 'count')}
        label={lead ? capitalise(kindWords(lead.kind, uiText).many) : uiText('results_219c4a6')}
        sub={
          lead
            ? rest.length > 0
              ? uiText('platformAlsoResults', {
                  results: rest
                    .map(
                      (kind) =>
                        `${formatResults(kind.results, uiLocale)} ${kindWords(kind.kind, uiText).many}`,
                    )
                    .join(', '),
                })
              : uiText('platformAsTikTokCounts')
            : uiText('platformNoCampaignResult')
        }
        testId="tiktok-tile-results"
        value={lead ? formatResults(lead.results, uiLocale) : '—'}
      />
      <KpiTile
        figure={figureProps('tiktok.tiles.cost', lead?.costPerResult ?? null, currency, WINDOW)}
        label={
          lead
            ? uiText('template_ced2e5c5acfe', { v0: kindWords(lead.kind, uiText).one })
            : uiText('cost_per_result_a664c01')
        }
        sub={
          rest.length > 0
            ? rest.map((kind) => costLine(kind, currency, uiLocale, uiText)).join(' · ')
            : lead && lead.costPerResult == null
              ? uiText('platformSpentNoKind', {
                  spend: formatCurrency(lead.spend, currency, uiLocale),
                  kind: kindWords(lead.kind, uiText).many,
                })
              : uiText('platformSpendOverResults')
        }
        testId="tiktok-tile-cost"
        value={
          lead?.costPerResult != null ? formatCurrency(lead.costPerResult, currency, uiLocale) : '—'
        }
      />
      {overview.unclassifiedSpend > 0 ? (
        <KpiTile
          figure={figureProps(
            'tiktok.tiles.unclassified',
            overview.unclassifiedSpend,
            currency,
            WINDOW,
          )}
          label={uiText('no_result_kind_14c10ae')}
          sub={uiText('platformUnclassifiedSpend')}
          testId="tiktok-tile-unclassified"
          value={formatCurrency(overview.unclassifiedSpend, currency, uiLocale)}
        />
      ) : null}
    </div>
  );
}

function AdGroupRow({ row, currency }: { row: TikTokAdGroupRow; currency: string }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-4 px-3 py-2"
      data-adgroup-id={row.id}
      data-testid="tiktok-adgroup-row"
    >
      <div className="min-w-0">
        <p className={cn('truncate font-medium text-foreground', typeScale.body)}>{row.name}</p>
        {row.campaignName ? (
          <p className={cn('truncate text-muted-foreground', typeScale.caption)}>
            {row.campaignName}
          </p>
        ) : null}
      </div>
      <span
        className="text-right text-sm tabular-nums"
        {...figureProps(`tiktok.adgroup.${row.id}.spend`, row.spend, currency, WINDOW)}
      >
        {formatCurrency(row.spend, currency, uiLocale)}
      </span>
      <span
        className="text-right text-sm tabular-nums"
        {...figureProps(`tiktok.adgroup.${row.id}.results`, row.results, null, WINDOW, 'count')}
      >
        {row.results == null || row.kind == null
          ? uiText('no_result_kind_2e3e250')
          : `${formatResults(row.results, uiLocale)} ${kindWords(row.kind, uiText).many}`}
      </span>
      <span
        className="text-right text-muted-foreground text-sm tabular-nums"
        {...figureProps(`tiktok.adgroup.${row.id}.cost`, row.costPerResult, currency, WINDOW)}
      >
        {row.costPerResult == null
          ? '—'
          : uiText('template_0a3acb21a5dc', {
              v0: formatCurrency(row.costPerResult, currency, uiLocale),
            })}
      </span>
    </li>
  );
}

function TopAdGroups({ overview, currency }: { overview: TikTokOverview; currency: string }) {
  const uiText = useTranslations('scale');
  if (overview.topAdGroups.length === 0) return null;
  return (
    <section className="space-y-1.5" data-testid="tiktok-top-adgroups">
      <p className={`${typeScale.label} px-1 font-semibold text-muted-foreground`}>
        {uiText('top_ad_groups_by_spend_4e738ec')}
      </p>
      <ul className="divide-y divide-border/70 rounded-lg border border-border/70 bg-card">
        {overview.topAdGroups.map((row) => (
          <AdGroupRow currency={currency} key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}

/** What the TikTok tab shows for one state of its read. */
export function TikTokAdsTabView({ state }: { state: TikTokAdsOverviewState }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  if (state.status === 'not-connected') return <TikTokAdsEmpty />;
  if (state.status === 'loading') {
    return (
      <p className="px-1 text-muted-foreground text-xs" data-testid="tiktok-loading">
        {uiText('reading_tiktok_ads_251a0d8')}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="px-1 text-muted-foreground text-xs" data-testid="tiktok-error" role="status">
        {state.message}
      </p>
    );
  }
  const { overview } = state;
  return (
    <section className="space-y-3" data-source="tiktok-snapshots" data-testid="tiktok-read">
      <div className="space-y-1 px-1">
        {overview.currency == null ? (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-muted-foreground`}
            data-testid="tiktok-headline"
          >
            {uiText('tiktok_reported_no_currency_for_this_advertis_c7acf99')}
          </p>
        ) : overview.campaigns === 0 ? (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-muted-foreground`}
            data-testid="tiktok-headline"
          >
            {uiText('this_tiktok_advertiser_has_no_campaign_to_rea_9fb8495')}
          </p>
        ) : (
          <Headline currency={overview.currency} overview={overview} />
        )}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs"
          data-testid="tiktok-subline"
        >
          <PlatformChip platform="tiktok_ads" />
          <span>
            {uiText.rich('sentence_b49cbf2f3140', {
              v0: overview.advertiserName ? `${overview.advertiserName} · ` : '',
              v1: shortAdvertiserId(overview.advertiserId),
            })}
          </span>
          <span aria-hidden="true">·</span>
          <span>{windowRangeLabel(overview.window.since, overview.window.until, uiLocale)}</span>
          <span aria-hidden="true">·</span>
          <span>{uiText('as_tiktok_reports_it_3e147f9')}</span>
        </div>
      </div>
      {overview.currency != null && overview.campaigns > 0 ? (
        <>
          <Tiles currency={overview.currency} overview={overview} />
          <TopAdGroups currency={overview.currency} overview={overview} />
        </>
      ) : null}
    </section>
  );
}

/** The TikTok tab for the advertiser the producer names, or "not connected" without one. */
export function TikTokAdsTab({
  brandId,
  advertiserId,
}: {
  brandId: string;
  advertiserId: string | null;
}) {
  return <TikTokAdsTabView state={useTikTokAdsOverview(brandId, advertiserId)} />;
}
