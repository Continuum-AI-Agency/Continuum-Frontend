'use client';

import { productCodeSchema } from '@continuum/contracts';
import { useMutation } from '@tanstack/react-query';
import { CreditCard, TriangleAlert } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react';
import { switchActiveBrandAction } from '@/app/(post-auth)/settings/actions';
import { CheckoutReceiptDialog } from '@/components/billing/CheckoutReceiptDialog';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { AutoBillingControl } from '@/components/settings/billing/AutoBillingControl';
import { BillingInvoices } from '@/components/settings/billing/BillingInvoices';
import { BillingPlans } from '@/components/settings/billing/BillingPlans';
import {
  BillingContractState,
  BillingErrorState,
  BillingLockedState,
  BillingNotLiveState,
  BillingSkeleton,
} from '@/components/settings/billing/BillingStates';
import {
  BuyCreditsControl,
  CanvasCreditsMeter,
} from '@/components/settings/billing/CanvasCreditsMeter';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { isBillingManagerRequired, openBillingPortal } from '@/lib/billing/billingApi';
import {
  formatCredits,
  formatUsd,
  isBrandOwner,
  NEED_LABEL,
  type PendingBillingChange,
  type SelfServeBillingView,
  toBillingView,
} from '@/lib/billing/billingViewModel';
import { CREDITS_ANCHOR } from '@/lib/billing/productAccess';
import { trackBillingEvent } from '@/lib/billing/telemetry';
import { billingReturnUrl, useBillingOverviewWithPendingChange } from '@/lib/billing/useBilling';
import { cn } from '@/lib/utils';

// Settings → Billing for the active brand. Only its owner sees plans, the card and invoices;
// everyone else gets the locked state without a request (billing-api 403s them anyway).
//
// A gated page sends the user here as `?section=billing&need=<product>`; the plan that grants
// that product is highlighted. The sidebar's credits widget links to `#credits`, which scrolls
// the credit-pack section into view and briefly highlights it.
//
// Credit packs are the base way to top up; auto-billing overage to the card is the owner's
// opt-in alternative.

type BrandBillingPanelProps = {
  /** False while PostgREST does not expose `billing` — the settings page reads it server-side. */
  billingLive: boolean;
};

export function BrandBillingPanel({ billingLive }: BrandBillingPanelProps) {
  const { activeBrandId, brandSummaries, permissions } = useActiveBrandContext();
  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? 'this brand';
  usePaywallViewed(billingLive, isBrandOwner(permissions, activeBrandId));
  // A credit-alert email names its brand (`?brand=`); the app opens the ACTIVE one.
  const linkedBrand = brandToOffer(useSearchParams().get('brand'), activeBrandId, brandSummaries);

  // billing-cutover: before go-live there is no billing-api to ask.
  if (!billingLive) return <BillingNotLiveState />;
  return (
    <>
      {linkedBrand ? (
        <SwitchBrandNotice
          brandId={linkedBrand.id}
          name={linkedBrand.name}
          activeName={brandName}
        />
      ) : null}
      {isBrandOwner(permissions, activeBrandId) ? (
        <OwnerBillingPanel key={activeBrandId} brandId={activeBrandId} brandName={brandName} />
      ) : (
        <BillingLockedState brandName={brandName} />
      )}
    </>
  );
}

/** The linked brand, when it is not the active one and the viewer can open it. */
export function brandToOffer<Brand extends { id: string }>(
  linkedBrandId: string | null,
  activeBrandId: string,
  brands: readonly Brand[],
): Brand | undefined {
  if (!linkedBrandId || linkedBrandId === activeBrandId) return undefined;
  return brands.find((brand) => brand.id === linkedBrandId);
}

/** Offered, never automatic: switching brand changes what every page shows. */
function SwitchBrandNotice({
  brandId,
  name,
  activeName,
}: {
  brandId: string;
  name: string;
  activeName: string;
}) {
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  return (
    <div
      role="status"
      data-testid="billing-switch-brand"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground"
    >
      <p>
        This link is about <span className="font-medium">{name}</span>. You're viewing {activeName}.
      </p>
      <Button
        variant="outline"
        disabled={switching}
        aria-busy={switching}
        onClick={() =>
          startSwitch(async () => {
            await switchActiveBrandAction(brandId);
            router.refresh();
          })
        }
      >
        {switching ? 'Switching…' : `Switch to ${name}`}
      </Button>
    </div>
  );
}

/** A gate sent someone here (`?need=`): the top of the billing funnel. Once per page view. */
function usePaywallViewed(billingLive: boolean, owner: boolean) {
  const need = useSearchParams().get('need');
  const trackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!billingLive || !need || trackedRef.current === need) return;
    trackedRef.current = need;
    trackBillingEvent('paywall_viewed', { product: need, owner });
  }, [billingLive, need, owner]);
}

function OwnerBillingPanel({ brandId, brandName }: { brandId: string; brandName: string }) {
  const { overview, pending, track, receipt, closeReceipt } =
    useBillingOverviewWithPendingChange(brandId);
  const need = productCodeSchema.safeParse(useSearchParams().get('need'));
  // The receipt prints over whatever the panel shows while the purchase lands.
  const withReceipt = (panel: ReactNode) => (
    <>
      {panel}
      {receipt ? (
        <CheckoutReceiptDialog brandId={brandId} receipt={receipt} onClose={closeReceipt} />
      ) : null}
    </>
  );

  if (overview.isPending) return withReceipt(<BillingSkeleton />);
  if (overview.isError) {
    if (isBillingManagerRequired(overview.error))
      return <BillingLockedState brandName={brandName} />;
    return withReceipt(
      <BillingErrorState
        message={overview.error.message}
        onRetry={() => void overview.refetch()}
      />,
    );
  }

  const view = toBillingView(overview.data, need.success ? need.data : null);
  if (view.kind === 'contract') {
    return withReceipt(
      <div className="space-y-6">
        <BillingContractState features={view.features} />
        <AutoBillingControl brandId={brandId} autoBilling={view.autoBilling} onChanged={track} />
      </div>,
    );
  }

  return withReceipt(
    <SelfServeBilling
      brandId={brandId}
      view={view}
      needLabel={need.success ? NEED_LABEL[need.data] : null}
      waitingOnStripe={pending !== null}
      onPlanChanged={track}
    />,
  );
}

function PanelRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3 py-4 first:pt-0 last:pb-0">
      <PanelRowTitle>{title}</PanelRowTitle>
      {children}
    </section>
  );
}

function PanelRowTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

const HIGHLIGHT_MS = 2_400;

/** The credit-pack section: on `#credits` it scrolls into view and highlights for a moment. */
function CreditsRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const focusIfTargeted = () => {
      if (window.location.hash !== `#${CREDITS_ANCHOR}`) return;
      ref.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      setHighlighted(true);
      clearTimeout(timer);
      timer = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
    };
    focusIfTargeted();
    window.addEventListener('hashchange', focusIfTargeted);
    return () => {
      window.removeEventListener('hashchange', focusIfTargeted);
      clearTimeout(timer);
    };
  }, [reduceMotion]);

  return (
    <section
      ref={ref}
      id={CREDITS_ANCHOR}
      aria-label="Canvas credits"
      data-highlighted={highlighted || undefined}
      className={cn(
        'scroll-mt-4 space-y-4 rounded-md py-4 outline-2 outline-offset-4 outline-transparent transition-[outline-color] duration-500 first:pt-0 last:pb-0',
        'data-[highlighted]:outline-ring/60',
      )}
    >
      <PanelRowTitle>Canvas credits</PanelRowTitle>
      {children}
    </section>
  );
}

function SelfServeBilling({
  brandId,
  view,
  needLabel,
  waitingOnStripe,
  onPlanChanged,
}: {
  brandId: string;
  view: SelfServeBillingView;
  needLabel: string | null;
  waitingOnStripe: boolean;
  onPlanChanged: (change: PendingBillingChange) => void;
}) {
  return (
    <div className="divide-y divide-border" aria-busy={waitingOnStripe}>
      {view.paymentFailed ? (
        <PaymentFailedNotice brandId={brandId} state={view.paymentFailed} />
      ) : null}
      <PanelRow title="Plans">
        <BillingPlans
          brandId={brandId}
          plans={view.plans}
          onPlanChanged={onPlanChanged}
          needLabel={needLabel}
        />
      </PanelRow>
      <CreditsRow>
        {view.canBuyCredits || view.credits.availableCredits > 0 ? (
          <CanvasCreditsMeter credits={view.credits} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Canvas credits come with Organic Plus every month. Once a plan is active you can also
            buy credit packs.
          </p>
        )}
        {view.outOfCredits ? <OutOfCreditsNotice canAutoBill={view.hasLiveSubscription} /> : null}
        {view.canBuyCredits ? (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">Top up with credit packs</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatCredits(view.creditPack.credits)} credits for{' '}
                {formatUsd(view.creditPack.priceUsd)} a pack, paid once and added as soon as Stripe
                confirms.
              </p>
            </div>
            <BuyCreditsControl
              brandId={brandId}
              offer={view.creditPack}
              purchasedCredits={view.credits.purchasedCredits}
            />
          </div>
        ) : null}
        <div className="border-t border-border pt-4">
          <AutoBillingControl
            brandId={brandId}
            autoBilling={view.autoBilling}
            onChanged={onPlanChanged}
          />
        </div>
      </CreditsRow>
      <PanelRow title="Payment method">
        <PaymentMethodRow brandId={brandId} view={view} />
      </PanelRow>
      <PanelRow title="Invoices">
        <BillingInvoices invoices={view.invoices} />
      </PanelRow>
    </div>
  );
}

/** Auto-billing needs a subscription, so a brand on packs alone (grandfathered) is only told to buy. */
function OutOfCreditsNotice({ canAutoBill }: { canAutoBill: boolean }) {
  return (
    <div
      role="status"
      data-testid="billing-out-of-credits"
      className="flex gap-2.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-foreground"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>
        <span className="font-medium">This brand is out of Canvas credits.</span> Generation is
        paused.{' '}
        {canAutoBill
          ? 'Buy a credit pack below, or turn on auto-billing to keep generating.'
          : 'Buy a credit pack below to keep generating.'}
      </p>
    </div>
  );
}

const renewalFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Stripe's portal, where the card is updated. Pending until the browser has left the page. */
function useBillingPortal(brandId: string) {
  const { show } = useToast();
  const portal = useMutation({
    mutationFn: () =>
      openBillingPortal(brandId, { returnUrl: billingReturnUrl('section=billing') }),
    onSuccess: (session) => window.location.assign(session.url),
    onError: (error) =>
      show({
        title: 'Could not open billing portal',
        description: error.message,
        variant: 'error',
      }),
  });
  return { open: () => portal.mutate(), redirecting: portal.isPending || portal.isSuccess };
}

/**
 * A declined renewal. Access holds while Stripe retries, so this informs rather than alarms: one
 * notice with the one action that fixes it. Stripe emails the owner as well.
 */
function PaymentFailedNotice({
  brandId,
  state,
}: {
  brandId: string;
  state: NonNullable<SelfServeBillingView['paymentFailed']>;
}) {
  const { open, redirecting } = useBillingPortal(brandId);
  return (
    <div
      role="status"
      data-testid="billing-payment-failed"
      className="flex flex-wrap items-center justify-between gap-3 py-4"
    >
      <p className="flex min-w-0 gap-2.5 text-sm text-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        {state === 'retrying' ? (
          <span>
            <span className="font-medium">Your last payment didn't go through.</span> Your plan
            stays on while Stripe retries. Update your card to keep it running.
          </span>
        ) : (
          <span>
            <span className="font-medium">Your plan is paused</span> because the last payment didn't
            go through. Update your card in Stripe to turn it back on.
          </span>
        )}
      </p>
      <Button variant="outline" disabled={redirecting} aria-busy={redirecting} onClick={open}>
        {redirecting ? 'Opening Stripe…' : 'Update card'}
      </Button>
    </div>
  );
}

function PaymentMethodRow({ brandId, view }: { brandId: string; view: SelfServeBillingView }) {
  const { open, redirecting } = useBillingPortal(brandId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 text-sm text-foreground">
          <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          <span data-testid="billing-card-status">
            {view.hasPaymentMethod ? 'Card on file' : 'No card on file'}
          </span>
        </span>
        {view.renewsAt ? (
          <Pill>
            <PillIndicator variant={view.cancelAtPeriodEnd ? 'warning' : 'success'} />
            {view.cancelAtPeriodEnd ? 'Ends' : 'Renews'}{' '}
            {renewalFormat.format(new Date(view.renewsAt))}
          </Pill>
        ) : null}
      </div>
      {view.hasLiveSubscription || view.hasPaymentMethod ? (
        <Button variant="outline" disabled={redirecting} aria-busy={redirecting} onClick={open}>
          {redirecting ? 'Opening Stripe…' : 'Manage payment method'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Checkout asks for a card when you choose a plan.
        </p>
      )}
    </div>
  );
}
