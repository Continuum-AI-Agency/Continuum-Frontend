'use client';

// Paid Media Optimizer surface — rebuilt from the reference-ui-preview.html
// visual spec as native shadcn/Tailwind + Radix + @bklit charts. Rendered inside
// the Scale page's "Optimizer" (performance) tab slot. Five sub-views
// (Overview / Portfolios / Actions / Automations / Activity) plus an onboarding/empty state when
// the brand has no portfolios yet (or the optimizer backend is not reachable —
// its edge functions deploy later, so reads degrade to onboarding rather than
// erroring). Navigation is URL-backed; authenticated reads use React Query with
// per-surface freshness windows, so re-mounts are fast without a second cache.
//
// The page's second bar lives here (Performance+ "one bar" layout, version A): the sub-view
// tabs on the left, and on the Overview the platform switch and the Overview's own actions on
// the right. The Overview is told so (`chromeInShell`) and leaves both out of its body. No
// state sits in a bordered card: every state paints straight onto the page.

import type { PortfolioListItem } from '@continuum/contracts';
import { ArrowRightIcon, ChevronLeftIcon, FileTextIcon, LayersIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { OptimizerNotificationsSection } from '@/components/settings/account/OptimizerNotificationsSection';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { cn } from '@/lib/utils';
import { pendingWorkCount } from './reportModel';
import { AccountAutomations } from './sections/account/AccountAutomations';
import { jainaWeeklyReportPrompt } from './sections/jainaEntryModel';
import { OptimizerActions } from './sections/OptimizerActions';
import { OptimizerActivity } from './sections/OptimizerActivity';
import { OptimizerOffline } from './sections/OptimizerOffline';
import { OptimizerOnboarding } from './sections/OptimizerOnboarding';
import { OptimizerOtherAccountNotice } from './sections/OptimizerOtherAccountNotice';
import { OptimizerOverview } from './sections/OptimizerOverview';
import { OptimizerPortfolioBrowser } from './sections/OptimizerPortfolioBrowser';
import { OptimizerPortfolios } from './sections/OptimizerPortfolios';
import { PortfolioCreateView } from './sections/PortfolioCreateView';
import { PortfolioDetailWorkspace } from './sections/PortfolioDetailWorkspace';
import { connectedFromMetrics } from './sections/platforms/accountPlatformMetricsModel';
import {
  type AdPlatform,
  connectedPlatforms,
  PLATFORM_TABS,
  type PlatformTab,
  platformTabLabel,
  rendersManagedOverview,
} from './sections/platforms/platformTabsModel';
import { useAccountPlatformMetrics } from './sections/platforms/useAccountPlatformMetrics';
import {
  groupPortfoliosByAccount,
  type PortfolioOpenPlan,
  planPortfolioOpen,
  resolveEmptyPortfolioState,
  resolveHiddenAccounts,
} from './sections/portfolioAccounts';
import {
  useAdAccountCurrency,
  useOptimizerAdAccounts,
  useOptimizerPortfolios,
  useOptimizerRenewals,
  usePrefetchPortfolioDetail,
  useWarmActionsQueue,
} from './useOptimizerData';
import { useOptimizerUrlState } from './useOptimizerUrlState';

type OptimizerTabProps = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  /** Switch the page's selected ad account. Supplied so the "portfolios live on another
   *  ad account" notice can move the user there in one click. */
  onSelectAdAccount?: (adAccountId: string) => void;
};

/** The Actions badge must count what the Actions tab actually renders — recommendations
 *  AND budget moves. Counting recs alone under-reported every money-only cycle. */
function totalPending(portfolios: PortfolioListItem[]): number {
  return portfolios.reduce((sum, portfolio) => sum + pendingWorkCount(portfolio), 0);
}

function OptimizerSkeleton() {
  return (
    <div className="space-y-3 p-2" role="status" aria-busy="true">
      <span className="sr-only">Loading optimizer</span>
      <Skeleton className="h-6 w-56 rounded-md bg-muted/70" />
      <Skeleton className="h-40 rounded-lg bg-muted/70" />
      <div className="space-y-2">
        <Skeleton className="h-16 rounded-lg bg-muted/70" />
        <Skeleton className="h-16 rounded-lg bg-muted/70" />
      </div>
    </div>
  );
}

/** Whether each platform reads as connected for the platform switch. Either source saying so is
 *  enough: the brand's granted accounts, or the multi-platform producer having read it. The
 *  selected account is a Meta account the brand already reads, so Meta is connected even while
 *  the account list is still loading or failed. */
function useConnectedPlatforms(brandId: string, adAccountId: string): Record<AdPlatform, boolean> {
  const accounts = useOptimizerAdAccounts(brandId);
  const metrics = useAccountPlatformMetrics(brandId);
  return useMemo(() => {
    const granted = connectedPlatforms(accounts.data);
    const read = metrics.status === 'ready' ? connectedFromMetrics(metrics.metrics) : null;
    return {
      meta: granted.meta || Boolean(adAccountId) || Boolean(read?.meta),
      google_ads: granted.google_ads || Boolean(read?.google_ads),
      tiktok_ads: granted.tiktok_ads || Boolean(read?.tiktok_ads),
    };
  }, [accounts.data, adAccountId, metrics]);
}

/** All · Meta · Google · TikTok as one segmented control. A platform without a connection stays
 *  and says "Connect" — a missing tab reads as "we don't do TikTok", not "not connected yet". */
function PlatformSwitch({
  value,
  onChange,
  connected,
}: {
  value: PlatformTab;
  onChange: (tab: PlatformTab) => void;
  connected: Record<AdPlatform, boolean>;
}) {
  return (
    <div
      aria-label="Ad platform"
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px]"
      data-testid="platform-tabs"
      role="tablist"
    >
      {PLATFORM_TABS.map((tab) => {
        const active = tab === value;
        const platform = tab === 'all' ? null : tab;
        const disconnected = platform != null && !connected[platform];
        return (
          <button
            aria-selected={active}
            className={cn(
              'inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            data-connected={platform == null ? undefined : String(!disconnected)}
            data-tab={tab}
            data-testid={`platform-tab-${tab}`}
            key={tab}
            onClick={() => onChange(tab)}
            role="tab"
            type="button"
          >
            {platformTabLabel(tab)}
            {disconnected ? (
              <span className="font-normal text-muted-foreground">· Connect</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The Overview's own actions, drawn in the page's second bar. Purple is spent on the decision
 *  (Review) and on the one creating action. */
function OverviewToolbar({
  pendingCount,
  adAccountId,
  onOpenActions,
  onCreatePortfolio,
}: {
  pendingCount: number;
  adAccountId: string;
  onOpenActions: () => void;
  onCreatePortfolio: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-testid="overview-toolbar">
      {pendingCount > 0 ? (
        <Button
          className="h-7 gap-1 bg-primary/10 px-2.5 text-xs text-primary tabular-nums hover:bg-primary/15"
          data-testid="overview-review-pending"
          onClick={onOpenActions}
          size="sm"
          type="button"
          variant="ghost"
        >
          Review {pendingCount}
          <ArrowRightIcon aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}
      {/* The weekly report is a Jaina answer, not a page: the link opens Jaina with the
       *  prepared ask for this account, the way the Overview's questions do. */}
      <a
        className={cn(
          buttonVariants({ size: 'sm', variant: 'secondary' }),
          'h-7 gap-1 px-2.5 text-xs',
        )}
        data-testid="overview-weekly-report"
        href={jainaPromptHref(jainaWeeklyReportPrompt(adAccountId))}
      >
        <FileTextIcon aria-hidden="true" className="size-3.5" />
        Weekly report
      </a>
      <Button
        aria-label="New portfolio"
        className="h-7 gap-1 px-2.5 text-xs"
        onClick={onCreatePortfolio}
        size="sm"
        type="button"
      >
        <PlusIcon aria-hidden="true" className="size-3.5" />
        Portfolio
      </Button>
    </div>
  );
}

function RefreshFailedNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground"
      data-testid="optimizer-refresh-failed"
      role="status"
    >
      Couldn't refresh — showing the last read.
      <Button
        className="h-6 px-1.5 text-xs"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="ghost"
      >
        Retry
      </Button>
    </span>
  );
}

export function OptimizerTab({
  brandId,
  adAccountId,
  platform,
  onSelectAdAccount,
}: OptimizerTabProps) {
  const {
    view,
    portfolioId,
    adsetId,
    metric,
    section,
    openPortfolio,
    closePortfolio,
    openCreate,
    setAdset,
    setMetric,
    range,
    setRange,
    setSection,
    setView,
    platform: platformTab,
    setPlatform,
  } = useOptimizerUrlState();

  const portfoliosQuery = useOptimizerPortfolios(brandId, adAccountId);
  const renewalsQuery = useOptimizerRenewals(brandId);
  const accountsQuery = useOptimizerAdAccounts(brandId);
  const currency = useAdAccountCurrency(brandId, adAccountId);
  const prefetchPortfolioDetail = usePrefetchPortfolioDetail(brandId);
  const warmActionsQueue = useWarmActionsQueue(brandId);
  const connected = useConnectedPlatforms(brandId, adAccountId);

  const portfolios = portfoliosQuery.data;
  const pendingCount = totalPending(portfolios);
  const renewalCount = renewalsQuery.data.length;

  // Only reachable when the selected account has NO portfolios — the tabbed view (and its
  // own scope toggle) never renders in that state, so the notice hands off to here instead.
  const [browsingAllAccounts, setBrowsingAllAccounts] = useState(false);

  const brandPortfolios = portfoliosQuery.brandPortfolios;
  const accounts = accountsQuery.data;
  const brandGroups = useMemo(
    () =>
      groupPortfoliosByAccount({
        portfolios: brandPortfolios,
        accounts,
        selectedAdAccountId: adAccountId,
      }),
    [brandPortfolios, accounts, adAccountId],
  );

  const planOpen = (portfolio: PortfolioListItem): PortfolioOpenPlan =>
    planPortfolioOpen({
      portfolioId: portfolio.id,
      portfolioAccountId: portfolio.ad_account_id,
      selectedAdAccountId: adAccountId,
      accounts,
    });

  // The cross-account open. Switching the ad account is React state on the page shell while
  // the portfolio id is URL state, so both survive the refetch the switch triggers: the new
  // account's list resolves and the detail workspace then finds the id. Ordering matters —
  // the id must be set for the render that lands after the account has moved.
  const handleOpenPlan = (plan: PortfolioOpenPlan) => {
    if (plan.kind === 'unavailable') return;
    if (plan.kind === 'switch-then-open') onSelectAdAccount?.(plan.accountId);
    openPortfolio(plan.portfolioId);
  };

  const handleSelectPortfolio = (portfolioId: string) => {
    openPortfolio(portfolioId);
  };

  // The Automations tab shows autonomy per portfolio but changes it where it has always been
  // changed — the portfolio's own Manage section — so there is one place that writes it.
  const handleManagePortfolio = (portfolioId: string) => {
    openPortfolio(portfolioId, { section: 'manage' });
  };

  // After a portfolio is created + enrolled, land the user on its detail workspace
  // so they watch the first cycle score (the create path already kicked off a run,
  // and the scheduler backstops it) — the natural end of onboarding, instead of an
  // empty Overview. The refetch pulls the new portfolio into the list so detail resolves.
  const handlePortfolioCreated = (portfolioId: string) => {
    void portfoliosQuery.refetch().then(() => openPortfolio(portfolioId));
  };

  if (portfoliosQuery.isLoading) {
    return <OptimizerSkeleton />;
  }

  // The portfolio read errored/timed out with nothing read before → the optimizer backend is
  // unreachable. Show a clear offline state (with retry) rather than a misleading empty state.
  // A failed REFRESH is a different fact: React Query keeps the last answer, so the surface
  // keeps painting it and says so in the header instead of blanking the page.
  if (portfoliosQuery.isError && !portfoliosQuery.hasAnswer) {
    return (
      <div className="min-h-0 overflow-y-auto py-6">
        <OptimizerOffline onRetry={portfoliosQuery.refetch} />
      </div>
    );
  }

  // No portfolios yet → onboarding path. It gets the same full-height, single-scroll shell the
  // detail workspace below uses. It used to be `overflow-y-auto` here AND `max-h-[60vh]
  // overflow-y-auto` inside the ad-set picker: two scrollbars competing over the same gesture.
  // Onboarding owns its own scroll region now, and this container owns none.
  // An empty list is TWO different facts. When the brand owns portfolios that this ad
  // account view filtered out, saying "set up the optimizer" hides real work — name the
  // owning account instead and offer the switch.
  if (
    portfolios.length === 0 &&
    resolveEmptyPortfolioState({
      brandPortfolioCount: portfoliosQuery.brandPortfolioCount,
      otherAccountIds: portfoliosQuery.otherAccountIds,
    }) === 'other-account'
  ) {
    if (browsingAllAccounts) {
      return (
        <section className="grid h-full min-h-0 animate-in grid-rows-[auto_minmax(0,1fr)] overflow-hidden fade-in-0 duration-200 motion-reduce:animate-none">
          <SectionHeader
            className="border-border/60 px-[var(--app-shell-pad-inline)]"
            title={
              <span className="inline-flex items-center gap-2">
                <LayersIcon className="size-4" aria-hidden="true" />
                All portfolios
              </span>
            }
            action={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => setBrowsingAllAccounts(false)}
              >
                <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
                Back
              </Button>
            }
          />
          <div className="min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] py-3">
            <OptimizerPortfolioBrowser
              groups={brandGroups}
              planOpen={planOpen}
              onOpen={handleOpenPlan}
            />
          </div>
        </section>
      );
    }

    return (
      <section className="grid h-full min-h-0 animate-in place-items-center overflow-y-auto fade-in-0 duration-200 motion-reduce:animate-none">
        <OptimizerOtherAccountNotice
          hiddenCount={portfoliosQuery.brandPortfolioCount}
          accounts={resolveHiddenAccounts(portfoliosQuery.otherAccountIds, accountsQuery.data)}
          onSwitchAccount={onSelectAdAccount}
          onBrowseAll={() => setBrowsingAllAccounts(true)}
        />
      </section>
    );
  }

  if (portfolios.length === 0) {
    return (
      <section className="grid h-full min-h-0 animate-in overflow-hidden fade-in-0 duration-200 motion-reduce:animate-none">
        <OptimizerOnboarding
          brandId={brandId}
          adAccountId={adAccountId}
          platform={platform}
          currency={currency}
          onCreated={handlePortfolioCreated}
        />
      </section>
    );
  }

  // The create view is its own full-height page state, not a sheet — and it wins over
  // an open portfolio so a deep-linked `?optimizerView=create` always lands here.
  if (view === 'create') {
    return (
      <section className="grid h-full min-h-0 overflow-hidden">
        <PortfolioCreateView
          adAccountId={adAccountId}
          brandId={brandId}
          currency={currency}
          onBack={() => setView('portfolios')}
          onCreated={handlePortfolioCreated}
        />
      </section>
    );
  }

  // A portfolio opened for full-screen detail replaces the tab body with its own
  // command-center workspace (hero timeline + drill-ins). Guarded by find() so a
  // stale id (e.g. after an account switch) falls back to the tabbed view.
  const detailPortfolio = portfolioId
    ? portfolios.find((portfolio) => portfolio.id === portfolioId)
    : undefined;
  if (detailPortfolio) {
    // One shrinkable column: a grid item's min-width is its content's by default, so without
    // `minmax(0,1fr)` the widest table in the workspace sized the whole tab past a phone's
    // viewport and this section's overflow-hidden clipped the right edge off every block.
    return (
      <section className="fade-in-0 grid h-full min-h-0 animate-in grid-cols-[minmax(0,1fr)] overflow-hidden duration-200 motion-reduce:animate-none">
        <PortfolioDetailWorkspace
          adAccountId={adAccountId}
          brandId={brandId}
          currency={currency}
          chartMetric={metric}
          onClose={closePortfolio}
          onMetricChange={setMetric}
          onRangeChange={setRange}
          onSectionChange={setSection}
          onSelectAdset={setAdset}
          portfolio={detailPortfolio}
          range={range}
          section={section}
          selectedAdsetId={adsetId}
        />
      </section>
    );
  }

  const showsOverviewChrome = view === 'overview';
  // The line variant hangs its underline 5px below the trigger; here it sits on the bar's hairline.
  const subTab = 'h-9 flex-none px-0 text-xs group-data-horizontal/tabs:after:bottom-0';
  return (
    // One shrinkable column (a grid item is otherwise as wide as its widest content). On a phone
    // the bar wraps and the five tabs scroll inside it: the tab list alone is wider than a 390px
    // screen, and it used to widen the whole surface past the viewport.
    <Tabs
      value={view}
      onValueChange={(value) => setView(value as typeof view)}
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden"
    >
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-border/60 border-b px-[var(--app-shell-pad-inline)] pb-1.5 sm:pb-0"
        data-testid="optimizer-subnav"
      >
        <div className="flex min-w-0 max-w-full items-center gap-3 overflow-x-auto">
          <TabsList variant="line" className="h-9 gap-4 p-0">
            <TabsTrigger value="overview" className={subTab}>
              Overview
            </TabsTrigger>
            <TabsTrigger value="portfolios" className={subTab}>
              Portfolios
            </TabsTrigger>
            <TabsTrigger
              value="actions"
              className={subTab}
              onMouseEnter={() => warmActionsQueue(portfolios)}
              onFocus={() => warmActionsQueue(portfolios)}
            >
              Actions
              {pendingCount + renewalCount > 0 ? (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-2xs font-semibold text-primary-foreground tabular-nums">
                  {pendingCount + renewalCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="automations" className={subTab}>
              Automations
            </TabsTrigger>
            <TabsTrigger value="logs" className={subTab}>
              Activity
            </TabsTrigger>
          </TabsList>
          {portfoliosQuery.isError ? (
            <RefreshFailedNotice onRetry={() => void portfoliosQuery.refetch()} />
          ) : null}
        </div>
        {showsOverviewChrome ? (
          <div className="ms-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
            <PlatformSwitch connected={connected} onChange={setPlatform} value={platformTab} />
            {rendersManagedOverview(platformTab) ? (
              <OverviewToolbar
                adAccountId={adAccountId}
                onCreatePortfolio={openCreate}
                onOpenActions={() => setView('actions')}
                pendingCount={pendingCount}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <TabsContent
        value="automations"
        className="min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] py-3"
      >
        <AccountAutomations
          adAccountId={adAccountId}
          brandId={brandId}
          onManagePortfolio={handleManagePortfolio}
          portfolios={portfolios}
        />
      </TabsContent>

      <TabsContent
        value="overview"
        className="min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] py-3"
      >
        <OptimizerOverview
          adAccountId={adAccountId}
          brandId={brandId}
          portfolios={portfolios}
          pendingCount={pendingCount}
          currency={currency}
          onOpenActions={() => setView('actions')}
          onSelectPortfolio={handleSelectPortfolio}
          onCreatePortfolio={openCreate}
          onPrefetchPortfolio={prefetchPortfolioDetail}
          chromeInShell
        />
      </TabsContent>

      <TabsContent
        value="portfolios"
        className="min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] py-3"
      >
        <OptimizerPortfolios
          brandId={brandId}
          adAccountId={adAccountId}
          portfolios={portfolios}
          currency={currency}
          onCreate={openCreate}
          onOpenDetail={openPortfolio}
          onPrefetchPortfolio={prefetchPortfolioDetail}
          brandGroups={brandGroups}
          brandPortfolioCount={portfoliosQuery.brandPortfolioCount}
          planOpen={planOpen}
          onOpenAcrossAccounts={handleOpenPlan}
        />
      </TabsContent>

      <TabsContent
        value="actions"
        className="min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] py-3"
      >
        <OptimizerActions
          brandId={brandId}
          adAccountId={adAccountId}
          portfolios={portfolios}
          renewals={renewalsQuery.data}
          onBrowsePortfolios={() => setView('portfolios')}
        />
      </TabsContent>

      <TabsContent
        value="logs"
        className="min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] py-3"
      >
        <OptimizerActivity brandId={brandId} currency={currency} />
        <div className="mt-4 border-t border-border/60 pt-4">
          <SectionHeader title="Notifications" />
          <p className="mt-2 text-xs text-muted-foreground">
            Get a Slack message when the optimizer moves budget, instead of checking this log.
          </p>
          <div className="mt-3">
            <OptimizerNotificationsSection brandId={brandId} />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
