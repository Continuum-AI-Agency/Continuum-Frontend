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
  GaugeCircleIcon,
  LayersIcon,
  ListChecksIcon,
  RefreshCwIcon,
  ScrollTextIcon,
} from 'lucide-react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { OptimizerActions } from './sections/OptimizerActions';
import { OptimizerLogs } from './sections/OptimizerLogs';
import { OptimizerOffline } from './sections/OptimizerOffline';
import { OptimizerOnboarding } from './sections/OptimizerOnboarding';
import {
  OptimizerOtherAccountNotice,
  resolveEmptyPortfolioState,
  resolveHiddenAccounts,
} from './sections/OptimizerOtherAccountNotice';
import { OptimizerOverview } from './sections/OptimizerOverview';
import { OptimizerPortfolios } from './sections/OptimizerPortfolios';
import { PortfolioDetailWorkspace } from './sections/PortfolioDetailWorkspace';
import {
  useAdAccountCurrency,
  useOptimizerAdAccounts,
  useOptimizerPortfolios,
  useOptimizerRenewals,
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
    openPortfolio,
    closePortfolio,
    setAdset,
    setMetric,
    setView,
  } = useOptimizerUrlState();

  const portfoliosQuery = useOptimizerPortfolios(brandId, adAccountId);
  const renewalsQuery = useOptimizerRenewals(brandId);
  const accountsQuery = useOptimizerAdAccounts(brandId);
  const currency = useAdAccountCurrency(brandId, adAccountId);

  const portfolios = portfoliosQuery.data;
  const pendingCount = totalPending(portfolios);
  const renewalCount = renewalsQuery.data.length;

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
    return (
      <section className="grid h-full min-h-0 animate-in place-items-center overflow-y-auto rounded-lg border border-border/70 bg-background fade-in-0 duration-200 motion-reduce:animate-none">
        <OptimizerOtherAccountNotice
          hiddenCount={portfoliosQuery.brandPortfolioCount}
          accounts={resolveHiddenAccounts(portfoliosQuery.otherAccountIds, accountsQuery.data)}
          onSwitchAccount={onSelectAdAccount}
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
          onSelectAdset={setAdset}
          portfolio={detailPortfolio}
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
              <TabsTrigger value="actions" className="gap-1.5 px-3 text-xs">
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

        <TabsContent
          value="overview"
          className="min-h-0 animate-in fade-in-0 overflow-y-auto p-2 duration-200 motion-reduce:animate-none"
        >
          <OptimizerOverview
            portfolios={portfolios}
            pendingCount={pendingCount}
            currency={currency}
            onOpenActions={() => setView('actions')}
            onSelectPortfolio={handleSelectPortfolio}
          />
        </TabsContent>

        <TabsContent
          value="portfolios"
          className="min-h-0 animate-in fade-in-0 overflow-y-auto p-2 duration-200 motion-reduce:animate-none"
        >
          <OptimizerPortfolios
            brandId={brandId}
            adAccountId={adAccountId}
            portfolios={portfolios}
            currency={currency}
            onCreated={handlePortfolioCreated}
            onOpenDetail={openPortfolio}
          />
        </TabsContent>

        <TabsContent
          value="actions"
          className="min-h-0 animate-in fade-in-0 overflow-y-auto p-2 duration-200 motion-reduce:animate-none"
        >
          <OptimizerActions
            brandId={brandId}
            adAccountId={adAccountId}
            portfolios={portfolios}
            renewals={renewalsQuery.data}
          />
        </TabsContent>

        <TabsContent
          value="logs"
          className="min-h-0 animate-in fade-in-0 overflow-y-auto p-2 duration-200 motion-reduce:animate-none"
        >
          <OptimizerLogs brandId={brandId} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
