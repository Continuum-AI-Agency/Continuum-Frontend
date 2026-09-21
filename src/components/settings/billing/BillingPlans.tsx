'use client';

import type { PlanCode } from '@continuum/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { changePlan, startPlanCheckout } from '@/lib/billing/billingApi';
import {
  checkoutReturnParams,
  type PendingBillingChange,
  type PlanCardView,
} from '@/lib/billing/billingViewModel';
import { billingOverviewKey, billingReturnUrl } from '@/lib/billing/useBilling';

// The two self-serve plans side by side. With no live subscription a plan opens Stripe
// Checkout (card + promo codes are entered on Stripe's page); with one, plans are added to or
// removed from that same subscription on the card already on file, after a confirm that says
// how Stripe prorates the change.

type BillingPlansProps = {
  brandId: string;
  plans: PlanCardView[];
  onPlanChanged: (change: PendingBillingChange) => void;
};

export function BillingPlans({ brandId, plans, onPlanChanged }: BillingPlansProps) {
  return (
    <ul
      aria-label="Plans"
      className="grid divide-y divide-border @[36rem]/settings-section:grid-cols-2 @[36rem]/settings-section:divide-x @[36rem]/settings-section:divide-y-0"
    >
      {plans.map((plan) => (
        <li
          key={plan.planCode}
          aria-label={plan.name}
          className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 @[36rem]/settings-section:px-[var(--card-pad)] @[36rem]/settings-section:py-0 @[36rem]/settings-section:first:pl-0 @[36rem]/settings-section:last:pr-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
              <p className="mt-0.5 font-mono text-base font-semibold text-foreground tabular-nums">
                {plan.priceLabel}
                <span className="font-sans text-xs font-normal text-muted-foreground">
                  {' '}
                  / month
                </span>
              </p>
            </div>
            <PlanStatusPill status={plan.status} />
          </div>
          <ul className="flex-1 space-y-1.5">
            {plan.features.map((feature) => (
              <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <PlanAction brandId={brandId} plan={plan} onPlanChanged={onPlanChanged} />
        </li>
      ))}
    </ul>
  );
}

function PlanStatusPill({ status }: { status: PlanCardView['status'] }) {
  if (status === 'available') return null;
  return (
    <Pill className="shrink-0">
      <PillIndicator
        variant={status === 'active' ? 'success' : 'warning'}
        pulse={status !== 'active'}
      />
      {status === 'active' ? 'Active' : 'Activating'}
    </Pill>
  );
}

function PlanAction({
  brandId,
  plan,
  onPlanChanged,
}: {
  brandId: string;
  plan: PlanCardView;
  onPlanChanged: (change: PendingBillingChange) => void;
}) {
  switch (plan.action) {
    case 'checkout':
      return <CheckoutButton brandId={brandId} plan={plan} />;
    case 'add':
    case 'remove':
      return (
        <PlanChangeButton
          brandId={brandId}
          plan={plan}
          direction={plan.action}
          onPlanChanged={onPlanChanged}
        />
      );
    case 'none':
      return (
        <p className="text-xs text-muted-foreground">
          Your only plan. To cancel it, open Manage payment method.
        </p>
      );
  }
}

function CheckoutButton({ brandId, plan }: { brandId: string; plan: PlanCardView }) {
  const { show } = useToast();
  const checkout = useMutation({
    mutationFn: (planCode: PlanCode) => {
      const query = checkoutReturnParams({ kind: 'plan_added', plan: planCode });
      return startPlanCheckout(brandId, {
        plans: [planCode],
        successUrl: billingReturnUrl(query.success),
        cancelUrl: billingReturnUrl(query.cancel),
      });
    },
    onSuccess: (session) => window.location.assign(session.url),
    onError: (error) =>
      show({ title: 'Could not open checkout', description: error.message, variant: 'error' }),
  });
  const redirecting = checkout.isPending || checkout.isSuccess;

  return (
    <Button
      variant="cta"
      className="w-full @[36rem]/settings-section:w-fit"
      disabled={redirecting}
      aria-busy={redirecting}
      onClick={() => checkout.mutate(plan.planCode)}
    >
      {redirecting ? 'Opening checkout…' : `Choose ${plan.name}`}
    </Button>
  );
}

function PlanChangeButton({
  brandId,
  plan,
  direction,
  onPlanChanged,
}: {
  brandId: string;
  plan: PlanCardView;
  direction: 'add' | 'remove';
  onPlanChanged: (change: PendingBillingChange) => void;
}) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const verb = direction === 'add' ? 'Add' : 'Remove';

  const change = useMutation({
    mutationFn: () =>
      changePlan(brandId, direction === 'add' ? { add: plan.planCode } : { remove: plan.planCode }),
    onSuccess: () => {
      setOpen(false);
      onPlanChanged({
        kind: direction === 'add' ? 'plan_added' : 'plan_removed',
        plan: plan.planCode,
      });
      void queryClient.invalidateQueries({ queryKey: billingOverviewKey(brandId) });
    },
    onError: (error) => {
      show({
        title: `Could not ${verb.toLowerCase()} ${plan.name}`,
        description: error.message,
        variant: 'error',
      });
      void queryClient.invalidateQueries({ queryKey: billingOverviewKey(brandId) });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant={direction === 'add' ? 'default' : 'outline'}
        className="w-full @[36rem]/settings-section:w-fit"
        onClick={() => setOpen(true)}
      >
        {verb} {plan.name}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {verb} {plan.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {direction === 'add'
              ? `${plan.name} joins your subscription now, charged to the card on file. Stripe prorates it: your next invoice includes the rest of this billing period, then ${plan.priceLabel} a month.`
              : `${plan.name} leaves your subscription now and its features lock. Stripe prorates it: the unused part of this billing period is credited on your next invoice.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={change.isPending}>Keep current plans</AlertDialogCancel>
          <AlertDialogAction
            variant={direction === 'add' ? 'cta' : 'destructive'}
            disabled={change.isPending}
            aria-busy={change.isPending}
            onClick={() => change.mutate()}
          >
            {change.isPending
              ? `${verb === 'Add' ? 'Adding' : 'Removing'}…`
              : `${verb} ${plan.name}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
