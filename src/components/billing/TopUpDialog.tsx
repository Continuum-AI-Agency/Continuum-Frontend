'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { CREDIT_PACK_OFFER, type CreditPackOffer } from '@continuum/contracts';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/ToastProvider';
import { startCreditCheckout } from '@/lib/billing/billingApi';
import { formatCredits, formatUsd } from '@/lib/billing/billingViewModel';
import { creditsHref } from '@/lib/billing/productAccess';
import {
  type MeteredSidebarBilling,
  NO_PLAN_CREDITS_LABEL,
  type SidebarBillingView,
} from '@/lib/billing/sidebarBilling';
import {
  DEFAULT_TOP_UP_PACKS,
  registerTopUpHost,
  topUpPackPresets,
  topUpReturnUrls,
} from '@/lib/billing/topUp';
import { useBillingOverviewWithPendingChange } from '@/lib/billing/useBilling';
import { cn } from '@/lib/utils';

// The one place credits are bought from outside Settings. Every "Buy credits" (the 402 toast,
// the low-credits nudge, a low sidebar meter, a canvas node that ran dry) opens this over the
// page the person is working on; Stripe returns them to that page, and the shell confirms the
// credits there. It only ever opens on a click.

/** Three pack sizes as radio cards; the middle one is pre-selected. Shared with Settings. */
export function TopUpPackPicker({
  packs,
  onPacksChange,
  offer = CREDIT_PACK_OFFER,
  className,
}: {
  packs: number;
  onPacksChange: (packs: number) => void;
  offer?: CreditPackOffer;
  className?: string;
}) {
  return (
    <RadioGroup
      aria-label="Credit packs"
      value={packs}
      onValueChange={(value) => onPacksChange(Number(value))}
      className={cn('grid gap-2', className)}
    >
      {topUpPackPresets(offer).map((count) => (
        <Radio.Root
          key={count}
          value={count}
          data-testid={`top-up-pack-${count}`}
          className={cn(
            'group/pack flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-3 text-left outline-none transition-colors',
            'hover:border-[color-mix(in_oklch,var(--primary),var(--border)_60%)] focus-visible:ring-2 focus-visible:ring-ring/45',
            'data-checked:border-primary data-checked:bg-primary/[0.06]',
          )}
        >
          <span
            aria-hidden
            className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input transition-colors group-data-checked/pack:border-primary group-data-checked/pack:bg-primary"
          >
            <Check className="size-2.5 stroke-[3] text-primary-foreground opacity-0 group-data-checked/pack:opacity-100" />
          </span>
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
              {formatCredits(count * offer.credits)}
            </span>
            <span className="text-xs text-muted-foreground">credits</span>
          </span>
          <span className="font-mono text-sm text-foreground tabular-nums">
            {formatUsd(count * offer.priceUsd)}
          </span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

/** Opens Stripe Checkout for `packs`, returning to the current page. */
export function useCreditCheckout(brandId: string, purchasedCreditsBefore: number) {
  const { show } = useToast();
  const checkout = useMutation({
    mutationFn: (packs: number) =>
      startCreditCheckout(brandId, {
        packs,
        ...topUpReturnUrls(window.location.href, purchasedCreditsBefore),
      }),
    onSuccess: (session) => window.location.assign(session.url),
    onError: (error) =>
      show({ title: 'Could not open checkout', description: error.message, variant: 'error' }),
  });
  return {
    buy: (packs: number) => checkout.mutate(packs),
    // Success keeps it busy: the browser is already on its way to Stripe.
    redirecting: checkout.isPending || checkout.isSuccess,
  };
}

function balanceLine(view: MeteredSidebarBilling): string {
  if (view.remainingCredits === 0) return 'Out of credits — generation is paused.';
  return `${formatCredits(view.remainingCredits)} credits left${view.low ? ' — running low' : ''}.`;
}

export function TopUpDialog({
  view,
  brandId,
  owner,
}: {
  view: SidebarBillingView | null;
  brandId: string;
  owner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const section = useSearchParams().get('section');
  const onBillingPage = pathname.startsWith('/settings') && section === 'billing';
  // A Top up returns here; the Billing page confirms its own returns.
  useBillingOverviewWithPendingChange(brandId, { returnsOnly: true, enabled: !onBillingPage });

  const metered = view?.kind === 'metered' ? view : null;
  const meteredRef = useRef(metered);
  meteredRef.current = metered;
  // Only a metered brand has credits to top up; anything else falls back to Billing.
  useEffect(
    () =>
      registerTopUpHost(() => {
        if (!meteredRef.current) return false;
        setOpen(true);
        return true;
      }),
    [],
  );

  if (!metered) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-5 sm:max-w-sm" data-testid="top-up-dialog">
        <TopUpBody view={metered} brandId={brandId} owner={owner} />
      </DialogContent>
    </Dialog>
  );
}

function TopUpBody({
  view,
  brandId,
  owner,
}: {
  view: MeteredSidebarBilling;
  brandId: string;
  owner: boolean;
}) {
  const [packs, setPacks] = useState(DEFAULT_TOP_UP_PACKS);
  const { buy, redirecting } = useCreditCheckout(brandId, view.purchasedCredits);
  const from = typeof window === 'undefined' ? undefined : window.location.pathname;
  // Auto-billing rides on a plan subscription, so a credits-only brand is never offered it.
  const offerAutoBilling =
    owner && !view.autoBilling.on && view.planLabel !== NO_PLAN_CREDITS_LABEL;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Top up Canvas credits</DialogTitle>
        <DialogDescription data-testid="top-up-balance" className={cn(view.low && 'text-warning')}>
          {balanceLine(view)}
        </DialogDescription>
      </DialogHeader>

      {owner ? (
        <TopUpPackPicker packs={packs} onPacksChange={setPacks} />
      ) : (
        <p className="rounded-lg border border-border bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground">
          Only the brand owner can buy credits. Let them know when this brand needs a top-up.
        </p>
      )}

      <DialogFooter className="flex-col items-stretch gap-3 sm:flex-col sm:items-stretch">
        {owner ? (
          <Button
            size="lg"
            disabled={redirecting}
            aria-busy={redirecting}
            onClick={() => buy(packs)}
            data-testid="top-up-continue"
            className="w-full justify-center"
          >
            {redirecting ? (
              'Opening secure checkout…'
            ) : (
              <>
                Continue to payment · {formatUsd(packs * CREDIT_PACK_OFFER.priceUsd)}
                <ArrowRight data-icon="inline-end" />
              </>
            )}
          </Button>
        ) : null}
        <p className="text-center text-xs text-muted-foreground">
          {offerAutoBilling ? (
            <>
              Never run out:{' '}
              <Link
                href={creditsHref(from)}
                className={cn(
                  buttonVariants({ variant: 'link' }),
                  'h-auto p-0 text-xs text-foreground underline-offset-3',
                )}
              >
                turn on auto-billing
              </Link>
            </>
          ) : (
            'One-time payment through Stripe.'
          )}
        </p>
      </DialogFooter>
    </>
  );
}
