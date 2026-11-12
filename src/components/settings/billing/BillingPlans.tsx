'use client';

import type { PlanCode } from '@continuum/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
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
import { useUiErrorMessage } from '@/i18n/errors';
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
  /** What a gated page sent the user here for (`?need=`), named on the highlighted plan. */
  needLabel?: string | null;
};

export function BillingPlans({ brandId, plans, onPlanChanged, needLabel }: BillingPlansProps) {
  const tUi = useTranslations('settings');

  const highlightedRef = useRef<HTMLLIElement>(null);
  // A gated page sent the user here: bring the plan that unlocks it into view (on a phone the
  // two plans stack, and the one they need may be the second).
  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  const anyHighlighted = plans.some((plan) => plan.highlighted);

  return (
    <ul
      aria-label={tUi('m_cf2e5f26fe')}
      className="grid divide-y divide-border @[36rem]/settings-section:grid-cols-2 @[36rem]/settings-section:divide-x @[36rem]/settings-section:divide-y-0"
    >
      {plans.map((plan) => (
        <li
          key={plan.planCode}
          ref={plan.highlighted ? highlightedRef : undefined}
          aria-label={plan.name}
          data-highlighted={plan.highlighted || undefined}
          className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 @[36rem]/settings-section:px-[var(--card-pad)] @[36rem]/settings-section:py-0 @[36rem]/settings-section:first:pl-0 @[36rem]/settings-section:last:pr-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
              <p className="mt-0.5 font-mono text-base font-semibold text-foreground tabular-nums">
                {plan.priceLabel}
                <span className="font-sans text-xs font-normal text-muted-foreground">
                  {' '}
                  {tUi('m_f7fa5df80f')}
                </span>
              </p>
            </div>
            <PlanStatusPill status={plan.status} />
          </div>
          {plan.highlighted && needLabel ? (
            <p
              data-testid="billing-plan-needed"
              className="flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              {tUi('m_896b841f3b')}
              {needLabel}
            </p>
          ) : null}
          <ul className="flex-1 space-y-1.5">
            {plan.features.map((feature) => (
              <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <PlanAction
            brandId={brandId}
            plan={plan}
            onPlanChanged={onPlanChanged}
            emphasis={anyHighlighted ? plan.highlighted : true}
          />
        </li>
      ))}
    </ul>
  );
}

function getPlanStatusPills(tUi: ReturnType<typeof useTranslations<'settings'>>) {
  return {
    active: { label: tUi('m_a733b809d2'), tone: 'success', pulse: false },
    activating: { label: tUi('m_d91d2edc90'), tone: 'warning', pulse: true },
    payment_failed: { label: tUi('m_b1e8e75fdc'), tone: 'error', pulse: false },
  } as const;
}

function PlanStatusPill({ status }: { status: PlanCardView['status'] }) {
  const tUi = useTranslations('settings');
  const PLAN_STATUS_PILL = getPlanStatusPills(tUi);

  if (status === 'available') return null;
  const { label, tone, pulse } = PLAN_STATUS_PILL[status];
  return (
    <Pill className="shrink-0">
      <PillIndicator variant={tone} pulse={pulse} />
      {label}
    </Pill>
  );
}

function PlanAction({
  brandId,
  plan,
  onPlanChanged,
  emphasis,
}: {
  brandId: string;
  plan: PlanCardView;
  onPlanChanged: (change: PendingBillingChange) => void;
  /** False for the plan that is NOT the one a gated page asked for — it steps back to outline. */
  emphasis: boolean;
}) {
  const tUi = useTranslations('settings');

  switch (plan.action) {
    case 'checkout':
      return <CheckoutButton brandId={brandId} plan={plan} emphasis={emphasis} />;
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
      return <p className="text-xs text-muted-foreground">{tUi('m_2c8487e4a0')}</p>;
    case 'requires_organic':
      return <p className="text-xs text-muted-foreground">{tUi('m_eb885520a1')}</p>;
  }
}

function CheckoutButton({
  brandId,
  plan,
  emphasis,
}: {
  brandId: string;
  plan: PlanCardView;
  emphasis: boolean;
}) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

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
      show({ title: tUi('m_12369214b3'), description: uiErrorMessage(error), variant: 'error' }),
  });
  const redirecting = checkout.isPending || checkout.isSuccess;

  return (
    <Button
      variant={emphasis ? 'cta' : 'outline'}
      className="w-full @[36rem]/settings-section:w-fit"
      disabled={redirecting}
      aria-busy={redirecting}
      onClick={() => checkout.mutate(plan.planCode)}
    >
      {redirecting ? tUi('m_4b149ef50a') : tUi('m_fed72e3d29', { v0: String(plan.name) })}
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
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const { show } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const verb = direction === 'add' ? tUi('m_61cc55aa04') : tUi('m_e963907dac');

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
        title: tUi('m_6d9863fb0b', { v0: String(verb.toLowerCase()), v1: String(plan.name) }),
        description: uiErrorMessage(error),
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
              ? tUi('m_3fd0e57d69', { v0: String(plan.name), v1: String(plan.priceLabel) })
              : tUi('m_de4f32ec20', { v0: String(plan.name) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={change.isPending}>{tUi('m_d1eb0f16a2')}</AlertDialogCancel>
          <AlertDialogAction
            variant={direction === 'add' ? 'cta' : 'destructive'}
            disabled={change.isPending}
            aria-busy={change.isPending}
            onClick={() => change.mutate()}
          >
            {change.isPending
              ? tUi('m_e315ee966a', {
                  v0: String(direction === 'add' ? tUi('m_48a693c488') : tUi('m_b7d2c38b79')),
                })
              : tUi('m_a79fb214ea', { v0: String(verb), v1: String(plan.name) })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
