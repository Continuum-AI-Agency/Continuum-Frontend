'use client';

import type { PlanCode } from '@continuum/contracts';
import { Check, CircleNotch, CreditCard, Handshake } from '@phosphor-icons/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations as useBetaTranslations, useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { fetchBillingOverview, startPlanCheckout } from '@/lib/billing/billingApi';
import {
  CHANGE_POLL_INTERVAL_MS,
  CHANGE_POLL_WINDOW_MS,
  formatUsd,
  type PlanCardView,
  toBillingView,
} from '@/lib/billing/billingViewModel';
import { billingOverviewKey } from '@/lib/billing/useBilling';
import { cn } from '@/lib/utils';

// The last onboarding step once billing is live: the brand needs at least one product — a plan
// bought through Stripe Checkout, or a Contract our team applies — before onboarding completes.
// Only Continuum staff may skip it; `completeOnboardingAction` refuses anyone else a brand with no
// product, and re-verifies staff itself.
//
// Stripe confirms a payment before our webhook grants the plan, so a Checkout return polls the
// entitlements (bounded by CHANGE_POLL_WINDOW_MS) and completes the moment a product shows up.

type PlanScreenProps = {
  brandId: string;
  onBack: () => void;
  /** Completes onboarding and goes to the dashboard. Called once, when a product is present. */
  onComplete: () => void;
  /** Present for Continuum staff only: completes onboarding without a plan. */
  onStaffSkip?: () => void;
  completing: boolean;
};

type Wait = 'idle' | 'confirming' | 'timed_out' | 'checking';

export function PlanScreen({
  brandId,
  onBack,
  onComplete,
  onStaffSkip,
  completing,
}: PlanScreenProps) {
  const uiLocale = useLocale();
  const tBilling = useTranslations('settings');
  const tUi = useTranslations('onboarding');
  const uiErrorMessage = useUiErrorMessage();

  const betaUiText = useBetaTranslations('onboarding');

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { show } = useToast();
  const [selected, setSelected] = useState<PlanCode[]>([]);
  const [wait, setWait] = useState<Wait>('idle');
  const [notEnabledYet, setNotEnabledYet] = useState(false);
  const completedRef = useRef(false);

  const polling = wait === 'confirming';
  const overview = useQuery({
    queryKey: billingOverviewKey(brandId),
    queryFn: () => fetchBillingOverview(brandId),
    refetchInterval: polling ? CHANGE_POLL_INTERVAL_MS : false,
    retry: 1,
  });
  const products = overview.data?.entitlements.products ?? [];
  const view = overview.data
    ? toBillingView(overview.data, null, { locale: uiLocale, t: tBilling })
    : null;
  const plans = view?.kind === 'self_serve' ? view.plans : [];
  const activating = plans.some((plan) => plan.status === 'activating');

  // Returning from Stripe: read the outcome once, then drop it from the URL so a reload does not
  // replay it.
  const checkoutOutcome = searchParams.get('checkout');
  useEffect(() => {
    if (!checkoutOutcome) return;
    router.replace(`${pathname}?brand=${brandId}`, { scroll: false });
    if (checkoutOutcome === 'success') setWait('confirming');
    if (checkoutOutcome === 'cancel') {
      show({
        title: tUi('m_2679d42017'),
        description: tUi('m_b8c5fe4b14'),
        variant: 'info',
      });
    }
  }, [brandId, checkoutOutcome, pathname, router, show, tUi]);

  // A plan Stripe already put on the subscription is on its way — wait for it, never re-sell it.
  useEffect(() => {
    if (activating) setWait((current) => (current === 'idle' ? 'confirming' : current));
  }, [activating]);

  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => setWait('timed_out'), CHANGE_POLL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [polling]);

  // The step's only job: once the brand has a product, finish onboarding.
  useEffect(() => {
    if (products.length === 0 || completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [products.length, onComplete]);

  const checkout = useMutation({
    mutationFn: () => {
      const back = (outcome: 'success' | 'cancel') =>
        `${window.location.origin}${pathname}?brand=${brandId}&checkout=${outcome}`;
      return startPlanCheckout(brandId, {
        plans: selected,
        successUrl: back('success'),
        cancelUrl: back('cancel'),
      });
    },
    onSuccess: (session) => window.location.assign(session.url),
    onError: (error) =>
      show({
        title: tUi('m_12369214b3'),
        description: uiErrorMessage(error),
        variant: 'error',
      }),
  });
  const redirecting = checkout.isPending || checkout.isSuccess;

  const checkAgain = async () => {
    setWait('checking');
    const result = await overview.refetch();
    const hasProduct = (result.data?.entitlements.products.length ?? 0) > 0;
    setNotEnabledYet(!hasProduct);
    setWait('idle');
  };

  const toggle = (planCode: PlanCode) =>
    setSelected((current) =>
      current.includes(planCode)
        ? current.filter((code) => code !== planCode)
        : [...current, planCode],
    );
  const selectedTotal = plans
    .filter((plan) => selected.includes(plan.planCode))
    .reduce((sum, plan) => sum + plan.monthlyPriceUsd, 0);

  const busy = completing || products.length > 0 || wait === 'confirming';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-10 pb-32 md:px-8">
      <header className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_22%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
          <CreditCard className="h-3 w-3" />
          {tUi('m_1d09cdfe01')}
        </div>
        <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
          {tUi('m_12a7bc47d4')}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {tUi('m_c9586f350e')}
        </p>
      </header>

      {products.length > 0 ? (
        <PlanActiveState completing={completing} onContinue={onComplete} />
      ) : wait === 'confirming' ? (
        <ConfirmingState />
      ) : overview.isPending ? (
        <PlanSkeleton />
      ) : overview.isError ? (
        <div role="alert" className="space-y-3 text-center text-sm">
          <p className="text-muted-foreground">
            {tUi('m_05ee49cb15')}
            {uiErrorMessage(overview.error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => void overview.refetch()}>
            {tUi('m_042c862e44')}
          </Button>
        </div>
      ) : (
        <>
          {wait === 'timed_out' ? (
            <p role="status" className="mb-4 text-center text-sm text-muted-foreground">
              {tUi('m_c3ae3fa817')}
            </p>
          ) : null}
          <fieldset aria-label={tUi('m_cf2e5f26fe')} className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => (
              <PlanOption
                key={plan.planCode}
                plan={plan}
                selected={selected.includes(plan.planCode)}
                onToggle={() => toggle(plan.planCode)}
              />
            ))}
          </fieldset>

          <section
            aria-label={tUi('m_46c58bfacc')}
            className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex gap-3">
              <Handshake className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-foreground">{tUi('m_46c58bfacc')}</h2>
                <p className="max-w-[52ch] text-sm text-muted-foreground">{tUi('m_b50fbe4b68')}</p>
                {notEnabledYet ? (
                  <p
                    data-testid="plan-not-enabled"
                    role="status"
                    className="text-sm text-foreground"
                  >
                    {tUi('m_5e3af8bdac')}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={wait === 'checking'}
              aria-busy={wait === 'checking'}
              onClick={() => void checkAgain()}
            >
              {wait === 'checking' ? tUi('m_820d6004b0') : tUi('m_e185048ce3')}
            </Button>
          </section>
        </>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack} disabled={busy || redirecting}>
            {betaUiText('beta_76900f1bfd16')}
          </Button>
          {onStaffSkip && products.length === 0 ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="plan-staff-skip"
              onClick={onStaffSkip}
              disabled={busy || redirecting}
              aria-busy={completing}
            >
              {completing ? betaUiText('beta_47e171283955') : betaUiText('beta_4147a157fab6')}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {selected.length > 0 ? (
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {formatUsd(selectedTotal, 'usd', uiLocale)}
              <span className="font-sans">{tUi('m_25a3631162')}</span>
            </span>
          ) : null}
          <Button
            variant="cta"
            size="sm"
            disabled={selected.length === 0 || busy || redirecting}
            aria-busy={redirecting}
            onClick={() => checkout.mutate()}
          >
            {redirecting ? tUi('m_4b149ef50a') : tUi('m_24892ecde0')}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function PlanOption({
  plan,
  selected,
  onToggle,
}: {
  plan: PlanCardView;
  selected: boolean;
  onToggle: () => void;
}) {
  const tUi = useTranslations('onboarding');

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={tUi('m_655e8bd231', {
        v0: String(plan.name),
        v1: String(plan.priceLabel),
      })}
      onClick={onToggle}
      className={cn(
        'flex h-full flex-col gap-3 rounded-lg border bg-card p-[var(--card-pad)] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary' : 'border-border hover:border-muted-foreground/40',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{plan.name}</span>
          <span className="mt-0.5 block font-mono text-base font-semibold text-foreground tabular-nums">
            {plan.priceLabel}
            <span className="font-sans text-xs font-normal text-muted-foreground">
              {tUi('m_25a3631162')}
            </span>
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background',
          )}
        >
          {selected ? <Check className="size-3" weight="bold" /> : null}
        </span>
      </span>
      <span className="flex flex-col gap-1.5">
        {plan.features.map((feature) => (
          <span key={feature} className="flex gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span>{feature}</span>
          </span>
        ))}
      </span>
    </button>
  );
}

function ConfirmingState() {
  const tUi = useTranslations('onboarding');

  return (
    <p
      role="status"
      data-testid="plan-confirming"
      className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
    >
      <CircleNotch className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      {tUi('m_e2e125b69b')}
    </p>
  );
}

/** Completion runs on its own; the button is the retry if it failed. */
function PlanActiveState({
  completing,
  onContinue,
}: {
  completing: boolean;
  onContinue: () => void;
}) {
  const tUi = useTranslations('onboarding');

  return (
    <div data-testid="plan-active" className="flex flex-col items-center gap-3 py-10 text-center">
      <p role="status" className="text-sm text-foreground">
        {tUi('m_8cc0fb9c7f')}
      </p>
      <Button variant="success" size="sm" disabled={completing} onClick={onContinue}>
        {completing ? tUi('m_90218af7b5') : tUi('m_e5fa87580e')}
      </Button>
    </div>
  );
}

function PlanSkeleton() {
  const tUi = useTranslations('onboarding');

  return (
    <div role="status" aria-label={tUi('m_85226192ff')} className="grid gap-3 sm:grid-cols-2">
      {[0, 1].map((column) => (
        <div key={column} className="space-y-3 rounded-lg border border-border p-[var(--card-pad)]">
          <Skeleton className="h-4 w-28 bg-muted/70" />
          <Skeleton className="h-5 w-16 bg-muted/70" />
          <Skeleton className="h-3 w-3/4 bg-muted/70" />
          <Skeleton className="h-3 w-2/3 bg-muted/70" />
        </div>
      ))}
    </div>
  );
}
