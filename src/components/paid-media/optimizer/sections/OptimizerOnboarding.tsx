'use client';

// Onboarding / empty state — shown when the brand has no optimizer portfolios
// yet (or the optimizer backend is not reachable; its edge functions deploy
// later, so reads degrade here rather than erroring). A hero + the three-step
// path from the reference-ui-preview spec, over the shared PortfolioSetup body
// (discover account → suggested portfolios → create → enroll).

import { GaugeCircleIcon } from 'lucide-react';

import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { PortfolioSetup } from './PortfolioSetup';

type OptimizerOnboardingProps = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  currency?: string | null;
  onCreated: () => void;
};

const STEPS = ['Discover account', 'Review suggestions', 'Create & enroll'];

export function OptimizerOnboarding({
  brandId,
  adAccountId,
  currency,
  onCreated,
}: OptimizerOnboardingProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground">
          <GaugeCircleIcon className="size-5" />
        </div>
        <h2 className="mt-3 text-base font-semibold tracking-tight">Set up the Optimizer</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Group your ad sets into a portfolio and the optimizer scores per-$ efficiency across
          trailing 3/7/14-day windows, then proposes reallocation and pause/renewal recommendations.
        </p>
      </div>

      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2"
          >
            <span className="grid size-5 place-items-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      <PortfolioSetup
        brandId={brandId}
        adAccountId={adAccountId}
        currency={currency}
        onCreated={onCreated}
      />
    </div>
  );
}
