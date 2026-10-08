'use client';

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
  return (
    <section
      className="space-y-2 rounded-lg border border-border/70 border-dashed bg-card px-4 py-5"
      data-testid="tiktok-empty"
    >
      <div className="flex flex-wrap items-center gap-2">
        <PlatformChip platform="tiktok_ads" />
        <p className={cn(typeScale.body, 'font-semibold text-foreground')}>
          TikTok Ads isn't connected yet
        </p>
      </div>
      <p className="text-muted-foreground text-sm">
        Once a TikTok Ads advertiser is connected and granted to this brand, its spend, results and
        decisions appear here beside Meta and Google.
      </p>
      <PlatformConnectLink platform="tiktok_ads" />
    </section>
  );
}

function costLine(kind: TikTokKind, currency: string): string {
  const words = kindWords(kind.kind);
  return kind.costPerResult == null
    ? `${formatCurrency(kind.spend, currency)} spent, no ${words.many}`
    : `${formatCurrency(kind.costPerResult, currency)} per ${words.one}`;
}

function Headline({ overview, currency }: { overview: TikTokOverview; currency: string }) {
  const kinds = overview.kinds;
  return (
    <p
      className={`${typeScale.bodyLg} font-semibold leading-snug text-foreground`}
      data-testid="tiktok-headline"
    >
      TikTok spent{' '}
      <span
        className="tabular-nums"
        {...figureProps('tiktok.spend', overview.spend, currency, WINDOW)}
      >
        {formatCurrency(overview.spend, currency)}
      </span>{' '}
      in 7 days
      {kinds.length > 0 ? ': ' : '.'}
      {kinds.map((kind, index) => (
        <span key={kind.kind}>
          {index > 0 ? (index === kinds.length - 1 ? ' and ' : ', ') : ''}
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
            {formatResults(kind.results)}
          </span>{' '}
          {kindWords(kind.kind).many}
          {kind.costPerResult != null ? (
            <>
              {' '}
              at{' '}
              <span
                className="tabular-nums"
                {...figureProps(
                  `tiktok.kind.${kind.kind}.cost`,
                  kind.costPerResult,
                  currency,
                  WINDOW,
                )}
              >
                {formatCurrency(kind.costPerResult, currency)}
              </span>
            </>
          ) : null}
        </span>
      ))}
      {kinds.length > 0 ? '.' : ''}
    </p>
  );
}

function Tiles({ overview, currency }: { overview: TikTokOverview; currency: string }) {
  const [lead, ...rest] = overview.kinds;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="tiktok-tiles">
      <KpiTile
        figure={figureProps('tiktok.tiles.spend', overview.spend, currency, WINDOW)}
        label="Spend · 7 days"
        sub={`${overview.campaigns} ${overview.campaigns === 1 ? 'campaign' : 'campaigns'} · ${overview.adGroups} ${overview.adGroups === 1 ? 'ad group' : 'ad groups'}`}
        testId="tiktok-tile-spend"
        value={formatCurrency(overview.spend, currency)}
      />
      <KpiTile
        figure={figureProps('tiktok.tiles.results', lead?.results ?? null, null, WINDOW, 'count')}
        label={lead ? capitalise(kindWords(lead.kind).many) : 'Results'}
        sub={
          lead
            ? rest.length > 0
              ? `also ${rest.map((kind) => `${formatResults(kind.results)} ${kindWords(kind.kind).many}`).join(', ')}`
              : 'as TikTok counts them'
            : 'no campaign optimizes for a result'
        }
        testId="tiktok-tile-results"
        value={lead ? formatResults(lead.results) : '—'}
      />
      <KpiTile
        figure={figureProps('tiktok.tiles.cost', lead?.costPerResult ?? null, currency, WINDOW)}
        label={lead ? `Cost per ${kindWords(lead.kind).one}` : 'Cost per result'}
        sub={
          rest.length > 0
            ? rest.map((kind) => costLine(kind, currency)).join(' · ')
            : lead && lead.costPerResult == null
              ? `${formatCurrency(lead.spend, currency)} spent, no ${kindWords(lead.kind).many}`
              : 'spend over results in the window'
        }
        testId="tiktok-tile-cost"
        value={lead?.costPerResult != null ? formatCurrency(lead.costPerResult, currency) : '—'}
      />
      {overview.unclassifiedSpend > 0 ? (
        <KpiTile
          figure={figureProps(
            'tiktok.tiles.unclassified',
            overview.unclassifiedSpend,
            currency,
            WINDOW,
          )}
          label="No result kind"
          sub="spend on campaigns that optimize for no result"
          testId="tiktok-tile-unclassified"
          value={formatCurrency(overview.unclassifiedSpend, currency)}
        />
      ) : null}
    </div>
  );
}

function AdGroupRow({ row, currency }: { row: TikTokAdGroupRow; currency: string }) {
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
        {formatCurrency(row.spend, currency)}
      </span>
      <span
        className="text-right text-sm tabular-nums"
        {...figureProps(`tiktok.adgroup.${row.id}.results`, row.results, null, WINDOW, 'count')}
      >
        {row.results == null || row.kind == null
          ? 'no result kind'
          : `${formatResults(row.results)} ${kindWords(row.kind).many}`}
      </span>
      <span
        className="text-right text-muted-foreground text-sm tabular-nums"
        {...figureProps(`tiktok.adgroup.${row.id}.cost`, row.costPerResult, currency, WINDOW)}
      >
        {row.costPerResult == null ? '—' : `${formatCurrency(row.costPerResult, currency)} each`}
      </span>
    </li>
  );
}

function TopAdGroups({ overview, currency }: { overview: TikTokOverview; currency: string }) {
  if (overview.topAdGroups.length === 0) return null;
  return (
    <section className="space-y-1.5" data-testid="tiktok-top-adgroups">
      <p className={`${typeScale.label} px-1 font-semibold text-muted-foreground`}>
        Top ad groups by spend
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
  if (state.status === 'not-connected') return <TikTokAdsEmpty />;
  if (state.status === 'loading') {
    return (
      <p className="px-1 text-muted-foreground text-xs" data-testid="tiktok-loading">
        Reading TikTok Ads…
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
            TikTok reported no currency for this advertiser, so nothing is priced.
          </p>
        ) : overview.campaigns === 0 ? (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-muted-foreground`}
            data-testid="tiktok-headline"
          >
            This TikTok advertiser has no campaign to read yet.
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
            Advertiser {overview.advertiserName ? `${overview.advertiserName} · ` : ''}
            {shortAdvertiserId(overview.advertiserId)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{windowRangeLabel(overview.window.since, overview.window.until)}</span>
          <span aria-hidden="true">·</span>
          <span>as TikTok reports it</span>
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
