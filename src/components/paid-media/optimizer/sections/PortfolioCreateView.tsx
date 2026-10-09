'use client';

// Create view — a full-height page STATE for standing up a new portfolio, not a
// sheet overlay. Modeled on OptimizerOnboarding: the same grid-rows shell + single
// scroll region wrapping PortfolioSetup (start-from-a-suggestion cards + build-by-hand
// path, unchanged). Because this is reached FROM an existing portfolio list rather than
// the empty state, the header is a breadcrumb back to it ("← Portfolios / New portfolio")
// instead of an onboarding pitch.

import { ArrowLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PortfolioSetup } from './PortfolioSetup';

type PortfolioCreateViewProps = {
  brandId: string;
  adAccountId: string;
  currency?: string | null;
  onBack: () => void;
  onCreated: (portfolioId: string) => void;
};

export function PortfolioCreateView({
  brandId,
  adAccountId,
  currency,
  onBack,
  onCreated,
}: PortfolioCreateViewProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex shrink-0 items-center gap-1.5 border-border/60 border-b px-4 py-2.5">
        <Button
          aria-label="Back to portfolios"
          className="-ml-2 h-7 gap-1.5 px-2 font-normal text-muted-foreground text-sm"
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
          Portfolios
        </Button>
        <span aria-hidden="true" className="text-muted-foreground text-sm">
          /
        </span>
        <h2 className="font-semibold text-sm tracking-tight">New portfolio</h2>
      </header>

      <div className="min-h-0 overflow-y-auto px-4 py-5">
        <PortfolioSetup
          adAccountId={adAccountId}
          brandId={brandId}
          currency={currency}
          onCreated={onCreated}
        />
      </div>
    </div>
  );
}
