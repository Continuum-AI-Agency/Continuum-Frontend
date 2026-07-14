'use client';

// "New portfolio", once you already have some.
//
// It used to be an inline expander: clicking the button toggled the ENTIRE setup body —
// suggestions, CBO campaigns, and the two-pane builder — into a card inside the Portfolios tab.
// That tab is a narrow, scrolling column, so the builder got re-squeezed into exactly the shape
// the onboarding rewrite was undoing, and the portfolio list you launched from was pushed off
// the screen by the thing you opened on top of it.
//
// A Sheet is the right container: it is as wide as the builder needs, it scrolls itself, and it
// leaves the list intact underneath. Same PortfolioSetup flow as onboarding (suggestions first,
// build-by-hand behind a button) — one component, two shells: full-page when there is nothing
// behind it, a Sheet when there is.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PortfolioSetup } from './PortfolioSetup';

export function NewPortfolioSheet({
  open,
  onOpenChange,
  brandId,
  adAccountId,
  currency,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  adAccountId: string;
  currency: string | null;
  onCreated?: (portfolioId: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="grid w-full grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-[min(96vw,1100px)]"
      >
        <SheetHeader className="border-border/70 border-b">
          <SheetTitle className="text-sm">New portfolio</SheetTitle>
          <SheetDescription className="text-xs">
            Start from a suggestion, or build one by hand and pick the ad sets yourself.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 overflow-y-auto p-4">
          <PortfolioSetup
            brandId={brandId}
            adAccountId={adAccountId}
            currency={currency}
            showAccountHeader={false}
            onCreated={(portfolioId) => {
              onOpenChange(false);
              onCreated?.(portfolioId);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
