'use client';

// The Overview's Google tab (MP2, docs/optimizer-multiplatform/frontend.html §2): Google's own
// screen, read live for the brand's granted Google Ads customer. A sentence with figures, the
// window it covers, then four to six tiles by campaign type — each naming its entity, its figure
// and what the figure is compared with. No chart and no full-width bar. The Optimizer does not
// manage Google yet, so there are no recommendation cards here and the tab says so instead of
// showing an empty section.
//
// When the read cannot happen, the empty state names the reason and the one thing that fixes it.

import { cn } from '@/lib/utils';
import { KpiTile } from '../../components/KpiTile';
import { figureProps, formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import {
  type CampaignGroup,
  costPerConversion,
  figureWindowOf,
  formatConversions,
  type GoogleOverview,
  MAX_GROUP_TILES,
  MIN_TILES,
  percentAgainst,
  windowRangeLabel,
} from './googleAdsOverviewModel';
import { PlatformChip } from './PlatformChip';
import { PlatformConnectLink } from './PlatformConnectLink';
import { PlatformReadingNote } from './PlatformReadingNote';
import {
  type GoogleAdsOverviewState,
  type GoogleReadWindow,
  useGoogleAdsOverview,
} from './useGoogleAdsOverview';

/** Said once, where the window is named, when no source names the account's currency. */
const UNKNOWN_CURRENCY = 'currency not reported by Google';

function signedPct(pct: number): string {
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** "18% below the account's 452 MXN" — the group's cost against Google's own average. */
function costComparison(
  group: CampaignGroup,
  overview: GoogleOverview,
  currency: string | null,
): string {
  const cost = costPerConversion(group);
  if (cost == null) {
    return `${formatCurrency(group.spend, currency)} without a conversion · ${group.sharePct}% of spend`;
  }
  const versus = percentAgainst(cost, overview.costPerConversion);
  const against =
    versus == null || overview.costPerConversion == null
      ? ''
      : versus === 0
        ? ` · same as Google's ${formatCurrency(overview.costPerConversion, currency)}`
        : ` · ${Math.abs(versus)}% ${versus < 0 ? 'below' : 'above'} Google's ${formatCurrency(overview.costPerConversion, currency)}`;
  return `${formatCurrency(cost, currency)} each${against} · ${group.sharePct}% of spend`;
}

function groupLabel(group: CampaignGroup, byType: boolean): string {
  if (!byType) return group.label;
  return `${group.label} · ${group.campaigns} ${group.campaigns === 1 ? 'campaign' : 'campaigns'}`;
}

function Headline({ overview, currency }: { overview: GoogleOverview; currency: string | null }) {
  const window = figureWindowOf(overview.days);
  const change = percentAgainst(overview.spend, overview.priorSpend);
  const converting = overview.groups.filter((group) => group.conversions > 0).slice(0, 3);
  return (
    <p
      className={`${typeScale.bodyLg} font-semibold leading-snug text-foreground`}
      data-testid="google-headline"
    >
      Google spent{' '}
      <span
        className="tabular-nums"
        {...figureProps('google.spend', overview.spend, currency, window)}
      >
        {formatCurrency(overview.spend, currency)}
      </span>
      {change != null ? ` (${signedPct(change)} on the period before)` : ''}
      {converting.length > 0 ? ': ' : overview.spend > 0 ? ' and recorded no conversions.' : '.'}
      {converting.map((group, index) => (
        <span key={group.key}>
          {index > 0 ? (index === converting.length - 1 ? ' and ' : ', ') : ''}
          {group.label} bought{' '}
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
            {formatConversions(group.conversions)}
          </span>{' '}
          {group.conversions === 1 ? 'conversion' : 'conversions'} at{' '}
          <span
            className="tabular-nums"
            {...figureProps(
              `google.group.${group.key}.cost`,
              costPerConversion(group),
              currency,
              window,
            )}
          >
            {formatCurrency(costPerConversion(group), currency)}
          </span>
        </span>
      ))}
      {converting.length > 0 ? '.' : ''}
    </p>
  );
}

function Tiles({ overview, currency }: { overview: GoogleOverview; currency: string | null }) {
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
        label="Spend"
        sub={
          change != null && overview.priorSpend != null
            ? `${signedPct(change)} on ${formatCurrency(overview.priorSpend, currency)} the period before`
            : 'no prior period to compare'
        }
        testId="google-tile-spend"
        value={formatCurrency(overview.spend, currency)}
      />
      <KpiTile
        figure={figureProps(
          'google.tiles.conversions',
          overview.conversions,
          null,
          window,
          'count',
        )}
        label="Conversions"
        sub={
          overview.costPerConversion != null
            ? `${formatCurrency(overview.costPerConversion, currency)} each · as Google attributes them`
            : 'none recorded in the window'
        }
        testId="google-tile-conversions"
        value={formatConversions(overview.conversions)}
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
          label={groupLabel(group, overview.byType)}
          sub={costComparison(group, overview, currency)}
          testId="google-tile-group"
          value={`${formatConversions(group.conversions)} conv.`}
        />
      ))}
      {showClicks ? (
        <KpiTile
          figure={figureProps('google.tiles.clicks', overview.clicks, null, window, 'count')}
          label="Clicks"
          sub={`${overview.ctr.toFixed(2)}% of impressions clicked`}
          testId="google-tile-clicks"
          value={overview.clicks.toLocaleString('en-US')}
        />
      ) : null}
    </div>
  );
}

function EmptyState({
  title,
  body,
  testId,
  connect,
}: {
  title: string;
  body: string;
  testId: string;
  connect: boolean;
}) {
  return (
    <section
      className="space-y-2 rounded-lg border border-border/70 border-dashed bg-card px-4 py-5"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PlatformChip platform="google_ads" />
        <p className={cn(typeScale.body, 'font-semibold text-foreground')}>{title}</p>
      </div>
      <p className="text-muted-foreground text-sm">{body}</p>
      {connect ? <PlatformConnectLink platform="google_ads" /> : null}
    </section>
  );
}

export function GoogleAdsTabView({
  state,
  readingNote = true,
  onCreatePortfolio,
}: {
  state: GoogleAdsOverviewState;
  /** False when the frame above already said what these figures are. */
  readingNote?: boolean;
  onCreatePortfolio?: () => void;
}) {
  switch (state.status) {
    case 'loading':
      return (
        <p className="px-1 text-muted-foreground text-sm" data-testid="google-loading">
          Reading Google Ads…
        </p>
      );
    case 'no-connection':
      return (
        <EmptyState
          body="Google Ads isn't connected. Connect a Google login with access to the Ads account, then grant that account to this brand."
          connect
          testId="google-empty-no-connection"
          title="No Google connection"
        />
      );
    case 'no-grant':
      return (
        <EmptyState
          body="Your Google login is connected, but no Google Ads account is granted to this brand. Grant one in Settings → Integrations."
          connect
          testId="google-empty-no-grant"
          title="No Google Ads account granted to this brand"
        />
      );
    case 'error':
      return (
        <EmptyState
          body={state.message}
          connect={false}
          testId="google-empty-error"
          title={
            state.account
              ? `Google Ads could not be read for ${state.account.name ?? state.account.account_id}`
              : 'Google Ads could not be read'
          }
        />
      );
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
              <span>{windowRangeLabel(overview.since, overview.until)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {account.name ?? 'Google Ads'} ({account.account_id})
              </span>
              <span aria-hidden="true">·</span>
              <span>attribution: what Google reports</span>
              {currency ? null : (
                <>
                  <span aria-hidden="true">·</span>
                  <span data-testid="google-currency-unknown">{UNKNOWN_CURRENCY}</span>
                </>
              )}
            </div>
          </section>
          <Tiles currency={currency} overview={overview} />
          {readingNote ? (
            <PlatformReadingNote
              onCreatePortfolio={onCreatePortfolio}
              platform="google_ads"
              where="above"
            />
          ) : null}
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
  if (state.status === 'loading') {
    return (
      <p className="px-1 text-muted-foreground text-xs" data-testid="google-breakdown-loading">
        Reading Google's campaign types…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="px-1 text-muted-foreground text-xs" data-testid="google-breakdown-error">
        The split by campaign type could not be read: {state.message}
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
        By campaign type · {windowRangeLabel(overview.since, overview.until)} · what Google reports
        {account.currency ? '' : ` · ${UNKNOWN_CURRENCY}`}
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
            label={groupLabel(group, overview.byType)}
            sub={costComparison(group, overview, account.currency)}
            testId="google-tile-group"
            value={`${formatConversions(group.conversions)} conv.`}
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
  onCreatePortfolio,
}: {
  brandId: string;
  /** 'breakdown' when the multi-platform frame already leads the tab. */
  mode?: 'full' | 'breakdown';
  /** The producer's window, so this read states the same dates as the frame above it. */
  window?: GoogleReadWindow | null;
  readingNote?: boolean;
  onCreatePortfolio?: () => void;
}) {
  const state = useGoogleAdsOverview(brandId, window);
  return mode === 'breakdown' ? (
    <GoogleCampaignTypeBreakdown state={state} />
  ) : (
    <GoogleAdsTabView
      onCreatePortfolio={onCreatePortfolio}
      readingNote={readingNote}
      state={state}
    />
  );
}
