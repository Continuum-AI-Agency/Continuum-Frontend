'use client';

import { useMutation } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import type { ReactNode } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { BillingInvoices } from '@/components/settings/billing/BillingInvoices';
import { BillingPlans } from '@/components/settings/billing/BillingPlans';
import {
  BillingContractState,
  BillingErrorState,
  BillingLockedState,
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
  isBrandOwner,
  type PendingBillingChange,
  type SelfServeBillingView,
  toBillingView,
} from '@/lib/billing/billingViewModel';
import { billingReturnUrl, useBillingOverviewWithPendingChange } from '@/lib/billing/useBilling';

// Settings → Billing for the active brand. Only its owner sees plans, the card and invoices;
// everyone else gets the locked state without a request (billing-api 403s them anyway).
//
// `tier` is still passed by the settings page and deliberately ignored: access is read from
// billing entitlements now, and the prop leaves the mount point when the page stops reading tier.

type BrandBillingPanelProps = {
  tier: number;
};

export function BrandBillingPanel(_props: BrandBillingPanelProps) {
  const { activeBrandId, brandSummaries, permissions } = useActiveBrandContext();
  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? 'this brand';

  if (!isBrandOwner(permissions, activeBrandId)) {
    return <BillingLockedState brandName={brandName} />;
  }
  return <OwnerBillingPanel key={activeBrandId} brandId={activeBrandId} brandName={brandName} />;
}

function OwnerBillingPanel({ brandId, brandName }: { brandId: string; brandName: string }) {
  const { overview, pending, track } = useBillingOverviewWithPendingChange(brandId);

  if (overview.isPending) return <BillingSkeleton />;
  if (overview.isError) {
    if (isBillingManagerRequired(overview.error)) return <BillingLockedState brandName={brandName} />;
    return (
      <BillingErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />
    );
  }

  const view = toBillingView(overview.data);
  if (view.kind === 'contract') return <BillingContractState features={view.features} />;

  return (
    <SelfServeBilling
      brandId={brandId}
      view={view}
      waitingOnStripe={pending !== null}
      onPlanChanged={track}
    />
  );
}

function PanelRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3 py-4 first:pt-0 last:pb-0">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SelfServeBilling({
  brandId,
  view,
  waitingOnStripe,
  onPlanChanged,
}: {
  brandId: string;
  view: SelfServeBillingView;
  waitingOnStripe: boolean;
  onPlanChanged: (change: PendingBillingChange) => void;
}) {
  return (
    <div className="divide-y divide-border" aria-busy={waitingOnStripe}>
      <PanelRow title="Plans">
        <BillingPlans brandId={brandId} plans={view.plans} onPlanChanged={onPlanChanged} />
      </PanelRow>
      <PanelRow title="Payment method">
        <PaymentMethodRow brandId={brandId} view={view} />
      </PanelRow>
      <PanelRow title="Canvas credits">
        {view.hasLiveSubscription || view.credits.availableCredits > 0 ? (
          <CanvasCreditsMeter credits={view.credits} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Canvas credits come with Organic Plus every month. Once a plan is active you can also
            buy credit packs.
          </p>
        )}
        {view.hasLiveSubscription ? (
          <BuyCreditsControl
            brandId={brandId}
            offer={view.creditPack}
            purchasedCredits={view.credits.purchasedCredits}
          />
        ) : null}
      </PanelRow>
      <PanelRow title="Invoices">
        <BillingInvoices invoices={view.invoices} />
      </PanelRow>
    </div>
  );
}

const renewalFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function PaymentMethodRow({ brandId, view }: { brandId: string; view: SelfServeBillingView }) {
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
  const redirecting = portal.isPending || portal.isSuccess;

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
        <Button
          variant="outline"
          disabled={redirecting}
          aria-busy={redirecting}
          onClick={() => portal.mutate()}
        >
          {redirecting ? 'Opening Stripe…' : 'Manage payment method'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Checkout asks for a card when you choose a plan.</p>
      )}
    </div>
  );
}
