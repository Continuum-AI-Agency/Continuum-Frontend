'use client';

// Paid Media Optimizer surface — rebuilt from the reference-ui-preview.html
// visual spec as native shadcn/Tailwind + Radix + @bklit charts. Rendered inside
// the Scale page's "Optimization" (performance) tab slot. Four sub-views
// (Overview / Portfolios / Actions / Logs) plus an onboarding/empty state when
// the brand has no portfolios yet (or the optimizer backend is not reachable —
// its edge functions deploy later, so reads degrade to onboarding rather than
// erroring). View state + the read datasets live in the optimizer Zustand store
// (30-min TTL) so re-mounting the tab does not re-fetch every time.

import type { PortfolioListItem } from '@continuum/contracts';
import {
  GaugeCircleIcon,
  LayersIcon,
  ListChecksIcon,
  RefreshCwIcon,
  ScrollTextIcon,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOptimizerStore } from '@/lib/paid-media/optimizerStore';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { OptimizerActions } from './sections/OptimizerActions';
import { OptimizerLogs } from './sections/OptimizerLogs';
import { OptimizerOffline } from './sections/OptimizerOffline';
import { OptimizerOnboarding } from './sections/OptimizerOnboarding';
import { OptimizerOverview } from './sections/OptimizerOverview';
import { OptimizerPortfolios } from './sections/OptimizerPortfolios';
import { PortfolioDetailWorkspace } from './sections/PortfolioDetailWorkspace';
import {
  useAdAccountCurrency,
  useOptimizerPortfolios,
  useOptimizerRenewals,
} from './useOptimizerData';

type OptimizerTabProps = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
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

export function OptimizerTab({ brandId, adAccountId, platform }: OptimizerTabProps) {
  const {
    view,
    setView,
    selectedPortfolioId,
    setSelectedPortfolioId,
    detailPortfolioId,
    setDetailPortfolioId,
  } = useOptimizerStore(
    useShallow((state) => ({
      view: state.view,
      setView: state.setView,
      selectedPortfolioId: state.selectedPortfolioId,
      setSelectedPortfolioId: state.setSelectedPortfolioId,
      detailPortfolioId: state.detailPortfolioId,
      setDetailPortfolioId: state.setDetailPortfolioId,
    })),
  );

  const portfoliosQuery = useOptimizerPortfolios(brandId, adAccountId);
  const renewalsQuery = useOptimizerRenewals(brandId);
  const currency = useAdAccountCurrency(brandId, adAccountId);

  const portfolios = portfoliosQuery.data;
  const pendingCount = totalPending(portfolios);
  const renewalCount = renewalsQuery.data.length;

  const handleSelectPortfolio = (portfolioId: string) => {
    setSelectedPortfolioId(portfolioId);
    setView('portfolios');
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

  // No portfolios yet → onboarding path.
  if (portfolios.length === 0) {
    return (
      <div className="min-h-0 animate-in fade-in-0 overflow-y-auto p-2 duration-200 motion-reduce:animate-none">
        <OptimizerOnboarding
          brandId={brandId}
          adAccountId={adAccountId}
          platform={platform}
          currency={currency}
          onCreated={portfoliosQuery.refetch}
        />
      </div>
    );
  }

  // A portfolio opened for full-screen detail replaces the tab body with its own
  // command-center workspace (hero timeline + drill-ins). Guarded by find() so a
  // stale id (e.g. after an account switch) falls back to the tabbed view.
  const detailPortfolio = detailPortfolioId
    ? portfolios.find((portfolio) => portfolio.id === detailPortfolioId)
    : undefined;
  if (detailPortfolio) {
    return (
      <section className="grid h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background">
        <PortfolioDetailWorkspace
          adAccountId={adAccountId}
          brandId={brandId}
          currency={currency}
          onClose={() => setDetailPortfolioId(null)}
          portfolio={detailPortfolio}
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
            selectedPortfolioId={selectedPortfolioId ?? portfolios[0]?.id ?? null}
            currency={currency}
            onCreated={portfoliosQuery.refetch}
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
