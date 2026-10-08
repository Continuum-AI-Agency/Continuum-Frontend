'use client';

// Overview — the optimizer's front page, as the Performance+ redesign orders it (proposal O1,
// docs/performance-plus-redesign/overview.html). Above the fold, in this order and nothing
// else: one sentence with figures (what the account spent over the window, what each result
// kind cost against its target, how many decisions wait); a sub-line with the window and when
// the read was taken; the band that asks Jaina; four to six tiles whose top border is a state;
// the recommendation cards in impact order with the lead marked; and the portfolios as
// one-line rows, sortable by distance to target.
//
// Nothing here is a chart and nothing is prose written by a model. The sentence and the tiles
// are composed from the same typed rows — the portfolio list and the optimizer's own
// efficiency series per portfolio — in ./account/overviewModel.ts, so a figure in the sentence
// is always one the reader can find again in a tile or a row. The cards come from today's
// account read; the read's own narrative, its footnotes and its charts are not shown.
//
// Above all of it sits the platform tab row (All · Meta · Google · TikTok, kept in ?platform=,
// docs/optimizer-multiplatform/frontend.html §2). "All" is the MP1 frame: its sentence and
// tiles come from ONE producer, public.optimizer_get_account_platform_metrics, so they span the
// three platforms without adding two currencies or two result kinds together. "Meta" is the O1
// above, unchanged. Google and TikTok lead with their own rows of the same producer, then what
// only that platform's own read holds (Google's campaign types, TikTok's snapshots and top ad
// groups). Until that RPC is deployed every tab says so plainly, and "All" falls back to today's
// Meta O1. Under its tiles "All" may show the platforms side by side (MP3), which a viewer can
// hide; each portfolio row carries one chip per platform it holds members on.

import type { AccountCandidate, PortfolioListItem } from '@continuum/contracts';
import { applyApprovals } from '@continuum/contracts';
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, FileTextIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { cn } from '@/lib/utils';
import { KpiTile } from '../components/KpiTile';
import { figureProps, formatCpa, formatCurrency } from '../format';
import { pendingWorkCount } from '../reportModel';
import * as typeScale from '../typeScale';
import {
  useAccountApprovals,
  useOptimizerAccountRead,
  useOptimizerAdAccounts,
  useOptimizerPortfolioEfficiency,
  useRequestAccountRead,
} from '../useOptimizerData';
import { useOptimizerUrlState } from '../useOptimizerUrlState';
import { AccountRead } from './account/AccountRead';
import { AccountReadFreshness } from './account/AccountReadFreshness';
import {
  accountSpend,
  autopilotSummary,
  decisionsLabel,
  headlineClauses,
  joinClauses,
  latestCycle,
  type PortfolioWindow,
  portfolioWindow,
  type ResultKind,
  type RowSortDir,
  type RowSortKey,
  resultKinds,
  sortPortfolioRows,
  spendState,
  WINDOW_DAYS,
  windowLabel,
} from './account/overviewModel';
import { JainaEntryChips } from './JainaEntryChips';
import { jainaTabEntryPrompts, jainaWeeklyReportPrompt } from './jainaEntryModel';
import { PortfolioRowCard } from './PortfolioRowCard';
import type { PlatformCardAction } from './platformCards/platformCardActionModel';
import {
  AllPlatformsHeadline,
  AllPlatformsSubline,
  AllPlatformsTiles,
  PlatformMetricsSection,
} from './platforms/AccountPlatformsOverview';
import { connectedFromMetrics, platformTotals } from './platforms/accountPlatformMetricsModel';
import { GoogleAdsTab } from './platforms/GoogleAdsTab';
import { MultiPlatformUnavailable } from './platforms/MultiPlatformUnavailable';
import { PlatformComparisonRow } from './platforms/PlatformComparisonRow';
import { PlatformTabs } from './platforms/PlatformTabs';
import {
  type AdPlatform,
  connectedPlatforms,
  OPTIMIZER_MANAGED_PLATFORM,
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
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
  onPrefetchPortfolio?: (portfolioId: string) => void;
};

/** The tile's second line for one result kind: cost, target, and last week — or why not. */
export function kindTileSub(kind: ResultKind, currency: string | null | undefined): string {
  if (kind.costPerResult == null) {
    return kind.spend > 0 ? `${formatCurrency(kind.spend, currency)} no results` : 'no spend';
  }
  const parts = [formatCpa(kind.costPerResult, currency)];
  if (kind.targetRange == null) parts.push('no target');
  else if (kind.targetRange.min === kind.targetRange.max)
    parts.push(`target ${formatCpa(kind.targetRange.min, currency)}`);
  else
    parts.push(
      `target ${formatCpa(kind.targetRange.min, currency)}–${formatCpa(kind.targetRange.max, currency)}`,
    );
  if (kind.priorCostPerResult != null)
    parts.push(`prev. week ${formatCpa(kind.priorCostPerResult, currency)}`);
  return parts.join(' · ');
}

/** The tile's second line for autopilot: who only recommends, or what is stopped. */
export function autopilotTileSub(summary: ReturnType<typeof autopilotSummary>): string {
  if (summary.paused > 0) return `${summary.paused} paused`;
  if (summary.recommending.length === 0) return 'all apply on their own';
  if (summary.recommending.length <= 2)
    return `${summary.recommending.join(' and ')} ${summary.recommending.length === 1 ? 'recommends, does not apply' : 'recommend, do not apply'}`;
  return `${summary.recommending.length} recommend, do not apply`;
}

/** Candidate id → the action its platform card hands a person, exactly as the read carries it
 *  (`card_action`: the pending recommendation, its portfolio and the engine's action). A card
 *  without one shows no control of its own. */
export function cardActionsOf(
  candidates: readonly AccountCandidate[],
): ReadonlyMap<string, PlatformCardAction> {
  const actions = new Map<string, PlatformCardAction>();
  for (const candidate of candidates) {
    const target = candidate.card_action;
    if (!target) continue;
    actions.set(candidate.id, {
      portfolioId: target.portfolio_id,
      action: target.action,
      recommendationId: target.recommendation_id,
    });
  }
  return actions;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function OptimizerOverview({
  brandId,
  adAccountId,
  portfolios,
  pendingCount,
  currency,
  onOpenActions,
  onSelectPortfolio,
  onCreatePortfolio,
  onPrefetchPortfolio,
}: OptimizerOverviewProps) {
  const [sortKey, setSortKey] = useState<RowSortKey>('distance');
  const [sortDir, setSortDir] = useState<RowSortDir>('asc');
  const portfolioIds = useMemo(() => portfolios.map((portfolio) => portfolio.id), [portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(portfolioIds);
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

  const windows = useMemo(() => {
    const byId = new Map<string, PortfolioWindow>();
    portfolios.forEach((portfolio, index) => {
      const window = portfolioWindow(portfolio, efficiency.series[index] ?? []);
      if (window) byId.set(portfolio.id, window);
    });
    return byId;
  }, [portfolios, efficiency.series]);
  const names = useMemo(
    () => new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name])),
    [portfolios],
  );

  const spend = accountSpend(windows);
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
  const clauses = headlineClauses(kinds, (value) => formatCpa(value, currency), names);
  const sorted = sortPortfolioRows(portfolios, windows, sortKey, sortDir);

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
  const jainaBand = (
    <JainaEntryChips entries={jainaEntries} label="Ask Jaina" platform={jainaPlatform} />
  );

  const portfolioNoun = portfolios.length === 1 ? 'portfolio' : 'portfolios';

  // Every brand gets the four tabs: a missing Google or TikTok tab reads as "we don't do
  // Google", where a tab that says Connect reads as "you haven't connected it yet".
  const tabs = <PlatformTabs connected={connected} onChange={setPlatform} value={platformTab} />;
  if (!rendersManagedOverview(platformTab)) {
    return (
      <div className="space-y-3" data-platform-tab={platformTab} data-testid="optimizer-overview">
        {tabs}
        {jainaBand}
        <PlatformTab
          brandId={brandId}
          metrics={platformMetrics}
          onCreatePortfolio={onCreatePortfolio}
          platform={platformTab}
        />
      </div>
    );
  }

  // "All" reads the producer; "Meta" is today's O1 whatever the producer says.
  const allFrame = platformTab === 'all' ? platformMetrics : null;
  const multiplatform = allFrame?.status === 'ready' ? allFrame.metrics : null;

  return (
    <div className="space-y-3" data-platform-tab={platformTab} data-testid="optimizer-overview">
      {tabs}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold text-foreground" data-testid="book-line">
          {portfolios.length} {portfolioNoun} · {book.managed}{' '}
          {book.managed === 1 ? 'ad set' : 'ad sets'}
          {book.gone > 0 ? (
            <span className="font-normal text-muted-foreground"> · {book.gone} lost</span>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
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
      </div>

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
      <section className="space-y-1 px-1" data-testid="overview-hero">
        {multiplatform ? (
          <AllPlatformsHeadline metrics={multiplatform} />
        ) : allFrame?.status === 'loading' ? (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-muted-foreground`}
            data-pending="true"
            data-testid="overview-headline"
          >
            Reading the account across platforms…
          </p>
        ) : efficiency.failed > 0 && !efficiency.pending ? (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-muted-foreground`}
            data-incomplete="true"
            data-testid="overview-headline"
          >
            Could not read the cycle of {efficiency.failed}{' '}
            {efficiency.failed === 1 ? 'portfolio' : 'portfolios'}, so the account figure is
            incomplete.{' '}
            <button
              className="text-primary underline-offset-2 hover:underline"
              data-testid="overview-retry"
              onClick={efficiency.retryFailed}
              type="button"
            >
              Retry
            </button>
          </p>
        ) : spend ? (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-foreground`}
            data-testid="overview-headline"
          >
            The account spent{' '}
            <span
              className="tabular-nums"
              {...figureProps('overview.spend', spend.spend, currency, 'd7')}
            >
              {formatCurrency(spend.spend, currency)}
            </span>{' '}
            in {WINDOW_DAYS} days
            {clauses.length > 0 ? ': ' : '.'}
            {clauses.map((clause, index) => (
              <span key={clause.kind.kind}>
                {index > 0 ? (index === clauses.length - 1 ? ' and ' : ', ') : ''}
                {clause.shape === 'cost' ? (
                  <>
                    {clause.kind.words.many} at{' '}
                    <span
                      className="tabular-nums"
                      {...figureProps(
                        `overview.kind.${clause.kind.kind}.cost`,
                        clause.kind.costPerResult,
                        currency,
                        'd7',
                      )}
                    >
                      {clause.cost}
                    </span>{' '}
                    ({clause.distance})
                  </>
                ) : (
                  <>
                    <span
                      className="tabular-nums"
                      {...figureProps(
                        `overview.kind.${clause.kind.kind}.results`,
                        clause.kind.results,
                        null,
                        'd7',
                        'count',
                      )}
                    >
                      {clause.count}
                    </span>
                    {clause.where ? ` in ${clause.where}` : ''}
                  </>
                )}
              </span>
            ))}
            {clauses.length > 0 ? '. ' : ' '}
            <span className="tabular-nums" data-testid="overview-decisions">
              {capitalise(decisionsLabel(pendingCount))}.
            </span>
          </p>
        ) : (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-muted-foreground`}
            data-pending={efficiency.pending ? 'true' : undefined}
            data-testid="overview-headline"
          >
            {efficiency.pending
              ? "Reading the account's cycles…"
              : `No portfolio has a measured cycle yet. ${capitalise(decisionsLabel(pendingCount))}.`}
          </p>
        )}
        {/* 2 — the sub-line: the window the figures cover, and when the read was taken. */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          data-testid="overview-subline"
        >
          {multiplatform ? (
            <AllPlatformsSubline metrics={multiplatform} />
          ) : window ? (
            <span data-testid="overview-window">{window}</span>
          ) : null}
          {(multiplatform || window) && accountRead.data ? <span aria-hidden="true">·</span> : null}
          {accountRead.data ? (
            <AccountReadFreshness
              error={requestRead.error instanceof Error ? requestRead.error.message : null}
              onRequest={() => requestRead.mutate()}
              readyAt={accountRead.data.ready_at}
              refresh={accountRead.data.refresh}
              requesting={requestRead.isPending}
              utcDay={accountRead.data.utc_day}
            />
          ) : null}
        </div>
      </section>

      {/* 3 — the band that asks Jaina, with the questions of the tab a person is on. */}
      {jainaBand}

      {/* 4 — the radiography: four to six tiles, each with a state on its top border. */}
      {multiplatform ? (
        <AllPlatformsTiles metrics={multiplatform} onOpenActions={onOpenActions} />
      ) : allFrame?.status === 'loading' ? null : (
        <div
          className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6"
          data-testid="account-tiles"
        >
          <KpiTile
            figure={figureProps('tiles.spend', spend?.spend ?? null, currency, 'd7')}
            label={`Spend · ${WINDOW_DAYS} days`}
            state={complete && spend ? spendState(spend.spend / WINDOW_DAYS, dailyTotal) : 'none'}
            sub={
              !complete
                ? `incomplete read · plan ${formatCurrency(dailyTotal, currency)} per day`
                : spend
                  ? `${formatCurrency(spend.spend / WINDOW_DAYS, currency)} per day · plan ${formatCurrency(dailyTotal, currency)}`
                  : `plan ${formatCurrency(dailyTotal, currency)} per day`
            }
            testId="tile-spend"
            value={complete && spend ? formatCurrency(spend.spend, currency) : '—'}
          />
          {kinds.slice(0, MAX_KIND_TILES).map((kind) => (
            <KpiTile
              figure={figureProps(`tiles.kind.${kind.kind}`, kind.results, null, 'd7', 'count')}
              key={kind.kind}
              label={capitalise(kind.words.many)}
              state={kind.state}
              sub={kindTileSub(kind, currency)}
              testId={`tile-kind-${kind.kind}`}
              value={kind.results.toLocaleString('en-US')}
            />
          ))}
          <KpiTile
            action={
              pendingCount > 0 ? (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={onOpenActions}
                  type="button"
                >
                  Review
                </button>
              ) : null
            }
            figure={figureProps('tiles.decisions-waiting', pendingCount, null, 'none', 'count')}
            label="Decisions"
            sub={
              pendingCount > 0
                ? `in ${portfoliosWithDecisions} ${portfoliosWithDecisions === 1 ? 'portfolio' : 'portfolios'}`
                : 'nothing waits for your decision'
            }
            testId="tile-decisions"
            value={String(pendingCount)}
          />
          <KpiTile
            figure={figureProps('tiles.on-autopilot', autopilot.autopilot, null, 'none', 'count')}
            label="Autopilot"
            state={autopilot.paused > 0 ? 'warn' : 'none'}
            sub={autopilotTileSub(autopilot)}
            testId="tile-autopilot"
            value={`${autopilot.autopilot} of ${autopilot.total}`}
          />
        </div>
      )}

      {/* 4b — the platforms side by side (MP3): optional, hidden per viewer. */}
      {multiplatform ? <PlatformComparisonRow metrics={multiplatform} /> : null}

      {/* 5 — the recommendation cards, in impact order, the lead marked. */}
      {shown ? (
        <section className="space-y-2" data-testid="overview-recommendations">
          <p className={`${typeScale.label} px-1 font-semibold text-muted-foreground`}>
            Jaina&apos;s recommendations
          </p>
          <AccountRead
            candidates={[...shown.candidates, ...shown.guards]}
            cardActions={cardActions}
            currency={shown.currency ?? currency ?? null}
            dailySpend={shown.scale_per_day ?? dailyTotal}
            onOpenPortfolio={onSelectPortfolio}
            platform={OPTIMIZER_MANAGED_PLATFORM}
            portfolioNames={names}
          />
        </section>
      ) : null}

      {/* 6 — the portfolios, one line each, sortable by distance to target. */}
      <section className="space-y-2" data-testid="portfolio-rows">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className={`${typeScale.label} font-semibold text-muted-foreground`}>Portfolios</p>
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              aria-label="Sort portfolios by"
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
        </div>
        <div className="space-y-1.5">
          {sorted.map((portfolio) => (
            <PortfolioRowCard
              currency={currency}
              key={portfolio.id}
              onPrefetch={onPrefetchPortfolio ? () => onPrefetchPortfolio(portfolio.id) : undefined}
              onSelect={() => onSelectPortfolio(portfolio.id)}
              platform={OPTIMIZER_MANAGED_PLATFORM}
              platforms={memberPlatforms(
                memberStates.get(portfolio.id),
                OPTIMIZER_MANAGED_PLATFORM,
              )}
              portfolio={portfolio}
              window={windows.get(portfolio.id) ?? null}
            />
          ))}
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground">No portfolios yet.</p>
          ) : null}
        </div>
      </section>
    </div>
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
  onCreatePortfolio,
}: {
  brandId: string;
  metrics: AccountPlatformMetricsState;
  platform: Exclude<AdPlatform, 'meta'>;
  onCreatePortfolio: () => void;
}) {
  // One window on the tab: the producer's when it answered, else the same 7 complete days
  // ending yesterday the producer would read.
  const window =
    metrics.status === 'ready'
      ? { since: metrics.metrics.window.since, until: metrics.metrics.window.until }
      : null;
  const fallback =
    platform === 'google_ads' ? (
      <GoogleAdsTab brandId={brandId} onCreatePortfolio={onCreatePortfolio} window={window} />
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
          onCreatePortfolio={onCreatePortfolio}
          platform={platform}
        />
        {platform === 'google_ads' ? (
          <GoogleAdsTab
            brandId={brandId}
            mode={googleUnread ? 'full' : 'breakdown'}
            readingNote={false}
            window={window}
          />
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
