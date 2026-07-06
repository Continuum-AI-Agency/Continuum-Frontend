'use client';

// Paid Media Optimizer surface — rebuilt from the reference-ui-preview.html
// visual spec as native shadcn/Tailwind + Radix. Rendered inside the Scale
// page's "Paid Optimization" (performance) tab slot. Three sub-views (Overview /
// Portfolios / Actions) plus an onboarding/empty state when the brand has no
// portfolios yet (or the optimizer backend is not reachable — its edge functions
// deploy later, so reads degrade to the onboarding view rather than erroring).

import type { PortfolioListItem } from '@continuum/contracts';
import { GaugeCircleIcon, LayersIcon, ListChecksIcon, RefreshCwIcon } from 'lucide-react';
import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { OptimizerActions } from './sections/OptimizerActions';
import { OptimizerOnboarding } from './sections/OptimizerOnboarding';
import { OptimizerOverview } from './sections/OptimizerOverview';
import { OptimizerPortfolios } from './sections/OptimizerPortfolios';
import { useOptimizerPortfolios, useOptimizerRenewals } from './useOptimizerData';

type OptimizerTabProps = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
};

type OptimizerView = 'overview' | 'portfolios' | 'actions';

function totalPending(portfolios: PortfolioListItem[]): number {
  return portfolios.reduce((sum, portfolio) => sum + portfolio.pending_recommendations, 0);
}

function OptimizerSkeleton() {
  return (
    <div className="space-y-3 p-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function OptimizerTab({ brandId, adAccountId, platform }: OptimizerTabProps) {
  const [view, setView] = React.useState<OptimizerView>('overview');
  const [selectedPortfolioId, setSelectedPortfolioId] = React.useState<string | null>(null);

  const portfoliosQuery = useOptimizerPortfolios(brandId, adAccountId);
  const renewalsQuery = useOptimizerRenewals(brandId);

  const portfolios = portfoliosQuery.data ?? [];
  const pendingCount = totalPending(portfolios);
  const renewalCount = renewalsQuery.data?.length ?? 0;

  const handleSelectPortfolio = React.useCallback((portfolioId: string) => {
    setSelectedPortfolioId(portfolioId);
    setView('portfolios');
  }, []);

  if (portfoliosQuery.isLoading) {
    return <OptimizerSkeleton />;
  }

  // No portfolios yet (or optimizer backend unreachable) → onboarding path.
  if (portfolios.length === 0) {
    return (
      <div className="min-h-0 overflow-y-auto p-2">
        <OptimizerOnboarding
          brandId={brandId}
          adAccountId={adAccountId}
          platform={platform}
          onCreated={() => void portfoliosQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background">
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as OptimizerView)}
        className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
              <GaugeCircleIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight">Optimizer</h2>
              <p className="text-xs text-muted-foreground">
                Portfolios · reallocation · recommendations.
              </p>
            </div>
          </div>
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
                <span className="ml-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {pendingCount + renewalCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="min-h-0 overflow-y-auto p-2">
          <OptimizerOverview
            portfolios={portfolios}
            pendingCount={pendingCount}
            onOpenActions={() => setView('actions')}
            onSelectPortfolio={handleSelectPortfolio}
          />
        </TabsContent>

        <TabsContent value="portfolios" className="min-h-0 overflow-y-auto p-2">
          <OptimizerPortfolios
            portfolios={portfolios}
            selectedPortfolioId={selectedPortfolioId ?? portfolios[0]?.id ?? null}
            onSelectPortfolio={setSelectedPortfolioId}
          />
        </TabsContent>

        <TabsContent value="actions" className="min-h-0 overflow-y-auto p-2">
          <OptimizerActions
            brandId={brandId}
            adAccountId={adAccountId}
            portfolios={portfolios}
            renewals={renewalsQuery.data ?? []}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
