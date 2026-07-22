'use client';

// Paid Media Optimizer surface — rebuilt from the reference-ui-preview.html
// visual spec as native shadcn/Tailwind + Radix + @bklit charts. Rendered inside
// the Scale page's "Optimization" (performance) tab slot. Four sub-views
// (Overview / Portfolios / Actions / Logs) plus an onboarding/empty state when
// the brand has no portfolios yet (or the optimizer backend is not reachable —
// its edge functions deploy later, so reads degrade to onboarding rather than
// erroring). Navigation is URL-backed; authenticated reads use React Query with
// per-surface freshness windows, so re-mounts are fast without a second cache.

import type { PortfolioListItem } from '@continuum/contracts';
import {
  ChevronLeftIcon,
  GaugeCircleIcon,
  LayersIcon,
  ListChecksIcon,
  RefreshCwIcon,
  ScrollTextIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { OptimizerActions } from './sections/OptimizerActions';
import { OptimizerLogs } from './sections/OptimizerLogs';
import { OptimizerOffline } from './sections/OptimizerOffline';
import { OptimizerOnboarding } from './sections/OptimizerOnboarding';
import { OptimizerOtherAccountNotice } from './sections/OptimizerOtherAccountNotice';
import { OptimizerOverview } from './sections/OptimizerOverview';
import { OptimizerPortfolioBrowser } from './sections/OptimizerPortfolioBrowser';
import { OptimizerPortfolios } from './sections/OptimizerPortfolios';
import { PortfolioCreateView } from './sections/PortfolioCreateView';
import { PortfolioDetailWorkspace } from './sections/PortfolioDetailWorkspace';
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

function totalPending(portfolios: PortfolioListItem[]): number {
  return portfolios.reduce((sum, portfolio) => sum + portfolio.pending_recommendations, 0);
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
    setSection,
    setView,
  } = useOptimizerUrlState();

  const portfoliosQuery = useOptimizerPortfolios(brandId, adAccountId);
  const renewalsQuery = useOptimizerRenewals(brandId);
  const accountsQuery = useOptimizerAdAccounts(brandId);
  const currency = useAdAccountCurrency(brandId, adAccountId);
  const prefetchPortfolioDetail = usePrefetchPortfolioDetail(brandId);
  const warmActionsQueue = useWarmActionsQueue(brandId);

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

  // The portfolio read errored/timed out → the optimizer backend is unreachable.
  // Show a clear offline state (with retry) rather than a misleading empty state.
  if (portfoliosQuery.isError) {
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
        <section className="grid h-full min-h-0 animate-in grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background fade-in-0 duration-200 motion-reduce:animate-none">
          <SectionHeader
            className="bg-muted/10"
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
          <div className="min-h-0 overflow-y-auto p-2">
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
      <section className="grid h-full min-h-0 animate-in place-items-center overflow-y-auto rounded-lg border border-border/70 bg-background fade-in-0 duration-200 motion-reduce:animate-none">
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
      <section className="grid h-full min-h-0 animate-in overflow-hidden rounded-lg border border-border/70 bg-background fade-in-0 duration-200 motion-reduce:animate-none">
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
      <section className="grid h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background">
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
    return (
      <section className="grid h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background">
        <PortfolioDetailWorkspace
          adAccountId={adAccountId}
          brandId={brandId}
          currency={currency}
          chartMetric={metric}
          onClose={closePortfolio}
          onMetricChange={setMetric}
          onSectionChange={setSection}
          onSelectAdset={setAdset}
          portfolio={detailPortfolio}
          section={section}
          selectedAdsetId={adsetId}
        />
      </section>
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background">
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as typeof view)}
        className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
      >
        <SectionHeader
          className="bg-muted/10"
          title={
            <span className="inline-flex items-center gap-2">
              <GaugeCircleIcon className="size-4" aria-hidden="true" />
              Optimizer
            </span>
          }
          action={
            <TabsList className="h-8">
              <TabsTrigger value="overview" className="gap-1.5 px-3 text-xs">
                <LayersIcon className="size-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="portfolios" className="gap-1.5 px-3 text-xs">
                <RefreshCwIcon className="size-3.5" />
                Portfolios
              </TabsTrigger>
              <TabsTrigger
                value="actions"
                className="gap-1.5 px-3 text-xs"
                onMouseEnter={() => warmActionsQueue(portfolios)}
                onFocus={() => warmActionsQueue(portfolios)}
              >
                <ListChecksIcon className="size-3.5" />
                Actions
                {pendingCount + renewalCount > 0 ? (
                  <span className="ml-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-3xs font-semibold text-primary-foreground">
                    {pendingCount + renewalCount}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="logs" className="gap-1.5 px-3 text-xs">
                <ScrollTextIcon className="size-3.5" />
                Logs
              </TabsTrigger>
            </TabsList>
          }
        />

        <TabsContent value="overview" className="min-h-0 overflow-y-auto p-2">
          <OptimizerOverview
            portfolios={portfolios}
            pendingCount={pendingCount}
            currency={currency}
            onOpenActions={() => setView('actions')}
            onSelectPortfolio={handleSelectPortfolio}
            onCreatePortfolio={openCreate}
            onPrefetchPortfolio={prefetchPortfolioDetail}
          />
        </TabsContent>

        <TabsContent value="portfolios" className="min-h-0 overflow-y-auto p-2">
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

        <TabsContent value="actions" className="min-h-0 overflow-y-auto p-2">
          <OptimizerActions
            brandId={brandId}
            adAccountId={adAccountId}
            portfolios={portfolios}
            renewals={renewalsQuery.data}
            onBrowsePortfolios={() => setView('portfolios')}
          />
        </TabsContent>

        <TabsContent value="logs" className="min-h-0 overflow-y-auto p-2">
          <OptimizerLogs brandId={brandId} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
