import {
  type BillingOverview,
  type CreditPackOffer,
  PLAN_CODES,
  type PlanCode,
  PRODUCT_CODES,
  type ProductCode,
  planCodeSchema,
  usdToCredits,
} from '@continuum/contracts';

// Pure mapping from the billing-api overview to what Settings → Billing renders. No React,
// no fetching — so every state the panel can be in is decided (and unit-tested) here.

const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

const PRODUCT_FEATURES: Record<ProductCode, string> = {
  studio: 'AI Canvas',
  organic_agent: 'Organic agent, calendar and posting',
  paid_media: 'Jaina, Forge ad creation, approvals and optimizer',
  trends: 'Trends',
  mcp: 'MCP connections',
};

export type PlanStatus = 'active' | 'activating' | 'available';
/** `none` when the plan is the subscription's only one: cancelling lives in the Stripe portal. */
export type PlanAction = 'checkout' | 'add' | 'remove' | 'none';

export type PlanCardView = {
  planCode: PlanCode;
  name: string;
  monthlyPriceUsd: number;
  priceLabel: string;
  features: string[];
  status: PlanStatus;
  action: PlanAction;
  /** The plan grants the product a gated page sent the user here for (`?need=`). */
  highlighted: boolean;
};

export type CanvasCreditsView = {
  availableCredits: number;
  includedCredits: number;
  includedUsedCredits: number;
  includedRemainingCredits: number;
  rolloverCredits: number;
  purchasedCredits: number;
  overageCredits: number;
  overageUsd: number;
  overageCapUsd: number | null;
  billsOverageToCard: boolean;
  periodEnd: string | null;
};

export type InvoiceRowView = {
  id: string;
  label: string;
  createdAt: string;
  amountLabel: string;
  status: string;
  href: string | null;
};

/** The owner's "Auto-bill overage to card" switch. */
export type AutoBillingView = {
  /** The live subscription carries the metered overage price (`overview.overageEnabled`). */
  enabled: boolean;
  /** The monthly ceiling auto-billing applies; null when there is no live subscription. */
  capUsd: number | null;
  /** Why the switch cannot be flipped, or null when the owner can flip it. */
  disabledReason: string | null;
};

export const AUTO_BILLING_NEEDS_PLAN =
  'Choose a plan first — auto-billing charges overage to the card on your subscription.';
export const AUTO_BILLING_CONTRACT =
  'Contract brands are billed through their agreement and never metered.';

export type SelfServeBillingView = {
  kind: 'self_serve';
  hasLiveSubscription: boolean;
  cancelAtPeriodEnd: boolean;
  renewsAt: string | null;
  hasPaymentMethod: boolean;
  plans: PlanCardView[];
  credits: CanvasCreditsView;
  /** Nothing left and nothing billed to the card: generation is refused until the owner acts. */
  outOfCredits: boolean;
  autoBilling: AutoBillingView;
  creditPack: CreditPackOffer;
  invoices: InvoiceRowView[];
};

export type ContractBillingView = {
  kind: 'contract';
  features: string[];
  autoBilling: AutoBillingView;
};

export type BillingView = SelfServeBillingView | ContractBillingView;

export function formatUsd(amount: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCredits(credits: number): string {
  return credits.toLocaleString('en-US');
}

function featuresFor(products: readonly ProductCode[], includedCanvasCredits = 0): string[] {
  const features = [...products]
    .sort((a, b) => PRODUCT_CODES.indexOf(a) - PRODUCT_CODES.indexOf(b))
    .map((product) => PRODUCT_FEATURES[product]);
  if (includedCanvasCredits > 0) {
    features.push(`${formatCredits(includedCanvasCredits)} Canvas credits included every month`);
  }
  return features;
}

function planAction(plan: PlanCode, livePlans: readonly PlanCode[] | null): PlanAction {
  if (!livePlans) return 'checkout';
  if (!livePlans.includes(plan)) return 'add';
  return livePlans.length > 1 ? 'remove' : 'none';
}

function toCreditsView(overview: BillingOverview): CanvasCreditsView {
  const { studioBucket, rolloverUsd, purchasedBalanceUsd, overageUsd } = overview.canvas;
  const includedCredits = studioBucket ? usdToCredits(studioBucket.includedUsd) : 0;
  const includedRemainingCredits = studioBucket
    ? usdToCredits(Math.max(studioBucket.includedUsd - studioBucket.consumedUsd, 0))
    : 0;
  const rolloverCredits = usdToCredits(rolloverUsd);
  const purchasedCredits = usdToCredits(purchasedBalanceUsd);
  return {
    availableCredits: includedRemainingCredits + rolloverCredits + purchasedCredits,
    includedCredits,
    includedUsedCredits: includedCredits - includedRemainingCredits,
    includedRemainingCredits,
    rolloverCredits,
    purchasedCredits,
    overageCredits: usdToCredits(overageUsd),
    overageUsd,
    overageCapUsd: studioBucket?.capUsd ?? null,
    billsOverageToCard: overview.hasPaymentMethod && studioBucket?.overageAction === 'bill',
    periodEnd: studioBucket?.periodEnd ?? null,
  };
}

/** Only the owner manages billing; billing-api enforces the same rule with a 403. */
export function isBrandOwner(
  permissions: readonly { brand_profile_id: string; role: string | null }[],
  brandId: string,
): boolean {
  return permissions.some(
    (permission) => permission.brand_profile_id === brandId && permission.role === 'owner',
  );
}

/** What a highlighted plan says it unlocks, per `?need=` product. */
export const NEED_LABEL: Record<ProductCode, string> = {
  studio: 'AI Canvas',
  organic_agent: 'Organic',
  paid_media: 'paid media',
  trends: 'Trends',
  mcp: 'MCP connections',
};

export function toBillingView(
  overview: BillingOverview,
  need: ProductCode | null = null,
): BillingView {
  const { entitlements, subscription } = overview;
  if (entitlements.billingModel === 'contract') {
    return {
      kind: 'contract',
      features: featuresFor(entitlements.products),
      autoBilling: { enabled: false, capUsd: null, disabledReason: AUTO_BILLING_CONTRACT },
    };
  }

  const liveSubscription =
    subscription && LIVE_SUBSCRIPTION_STATUSES.has(subscription.status) ? subscription : null;
  const livePlans = liveSubscription?.plans ?? null;
  const catalogOrder = (plan: PlanCode) => PLAN_CODES.indexOf(plan);

  const plans = [...overview.catalog.plans]
    .sort((a, b) => catalogOrder(a.planCode) - catalogOrder(b.planCode))
    .map<PlanCardView>((plan) => ({
      planCode: plan.planCode,
      name: plan.displayName,
      monthlyPriceUsd: plan.monthlyPriceUsd,
      priceLabel: formatUsd(plan.monthlyPriceUsd),
      features: featuresFor(plan.products, plan.includedCanvasCredits),
      status: entitlements.plans.includes(plan.planCode)
        ? 'active'
        : livePlans?.includes(plan.planCode)
          ? 'activating'
          : 'available',
      action: planAction(plan.planCode, livePlans),
      highlighted: need !== null && plan.products.includes(need),
    }));

  const credits = toCreditsView(overview);
  return {
    kind: 'self_serve',
    hasLiveSubscription: liveSubscription !== null,
    cancelAtPeriodEnd: liveSubscription?.cancelAtPeriodEnd ?? false,
    renewsAt: liveSubscription?.currentPeriodEnd ?? null,
    hasPaymentMethod: overview.hasPaymentMethod,
    plans,
    credits,
    outOfCredits:
      liveSubscription !== null && credits.availableCredits === 0 && !credits.billsOverageToCard,
    autoBilling: {
      enabled: overview.overageEnabled,
      capUsd: overview.overageCapUsd,
      disabledReason: liveSubscription ? null : AUTO_BILLING_NEEDS_PLAN,
    },
    creditPack: overview.catalog.creditPack,
    invoices: overview.invoices.map((invoice) => ({
      id: invoice.id,
      label: invoice.number ?? invoice.id,
      createdAt: invoice.createdAt,
      amountLabel: formatUsd(invoice.total / 100, invoice.currency),
      status: invoice.status ?? 'unknown',
      href: invoice.hostedInvoiceUrl,
    })),
  };
}

// ── Waiting for the webhook ──────────────────────────────────────────────────────────────
// Stripe confirms a purchase before our webhook grants it: Checkout redirects back to
// /settings?section=billing&checkout=success|cancel, and a plan change returns as soon as
// the subscription is updated. Either way the panel polls the overview until the change is
// visible — bounded by CHANGE_POLL_WINDOW_MS, never forever.

export const CHANGE_POLL_INTERVAL_MS = 2_000;
export const CHANGE_POLL_WINDOW_MS = 60_000;

export type PendingBillingChange =
  | { kind: 'plan_added'; plan: PlanCode }
  | { kind: 'plan_removed'; plan: PlanCode }
  | { kind: 'credits_added'; purchasedCreditsBefore: number }
  | { kind: 'overage_changed'; enabled: boolean };

export type CheckoutReturn =
  | { outcome: 'cancel' }
  | { outcome: 'success'; change: PendingBillingChange };

type SearchParamsLike = { get(name: string): string | null };

export function checkoutReturnParams(
  change: Extract<PendingBillingChange, { kind: 'plan_added' | 'credits_added' }>,
): { success: string; cancel: string } {
  const success = new URLSearchParams({ section: 'billing', checkout: 'success' });
  if (change.kind === 'plan_added') success.set('plan', change.plan);
  else success.set('balance', String(change.purchasedCreditsBefore));
  return {
    success: success.toString(),
    cancel: new URLSearchParams({ section: 'billing', checkout: 'cancel' }).toString(),
  };
}

export function parseCheckoutReturn(params: SearchParamsLike): CheckoutReturn | null {
  const outcome = params.get('checkout');
  if (outcome === 'cancel') return { outcome: 'cancel' };
  if (outcome !== 'success') return null;

  const plan = planCodeSchema.safeParse(params.get('plan'));
  if (plan.success) return { outcome: 'success', change: { kind: 'plan_added', plan: plan.data } };

  const rawBalance = params.get('balance');
  const balance = Number(rawBalance);
  if (rawBalance !== null && Number.isInteger(balance) && balance >= 0) {
    return {
      outcome: 'success',
      change: { kind: 'credits_added', purchasedCreditsBefore: balance },
    };
  }
  return null;
}

export function isChangeSettled(change: PendingBillingChange, overview: BillingOverview): boolean {
  switch (change.kind) {
    case 'plan_added':
      return overview.entitlements.plans.includes(change.plan);
    case 'plan_removed':
      return !overview.entitlements.plans.includes(change.plan);
    case 'credits_added':
      return usdToCredits(overview.canvas.purchasedBalanceUsd) > change.purchasedCreditsBefore;
    case 'overage_changed': {
      // The subscription flips at once; the studio bucket only once Stripe's webhook lands, and
      // that bucket is what the meter enforces and the sidebar widget reads.
      const studio = overview.entitlements.buckets.find((bucket) => bucket.bucket === 'studio');
      return (
        overview.overageEnabled === change.enabled &&
        (!studio || (studio.overageAction === 'bill') === change.enabled)
      );
    }
  }
}
