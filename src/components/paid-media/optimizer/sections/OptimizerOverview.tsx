'use client';

// Overview — the optimizer's front page, as the Performance+ redesign orders it (proposal O1,
// docs/performance-plus-redesign/overview.html). Above the fold, in this order and nothing
// else: one sentence with figures (what the account spent over the window and how many
// decisions wait; what each result kind cost against its target is on its tile); a meta
// line with the window, the book and when the read was taken; the band that asks Jaina; one editorial row of four to six
// figures with no boxes, spend as the hero; the recommendation cards in impact order with the lead marked; and the portfolios as
// one-line rows, sortable by distance to target.
//
// Nothing here is a chart and nothing is prose written by a model. The sentence and the tiles
// are composed from the same typed rows — the portfolio list and the optimizer's own
// efficiency series per portfolio — in ./account/overviewModel.ts, so a figure in the sentence
// is always one the reader can find again in a tile or a row. The cards come from today's
// account read; the read's own narrative, its footnotes and its charts are not shown.
//
// Above all of it sits the platform tab row (All · Meta · Google · TikTok, kept in ?platform=,
// docs/optimizer-multiplatform/frontend.html §2) and the toolbar, unless the page shell draws
// both in its own top bar (`chromeInShell`). "All" is the MP1 frame: its sentence and
// tiles come from ONE producer, public.optimizer_get_account_platform_metrics, so they span the
// three platforms without adding two currencies or two result kinds together. "Meta" is the O1
// above, unchanged. Google and TikTok lead with their own rows of the same producer, then what
// only that platform's own read holds (Google's campaign types, TikTok's snapshots and top ad
// groups). Until that RPC is deployed every tab says so plainly, and "All" falls back to today's
// Meta O1. Under its tiles "All" may show the platforms side by side (MP3), which a viewer can
// hide; each portfolio row carries one chip per platform it holds members on.
//
// Google's tab then takes the Meta tab's structure under its read (G2, google-ads plan): its
// recommendation cards with their controls, the links to Actions and Activity, and its
// portfolio rows — the same components, fed the brand's Google portfolios and cards whichever
// ad account the page has selected.

import type {
  CycleRunPacing,
  EfficiencySeriesPoint,
  PortfolioListItem,
} from '@continuum/contracts';
import { applyApprovals } from '@continuum/contracts';
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  FileTextIcon,
  PlusIcon,
  SparklesIcon,
} from 'lucide-react';
import { type ComponentProps, type ReactNode, useMemo, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { bareAccountId } from '@/lib/paid-media/accountId';
import { cn } from '@/lib/utils';
import { KpiDelta, KpiRow, KpiTile } from '../components/KpiTile';
import { figureProps, formatCpa, formatCurrency } from '../format';
import { pendingWorkCount } from '../reportModel';
import * as typeScale from '../typeScale';
import {
  useAccountApprovals,
  useOptimizerAccountRead,
  useOptimizerAdAccounts,
  useOptimizerPlatformCards,
  useOptimizerPlatformPortfolios,
  useOptimizerPortfolioEfficiency,
  useOptimizerPortfolioPacing,
  useRequestAccountRead,
} from '../useOptimizerData';
import { useOptimizerUrlState } from '../useOptimizerUrlState';
import { AccountRead } from './account/AccountRead';
import { AccountReadFreshness } from './account/AccountReadFreshness';
import { HeadlineSentence } from './account/HeadlineSentence';
import {
  accountHeadlineSegments,
  accountSpend,
  autopilotSummary,
  decisionsLabel,
  latestCycle,
  type PortfolioWindow,
  portfolioWindow,
  portfolioWindowFromMetrics,
  type ResultKind,
  type RowSortDir,
  type RowSortKey,
  resultKinds,
  sortPortfolioRows,
  spendState,
  spendVsPriorPct,
  targetSide,
  vsTargetLabel,
  WINDOW_DAYS,
  windowLabel,
} from './account/overviewModel';
import { JainaEntryChips } from './JainaEntryChips';
import { jainaTabEntryPrompts, jainaWeeklyReportPrompt } from './jainaEntryModel';
import {
  AccountReadFreshnessSkeleton,
  HeadlineSkeleton,
  OverviewTilesSkeleton,
  PlatformComparisonSkeleton,
  RecommendationsSkeleton,
  SublineFactsSkeleton,
} from './OverviewSkeletons';
import { PortfolioRowCard } from './PortfolioRowCard';
import { cardActionsOf } from './platformCards/platformCardActionModel';
import {
  AllPlatformsHeadline,
  AllPlatformsSubline,
  AllPlatformsTiles,
  PlatformMetricsSection,
} from './platforms/AccountPlatformsOverview';
import { connectedFromMetrics, platformTotals } from './platforms/accountPlatformMetricsModel';
import { readComparisonHidden } from './platforms/comparisonPreference';
import { GoogleAdsTab } from './platforms/GoogleAdsTab';
import { MultiPlatformUnavailable } from './platforms/MultiPlatformUnavailable';
import { PlatformComparisonRow } from './platforms/PlatformComparisonRow';
import { PlatformTabs } from './platforms/PlatformTabs';
import {
  type AdPlatform,
  connectedPlatforms,
  OPTIMIZER_MANAGED_PLATFORM,
  PLATFORM_NAMES,
  rendersManagedOverview,
} from './platforms/platformTabsModel';
import { memberPlatforms, usePortfolioMemberStates } from './platforms/portfolioPlatforms';
import { TikTokAdsTab } from './platforms/TikTokAdsTab';
import {
  type AccountPlatformMetricsState,
  useAccountPlatformMetrics,
} from './platforms/useAccountPlatformMetrics';
import { underManagement } from './portfolioStaleness';

/** Room for six tiles: spend, up to three result kinds, decisions, autopilot. */
const MAX_KIND_TILES = 3;

type OptimizerOverviewProps = {
  brandId: string;
  /** The account the read is about. Null while no account is selected. */
  adAccountId: string | null;
  portfolios: PortfolioListItem[];
  pendingCount: number;
  currency?: string | null;
  onOpenActions: () => void;
  /** Opens the Activity view, where every write the optimizer made is logged. */
  onOpenActivity: () => void;
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
  onPrefetchPortfolio?: (portfolioId: string) => void;
  /** The page shell draws the platform tabs and the toolbar (Review pending, Weekly report,
   *  New portfolio) in its own top bar, so the Overview leaves them out. */
  chromeInShell?: boolean;
};

/** The tile's second line for one result kind: cost and target — or why not. The move against
 *  last week is its own element (KindPriorDelta), the one place the row spends colour. */
export function kindTileSub(kind: ResultKind, currency: string | null | undefined): string {
  if (kind.costPerResult == null) {
    return kind.spend > 0 ? `${formatCurrency(kind.spend, currency)} no results` : 'no spend';
  }
  const parts = [`${formatCpa(kind.costPerResult, currency)} each`];
  if (kind.targetRange == null) parts.push('no target');
  else if (kind.targetRange.min === kind.targetRange.max)
    parts.push(`target ${formatCpa(kind.targetRange.min, currency)}`);
  else
    parts.push(
      `target ${formatCpa(kind.targetRange.min, currency)}–${formatCpa(kind.targetRange.max, currency)}`,
    );
  return parts.join(' · ');
}

/** A cost's move against last week: cheaper is green, dearer is red. Nothing when the kind has
 *  no prior cost to compare with. */
export function KindPriorDelta({
  kind,
  currency,
}: {
  kind: ResultKind;
  currency: string | null | undefined;
}) {
  if (kind.vsPriorPct == null || kind.priorCostPerResult == null) return null;
  return (
    <KpiDelta
      better="down"
      pct={kind.vsPriorPct}
      testId="cost-prior-delta"
      title={`prev. week ${formatCpa(kind.priorCostPerResult, currency)}`}
    />
  );
}

/** A cost's distance to its target, coloured by side: under is green, over is red. Nothing
 *  when the kind has no target or no cost to measure against one. */
export function KindTargetDistance({ kind }: { kind: ResultKind }) {
  const side = targetSide(kind.vsTargetPct);
  if (side === 'none' || kind.costPerResult == null) return null;
  return (
    <span
      className={cn(
        'tabular-nums',
        side === 'under' && 'text-success',
        side === 'over' && 'text-destructive',
      )}
      data-side={side}
      data-testid="cost-target-distance"
    >
      {vsTargetLabel(kind.vsTargetPct)}
    </span>
  );
}

/** The tile's second line for autopilot: who only recommends, or what is stopped. */
export function autopilotTileSub(summary: ReturnType<typeof autopilotSummary>): string {
  if (summary.paused > 0) return `${summary.paused} paused`;
  if (summary.recommending.length === 0) return 'all apply on their own';
  if (summary.recommending.length <= 2)
    return `${summary.recommending.join(' and ')} ${summary.recommending.length === 1 ? 'recommends, does not apply' : 'recommend, do not apply'}`;
  return `${summary.recommending.length} recommend, do not apply`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Each portfolio's 7-day window from its own efficiency series, by id. */
function portfolioWindows(
  portfolios: readonly PortfolioListItem[],
  series: readonly (readonly EfficiencySeriesPoint[])[],
): Map<string, PortfolioWindow> {
  const byId = new Map<string, PortfolioWindow>();
  portfolios.forEach((portfolio, index) => {
    const window = portfolioWindow(portfolio, series[index] ?? []);
    if (window) byId.set(portfolio.id, window);
  });
  return byId;
}

export function OptimizerOverview({
  brandId,
  adAccountId,
  portfolios,
  pendingCount,
  currency,
  onOpenActions,
  onOpenActivity,
  onSelectPortfolio,
  onCreatePortfolio,
  onPrefetchPortfolio,
  chromeInShell = false,
}: OptimizerOverviewProps) {
  const portfolioIds = useMemo(() => portfolios.map((portfolio) => portfolio.id), [portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(portfolioIds);
  const pacingById = useOptimizerPortfolioPacing(portfolios);
  const memberStates = usePortfolioMemberStates(portfolioIds);
  // The account read opens the cards when the worker has written one. Absent is absent:
  // no spinner, no empty shell — the sentence and the tiles stand on their own.
  const accountRead = useOptimizerAccountRead(brandId, adAccountId);
  const approvalMaps = useAccountApprovals(brandId, adAccountId);
  const requestRead = useRequestAccountRead(brandId, adAccountId);
  const { platform: platformTab, setPlatform } = useOptimizerUrlState();
  const adAccounts = useOptimizerAdAccounts(brandId);
  const platformMetrics = useAccountPlatformMetrics(brandId);
  const connected = useMemo(() => {
    const granted = connectedPlatforms(adAccounts.data);
    // The producer knows TikTok too; the grant list does not. Either one saying "connected"
    // is enough — a tab never says "Connect" for an account the page is already reading.
    const read =
      platformMetrics.status === 'ready' ? connectedFromMetrics(platformMetrics.metrics) : null;
    return {
      // The selected account is a Meta account the brand already reads: Meta is connected even
      // while the account list is still loading or failed.
      meta: granted.meta || adAccountId != null || Boolean(read?.meta),
      google_ads: granted.google_ads || Boolean(read?.google_ads),
      tiktok_ads: granted.tiktok_ads || Boolean(read?.tiktok_ads),
    };
  }, [adAccounts.data, adAccountId, platformMetrics]);

  const windows = useMemo(
    () => portfolioWindows(portfolios, efficiency.series),
    [portfolios, efficiency.series],
  );
  const names = useMemo(
    () => new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name])),
    [portfolios],
  );

  const spend = accountSpend(windows);
  const spendDelta = spendVsPriorPct(spend);
  // A sum over the portfolios that answered is not the account's spend.
  const complete = efficiency.failed === 0;
  const kinds = useMemo(() => resultKinds(portfolios, windows), [portfolios, windows]);
  const autopilot = autopilotSummary(portfolios);
  const book = underManagement(portfolios);
  const dailyTotal = portfolios.reduce((sum, portfolio) => sum + (portfolio.daily_total ?? 0), 0);
  const portfoliosWithDecisions = portfolios.filter(
    (portfolio) => pendingWorkCount(portfolio) > 0,
  ).length;
  const window = windowLabel(latestCycle(windows));

  const read = accountRead.data?.read ?? null;
  // The stored read is a nightly snapshot, so the state baked into it is last night's. Apply
  // what has been approved SINCE, against the very ceilings that read was composed under.
  const shown = useMemo(() => {
    if (!read) return null;
    const maps = approvalMaps.data;
    if (!maps) return read;
    const defaults = read.ceiling_defaults as never;
    return {
      ...read,
      candidates: applyApprovals(read.candidates, { ...maps, defaults }),
      guards: applyApprovals(read.guards, { ...maps, defaults }),
    };
  }, [read, approvalMaps.data]);
  const cardActions = useMemo(() => cardActionsOf(shown?.candidates ?? []), [shown]);

  const jainaEntries = useMemo(() => {
    let worst: { name: string; pct: number } | null = null;
    let silent: string | null = null;
    for (const portfolio of portfolios) {
      const row = windows.get(portfolio.id);
      if (!row) continue;
      if (row.vsTargetPct != null && row.vsTargetPct > 0 && (!worst || row.vsTargetPct > worst.pct))
        worst = { name: portfolio.name, pct: row.vsTargetPct };
      if (silent == null && row.spend > 0 && row.results === 0) silent = portfolio.name;
    }
    return jainaTabEntryPrompts(platformTab, {
      accountLabel: adAccountId,
      portfolios: portfolios.map((portfolio) => ({
        name: portfolio.name,
        objective: portfolio.objective,
      })),
      worstOverTarget: worst?.name ?? null,
      noResults: silent,
    });
  }, [platformTab, portfolios, windows, adAccountId]);
  // "All" spans every platform, so its questions carry none; a platform's tab carries its own.
  const jainaPlatform = platformTab === 'all' ? null : platformTab;
  // An unconnected tab is its empty state and nothing else: a question that deep-links to a
  // TikTok Ads prompt implies ads data the account does not have.
  const tabConnected = platformTab === 'all' || connected[platformTab];
  const jainaBand = !tabConnected ? null : (
    <div className="rounded-lg bg-primary/5 px-3 py-2">
      <JainaEntryChips
        entries={jainaEntries}
        frame={false}
        label="Ask Jaina"
        platform={jainaPlatform}
      />
    </div>
  );

  const portfolioNoun = portfolios.length === 1 ? 'portfolio' : 'portfolios';

  // Every brand gets the four tabs: a missing Google or TikTok tab reads as "we don't do
  // Google", where a tab that says Connect reads as "you haven't connected it yet".
  const tabs = chromeInShell ? null : (
    <PlatformTabs connected={connected} onChange={setPlatform} value={platformTab} />
  );
  if (!rendersManagedOverview(platformTab)) {
    return (
      <div className="space-y-3" data-platform-tab={platformTab} data-testid="optimizer-overview">
        {tabs}
        {jainaBand}
        <PlatformTab brandId={brandId} metrics={platformMetrics} platform={platformTab}>
          {platformTab === 'google_ads' && tabConnected ? (
            <PlatformPortfolioSections
              brandId={brandId}
              onCreatePortfolio={onCreatePortfolio}
              onOpenActions={onOpenActions}
              onOpenActivity={onOpenActivity}
              onPrefetchPortfolio={onPrefetchPortfolio}
              onSelectPortfolio={onSelectPortfolio}
              platform={platformTab}
            />
          ) : null}
        </PlatformTab>
      </div>
    );
  }

  // "All" reads the producer; "Meta" is today's O1 whatever the producer says.
  const allFrame = platformTab === 'all' ? platformMetrics : null;
  const multiplatform = allFrame?.status === 'ready' ? allFrame.metrics : null;
  // While the producer reads, its blocks are held open at their own size (OverviewSkeletons):
  // inserting them when the read lands pushed the portfolio rows down the page.
  const producerLoading = allFrame?.status === 'loading';
  const connectedCount = Object.values(connected).filter(Boolean).length;

  return (
    <div className="space-y-3" data-platform-tab={platformTab} data-testid="optimizer-overview">
      {tabs}
      {chromeInShell ? null : (
        <div className="flex flex-wrap items-center justify-end gap-2 px-1">
          {pendingCount > 0 ? (
            <Button
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onOpenActions}
              size="sm"
              type="button"
              variant="secondary"
            >
              Review {pendingCount} pending
              <ArrowRightIcon aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
          {/* The weekly report is a Jaina answer, not a page: the link opens Jaina with the
           *  prepared ask for this account, the way the band's questions do. */}
          {adAccountId ? (
            <a
              className={cn(
                buttonVariants({ size: 'sm', variant: 'outline' }),
                'h-7 gap-1.5 px-2 text-xs',
              )}
              data-testid="overview-weekly-report"
              href={jainaPromptHref(jainaWeeklyReportPrompt(adAccountId))}
            >
              <FileTextIcon aria-hidden="true" className="size-3.5" />
              Weekly report
            </a>
          ) : null}
          <Button
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onCreatePortfolio}
            size="sm"
            type="button"
          >
            <PlusIcon aria-hidden="true" className="size-3.5" />
            New portfolio
          </Button>
        </div>
      )}

      {allFrame?.status === 'error' ? (
        <p
          className="px-1 text-muted-foreground text-xs"
          data-testid="multiplatform-error"
          role="status"
        >
          {allFrame.message} The figures below are Meta's.
        </p>
      ) : null}

      {/* 1 — the sentence. Every figure in it is one of the tiles below, said in a row. */}
      <section className="space-y-1.5 px-1" data-testid="overview-hero">
        {multiplatform ? (
          <AllPlatformsHeadline metrics={multiplatform} pendingCount={pendingCount} />
        ) : producerLoading ? (
          <HeadlineSkeleton
            label="Reading the account across platforms…"
            platforms={connectedCount}
          />
        ) : efficiency.failed > 0 && !efficiency.pending ? (
          <p
            className={`${typeScale.headline} text-muted-foreground`}
            data-incomplete="true"
            data-testid="overview-headline"
          >
            Could not read the cycle of {efficiency.failed}{' '}
            {efficiency.failed === 1 ? 'portfolio' : 'portfolios'}, so the account figure is
            incomplete.{' '}
            <button
              className="text-primary-ink underline-offset-2 hover:underline"
              data-testid="overview-retry"
              onClick={efficiency.retryFailed}
              type="button"
            >
              Retry
            </button>
          </p>
        ) : spend ? (
          <HeadlineSentence
            segments={accountHeadlineSegments({
              spends: [
                {
                  text: formatCurrency(spend.spend, currency),
                  figure: figureProps('overview.spend', spend.spend, currency, 'd7'),
                },
              ],
              span: `in ${WINDOW_DAYS} days`,
              decisions: pendingCount,
            })}
          />
        ) : (
          <p
            className={`${typeScale.headline} text-muted-foreground`}
            data-pending={efficiency.pending ? 'true' : undefined}
            data-testid="overview-headline"
          >
            {efficiency.pending
              ? "Reading the account's cycles…"
              : `No portfolio has a measured cycle yet. ${capitalise(decisionsLabel(pendingCount))}.`}
          </p>
        )}
        {/* 2 — the meta line: the window the figures cover, what they cover, and when the read
         *  was taken, with the way to ask for another as a text link. */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          data-testid="overview-subline"
        >
          {multiplatform ? (
            <AllPlatformsSubline metrics={multiplatform} />
          ) : producerLoading ? (
            <SublineFactsSkeleton platforms={connectedCount} />
          ) : window ? (
            <span data-testid="overview-window">{window}</span>
          ) : null}
          {multiplatform || producerLoading || window ? <span aria-hidden="true">·</span> : null}
          <span data-testid="book-line">
            {portfolios.length} {portfolioNoun} · {book.managed}{' '}
            {book.managed === 1 ? 'ad set' : 'ad sets'}
            {book.gone > 0 ? ` · ${book.gone} lost` : null}
          </span>
          {accountRead.data ? (
            <>
              <span aria-hidden="true">·</span>
              <AccountReadFreshness
                error={requestRead.error instanceof Error ? requestRead.error.message : null}
                onRequest={() => requestRead.mutate()}
                readyAt={accountRead.data.ready_at}
                refresh={accountRead.data.refresh}
                requesting={requestRead.isPending}
                utcDay={accountRead.data.utc_day}
              />
            </>
          ) : accountRead.isLoading ? (
            <>
              <span aria-hidden="true">·</span>
              <AccountReadFreshnessSkeleton />
            </>
          ) : null}
        </div>
      </section>

      {/* 3 — the band that asks Jaina, with the questions of the tab a person is on. */}
      {jainaBand}

      {/* 4 — the editorial row: spend as the hero, then each result kind with its cost, the
       *  decisions waiting and autopilot — no boxes, a hairline between cells. Colour goes only
       *  to a cost that moved against last week, and to the decisions that ask for a person. */}
      {multiplatform ? (
        <AllPlatformsTiles
          metrics={multiplatform}
          onOpenActions={onOpenActions}
          pendingCount={pendingCount}
        />
      ) : producerLoading ? (
        <>
          <OverviewTilesSkeleton
            cells={5}
            platforms={connectedCount}
            withAction={pendingCount > 0}
          />
          {connectedCount >= 2 ? (
            <PlatformComparisonSkeleton
              hidden={readComparisonHidden()}
              platforms={connectedCount}
            />
          ) : null}
        </>
      ) : (
        <KpiRow testId="account-tiles">
          <KpiTile
            emphasis="hero"
            figure={figureProps('tiles.spend', spend?.spend ?? null, currency, 'd7')}
            label={`Spend · ${WINDOW_DAYS} days`}
            state={complete && spend ? spendState(spend.spend / WINDOW_DAYS, dailyTotal) : 'none'}
            sub={
              !complete ? (
                `incomplete read · plan ${formatCurrency(dailyTotal, currency)} per day`
              ) : spend ? (
                <>
                  {spendDelta != null ? (
                    <>
                      <KpiDelta
                        better="neutral"
                        pct={spendDelta}
                        testId="spend-prior-delta"
                        title={`prev. week ${formatCurrency(spend.priorSpend, currency)}`}
                      />{' '}
                      vs prev. week ·{' '}
                    </>
                  ) : null}
                  {formatCurrency(spend.spend / WINDOW_DAYS, currency)} per day · plan{' '}
                  {formatCurrency(dailyTotal, currency)}
                </>
              ) : (
                `plan ${formatCurrency(dailyTotal, currency)} per day`
              )
            }
            testId="tile-spend"
            value={complete && spend ? formatCurrency(spend.spend, currency) : '—'}
            variant="inline"
          />
          {kinds.slice(0, MAX_KIND_TILES).map((kind) => (
            <KpiTile
              figure={figureProps(`tiles.kind.${kind.kind}`, kind.results, null, 'd7', 'count')}
              key={kind.kind}
              label={capitalise(kind.words.many)}
              state={kind.state}
              sub={
                <>
                  {kindTileSub(kind, currency)}
                  {targetSide(kind.vsTargetPct) !== 'none' && kind.costPerResult != null
                    ? ' · '
                    : null}
                  <KindTargetDistance kind={kind} />
                  {kind.vsPriorPct != null && kind.priorCostPerResult != null ? ' · ' : null}
                  <KindPriorDelta currency={currency} kind={kind} />
                </>
              }
              testId={`tile-kind-${kind.kind}`}
              value={kind.results.toLocaleString('en-US')}
              variant="inline"
            />
          ))}
          <KpiTile
            action={
              pendingCount > 0 ? (
                <button
                  className="hit-area font-semibold text-primary-ink text-xs hover:underline"
                  onClick={onOpenActions}
                  type="button"
                >
                  Review →
                </button>
              ) : null
            }
            emphasis={pendingCount > 0 ? 'decision' : undefined}
            figure={figureProps('tiles.decisions-waiting', pendingCount, null, 'none', 'count')}
            label="Decisions"
            sub={
              pendingCount > 0
                ? `in ${portfoliosWithDecisions} ${portfoliosWithDecisions === 1 ? 'portfolio' : 'portfolios'}`
                : 'nothing waits for your decision'
            }
            testId="tile-decisions"
            value={String(pendingCount)}
            variant="inline"
          />
          <KpiTile
            figure={figureProps('tiles.on-autopilot', autopilot.autopilot, null, 'none', 'count')}
            label="Autopilot"
            state={autopilot.paused > 0 ? 'warn' : 'none'}
            sub={autopilotTileSub(autopilot)}
            testId="tile-autopilot"
            value={String(autopilot.autopilot)}
            valueSuffix={`/${autopilot.total}`}
            variant="inline"
          />
        </KpiRow>
      )}

      {/* 4b — the platforms side by side (MP3): optional, hidden per viewer. */}
      {multiplatform ? <PlatformComparisonRow metrics={multiplatform} /> : null}

      {/* 5 — the recommendation cards, in impact order, the lead marked. */}
      {shown ? (
        <Recommendations
          candidates={[...shown.candidates, ...shown.guards]}
          cardActions={cardActions}
          currency={shown.currency ?? currency ?? null}
          dailySpend={shown.scale_per_day ?? dailyTotal}
          onOpenPortfolio={onSelectPortfolio}
          platform={OPTIMIZER_MANAGED_PLATFORM}
          portfolioNames={names}
        />
      ) : accountRead.isLoading ? (
        <RecommendationsSkeleton />
      ) : null}

      <OverviewLinks onOpenActions={onOpenActions} onOpenActivity={onOpenActivity} />

      {/* 6 — the portfolios, one line each, sortable by distance to target. Held back until
       *  the account read and the cycles have landed: the cards above open to as many as four
       *  (no placeholder can know how many) and the cycles re-sort the rows, so rows painted
       *  earlier were pushed and reordered on every load (768 CLS 0.065 + 2 × 0.019). Arriving
       *  last, at the bottom, they move nothing. */}
      {accountRead.isLoading || efficiency.pending ? null : (
        <PortfolioRows
          empty={<p className="text-xs text-muted-foreground">No portfolios yet.</p>}
          onPrefetchPortfolio={onPrefetchPortfolio}
          onSelectPortfolio={onSelectPortfolio}
          pacingById={pacingById}
          portfolios={portfolios}
          rowCurrency={() => currency}
          rowPlatforms={(portfolio) =>
            memberPlatforms(memberStates.get(portfolio.id), OPTIMIZER_MANAGED_PLATFORM)
          }
          windows={windows}
        />
      )}
    </div>
  );
}

/** The recommendation cards under their heading, as every tab with cards shows them. */
function Recommendations(props: ComponentProps<typeof AccountRead>) {
  return (
    <section className="space-y-2" data-testid="overview-recommendations">
      <h2
        className={`${typeScale.label} flex items-center gap-1.5 px-1 font-semibold text-muted-foreground`}
      >
        <SparklesIcon aria-hidden="true" className="size-3.5 text-primary-ink" />
        What Jaina recommends
      </h2>
      <AccountRead {...props} />
    </section>
  );
}

/** Where the cards' decisions go next: the Actions queue to approve them, Activity to see what
 *  was written. */
function OverviewLinks({
  onOpenActions,
  onOpenActivity,
}: {
  onOpenActions: () => void;
  onOpenActivity: () => void;
}) {
  const link =
    'hit-area inline-flex items-center gap-1 font-semibold text-primary-ink hover:underline';
  return (
    <nav
      aria-label="Optimizer views"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs"
      data-testid="overview-links"
    >
      <button
        className={link}
        data-testid="overview-link-actions"
        onClick={onOpenActions}
        type="button"
      >
        Review in Actions
        <ArrowRightIcon aria-hidden="true" className="size-3.5" />
      </button>
      <button
        className={link}
        data-testid="overview-link-activity"
        onClick={onOpenActivity}
        type="button"
      >
        Activity
        <ArrowRightIcon aria-hidden="true" className="size-3.5" />
      </button>
    </nav>
  );
}

/** The portfolios, one line each, sortable by distance to target, as every tab with portfolios
 *  lists them. */
function PortfolioRows({
  portfolios,
  windows,
  pacingById,
  rowPlatforms,
  rowCurrency,
  onSelectPortfolio,
  onPrefetchPortfolio,
  empty,
}: {
  portfolios: readonly PortfolioListItem[];
  windows: ReadonlyMap<string, PortfolioWindow>;
  pacingById: ReadonlyMap<string, CycleRunPacing | null>;
  rowPlatforms: (portfolio: PortfolioListItem) => AdPlatform[];
  rowCurrency: (portfolio: PortfolioListItem) => string | null | undefined;
  onSelectPortfolio: (portfolioId: string) => void;
  onPrefetchPortfolio?: (portfolioId: string) => void;
  /** What the section says when there is no portfolio to list. */
  empty: ReactNode;
}) {
  const [sortKey, setSortKey] = useState<RowSortKey>('distance');
  const [sortDir, setSortDir] = useState<RowSortDir>('asc');
  const sorted = sortPortfolioRows(portfolios, windows, sortKey, sortDir);
  return (
    <section className="space-y-2" data-testid="portfolio-rows">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className={`${typeScale.label} font-semibold text-muted-foreground`}>Portfolios</p>
        {sorted.length === 0 ? null : (
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              aria-label="Sort portfolios by"
              className="flex-wrap"
              onValueChange={(value) => {
                if (value) setSortKey(value as RowSortKey);
              }}
              size="sm"
              type="single"
              value={sortKey}
              variant="outline"
            >
              <ToggleGroupItem className="h-7 px-2 text-xs" value="distance">
                Distance to target
              </ToggleGroupItem>
              <ToggleGroupItem className="h-7 px-2 text-xs" value="name">
                Name
              </ToggleGroupItem>
              <ToggleGroupItem className="h-7 px-2 text-xs" value="daily">
                Budget
              </ToggleGroupItem>
              <ToggleGroupItem className="h-7 px-2 text-xs" value="pending">
                Pending
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              aria-label={sortDir === 'asc' ? 'Ascending' : 'Descending'}
              className="size-7 p-0"
              onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}
              size="sm"
              type="button"
              variant="ghost"
            >
              {sortDir === 'asc' ? (
                <ArrowUpIcon aria-hidden="true" className="size-3.5" />
              ) : (
                <ArrowDownIcon aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {sorted.map((portfolio) => (
          <PortfolioRowCard
            currency={rowCurrency(portfolio)}
            key={portfolio.id}
            onPrefetch={onPrefetchPortfolio ? () => onPrefetchPortfolio(portfolio.id) : undefined}
            onSelect={() => onSelectPortfolio(portfolio.id)}
            pacing={pacingById.get(portfolio.id) ?? null}
            platforms={rowPlatforms(portfolio)}
            portfolio={portfolio}
            window={windows.get(portfolio.id) ?? null}
          />
        ))}
        {sorted.length === 0 ? empty : null}
      </div>
    </section>
  );
}

/** The one currency a set of codes agrees on, or null when they carry none or several. */
function oneCurrency(codes: readonly (string | null | undefined)[]): string | null {
  const distinct = new Set(codes.filter(Boolean));
  return distinct.size === 1 ? ([...distinct][0] ?? null) : null;
}

/**
 * A platform tab's Optimizer half, under the platform's read: its pending cards with their
 * controls (optimizer_get_platform_cards), the links to Actions and Activity, and its portfolio
 * rows — every one of the brand's portfolios on the platform, not only those of the selected ad
 * account. A failed card read says so; it never reads as "nothing to decide".
 */
function PlatformPortfolioSections({
  brandId,
  platform,
  onOpenActions,
  onOpenActivity,
  onSelectPortfolio,
  onCreatePortfolio,
  onPrefetchPortfolio,
}: {
  brandId: string;
  platform: Exclude<AdPlatform, 'meta'>;
  onOpenActions: () => void;
  onOpenActivity: () => void;
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
  onPrefetchPortfolio?: (portfolioId: string) => void;
}) {
  const portfoliosQuery = useOptimizerPlatformPortfolios(brandId, platform);
  const portfolios = portfoliosQuery.data;
  const cards = useOptimizerPlatformCards(brandId, platform);
  const accounts = useOptimizerAdAccounts(brandId).data;
  const portfolioIds = useMemo(() => portfolios.map((portfolio) => portfolio.id), [portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(portfolioIds);
  const pacingById = useOptimizerPortfolioPacing(portfolios);
  // A row's window and currency come from its metrics read first: the efficiency series sums
  // Meta ad-set snapshots, which a Google portfolio never writes ("no cycle yet" beside 218
  // leads). The series stands in while that read is missing or failed.
  const metricsById = usePortfolioMemberStates(portfolioIds);
  const metricsOf = (portfolio: PortfolioListItem) => {
    const state = metricsById.get(portfolio.id);
    return state?.status === 'ready' ? state.metrics : null;
  };
  const windows = portfolioWindows(portfolios, efficiency.series);
  for (const portfolio of portfolios) {
    const metrics = metricsOf(portfolio);
    const window = metrics ? portfolioWindowFromMetrics(portfolio, metrics) : null;
    if (window) windows.set(portfolio.id, window);
  }
  const names = useMemo(
    () => new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name])),
    [portfolios],
  );
  const cardActions = useMemo(
    () => cardActionsOf(cards.status === 'ready' ? cards.cards : []),
    [cards],
  );
  const name = PLATFORM_NAMES[platform];
  // A row's figures are in its portfolio's currency (a Google account's asset row carries
  // none); the cards, spread over the platform's portfolios, in theirs when they share one.
  const rowCurrency = (portfolio: PortfolioListItem) =>
    portfolio.currency ??
    metricsOf(portfolio)?.currency ??
    accounts.find(
      (account) =>
        portfolio.ad_account_id != null &&
        bareAccountId(account.account_id) === bareAccountId(portfolio.ad_account_id),
    )?.currency ??
    null;
  const dailyTotal = portfolios.reduce((sum, portfolio) => sum + (portfolio.daily_total ?? 0), 0);

  // One paint once every read below has settled: a skeleton that collapses to nothing, or
  // rows that land before the cards, pushed what was already on screen (CLS 0.25 at 375).
  const metricsPending = portfolioIds.some((id) => metricsById.get(id)?.status === 'loading');
  if (
    cards.status === 'loading' ||
    portfoliosQuery.isPending ||
    efficiency.pending ||
    metricsPending
  )
    return null;

  return (
    <>
      {cards.status === 'error' ? (
        <p
          className="px-1 text-muted-foreground text-xs"
          data-testid="platform-cards-error"
          role="status"
        >
          {name}'s recommendations could not be read, so this page cannot say which wait for a
          decision.
        </p>
      ) : cards.status === 'ready' && cards.cards.length > 0 ? (
        <Recommendations
          candidates={cards.cards}
          cardActions={cardActions}
          currency={oneCurrency(portfolios.map(rowCurrency))}
          dailySpend={dailyTotal}
          onOpenPortfolio={onSelectPortfolio}
          platform={platform}
          portfolioNames={names}
        />
      ) : null}

      <OverviewLinks onOpenActions={onOpenActions} onOpenActivity={onOpenActivity} />

      <PortfolioRows
        empty={
          <p className="text-xs text-muted-foreground" data-testid="platform-portfolios-empty">
            No portfolio holds {name} campaigns yet.{' '}
            <button
              className="text-primary-ink hover:underline"
              onClick={onCreatePortfolio}
              type="button"
            >
              Create a portfolio
            </button>
          </p>
        }
        onPrefetchPortfolio={onPrefetchPortfolio}
        onSelectPortfolio={onSelectPortfolio}
        pacingById={pacingById}
        portfolios={portfolios}
        rowCurrency={rowCurrency}
        rowPlatforms={(portfolio) => portfolio.platforms}
        windows={windows}
      />
    </>
  );
}

/** A platform's own tab: its rows of the producer first, then what only that platform's
 *  edge read holds (Google's campaign types, TikTok's snapshots). Before the producer is
 *  deployed, the tab says so and shows today's screen for that platform. TikTok's advertiser
 *  is known only from the producer, so without it the TikTok tab stays "not connected". */
function PlatformTab({
  brandId,
  metrics,
  platform,
  children,
}: {
  brandId: string;
  metrics: AccountPlatformMetricsState;
  platform: Exclude<AdPlatform, 'meta'>;
  /** The tab's Optimizer half: it paints under the read once the read has settled, so the
   *  read landing above it never pushes it down. */
  children?: ReactNode;
}) {
  // One window on the tab: the producer's when it answered, else the same 7 complete days
  // ending yesterday the producer would read.
  const window =
    metrics.status === 'ready'
      ? { since: metrics.metrics.window.since, until: metrics.metrics.window.until }
      : null;
  const fallback =
    platform === 'google_ads' ? (
      <GoogleAdsTab brandId={brandId} window={window}>
        {metrics.status === 'loading' ? null : children}
      </GoogleAdsTab>
    ) : (
      <TikTokAdsTab advertiserId={null} brandId={brandId} />
    );
  if (metrics.status === 'unavailable') {
    return (
      <>
        <MultiPlatformUnavailable
          detail={
            platform === 'google_ads' ? "Below is Google's own read of the account." : undefined
          }
        />
        {fallback}
      </>
    );
  }
  const row = metrics.status === 'ready' ? platformTotals(metrics.metrics, platform) : null;
  if (metrics.status === 'ready' && row?.connected) {
    // Google connected but not yet read by the Optimizer: Google's own read leads in full,
    // under a note that says what it is.
    const googleUnread = platform === 'google_ads' && row.spend == null;
    return (
      <>
        <PlatformMetricsSection
          liveBelow={googleUnread}
          metrics={metrics.metrics}
          platform={platform}
        />
        {platform === 'google_ads' ? (
          <GoogleAdsTab
            brandId={brandId}
            mode={googleUnread ? 'full' : 'breakdown'}
            readingNote={false}
            window={window}
          >
            {children}
          </GoogleAdsTab>
        ) : (
          <TikTokAdsTab advertiserId={row.accounts[0]?.account_id ?? null} brandId={brandId} />
        )}
      </>
    );
  }
  if (metrics.status === 'error') {
    return (
      <>
        <p
          className="px-1 text-muted-foreground text-xs"
          data-testid="multiplatform-error"
          role="status"
        >
          {metrics.message}
        </p>
        {fallback}
      </>
    );
  }
  return fallback;
}
