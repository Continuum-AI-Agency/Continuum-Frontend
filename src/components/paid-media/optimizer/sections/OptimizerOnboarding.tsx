'use client';

// Onboarding / empty state — shown when the brand has no optimizer portfolios yet (or the
// optimizer backend is not reachable; its edge functions deploy later, so reads degrade here
// rather than erroring).
//
// It used to carry a STEPS array rendered as a numbered three-item list: "Discover account →
// Review suggestions → Create & enroll". It was decorative. There was no active step, no
// navigation, no step index — all three "steps" rendered at once, below it. A stepper that
// cannot step is worse than no stepper, because it promises a sequence the page does not have:
// starting from a suggestion and building one by hand are ALTERNATIVES, not stages. Section
// headings do that job honestly, so the fake stepper is gone.
//
// The whole thing also lived inside `mx-auto max-w-2xl` — a 672px column, which is where a
// seven-column ad-set table was expected to fit. That was the single biggest cause of the
// cramping. Onboarding is now full-width and full-height, and owns exactly one scroll region.

import { GaugeCircleIcon } from 'lucide-react';

import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { PortfolioSetup } from './PortfolioSetup';

type OptimizerOnboardingProps = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  currency?: string | null;
  onCreated: (portfolioId: string) => void;
};

export function OptimizerOnboarding({
  brandId,
  adAccountId,
  currency,
  onCreated,
}: OptimizerOnboardingProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      {/* One line, laid out horizontally. The hero used to be a 6rem-tall centered block that
          ate the fold before the user saw a single ad set. */}
      <header className="flex shrink-0 items-center gap-3 border-border/70 border-b px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground">
          <GaugeCircleIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-sm tracking-tight">Put ad sets under the Optimizer</h2>
          {/* Says what the user gets, then the money-safety promise. The old line
              described the algorithm — "per-$ efficiency over trailing 3/7/14-day
              windows" — which is true, unreadable, and answers a question nobody
              arriving at an empty state is asking. */}
          <p className="truncate text-muted-foreground text-xs">
            Pick the ad sets to manage as one budget. Every night it moves money toward whichever
            ones buy results cheapest — and it changes nothing until you say so.
          </p>
        </div>
      </header>

      <div className="min-h-0 overflow-y-auto p-4">
        <PortfolioSetup
          brandId={brandId}
          adAccountId={adAccountId}
          currency={currency}
          onCreated={onCreated}
        />
      </div>
    </div>
  );
}
