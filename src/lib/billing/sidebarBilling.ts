import { PLAN_CODES, usdToCredits } from '@continuum/contracts';
import { type BrandAccess, billingHref, CREDITS_HREF, PLAN_NAME } from './productAccess';

// What the sidebar's bottom-left billing widget shows for the active brand, decided from the
// server-read entitlements alone (members can read them; billing-api is owner-only). Pure, so
// every state is unit-tested here and the layout only passes the result down.

/** Below this many credits, or below LOW_SHARE of the period allowance, the widget warns. */
export const LOW_CREDITS_FLOOR = 100;
export const LOW_CREDITS_SHARE = 0.1;

export type MeteredSidebarBilling = {
  kind: 'metered';
  href: string;
  planLabel: string;
  remainingCredits: number;
  includedRemainingCredits: number;
  includedCredits: number;
  rolloverCredits: number;
  purchasedCredits: number;
  periodEnd: string | null;
  autoBilling: { on: true; capUsd: number | null } | { on: false };
  low: boolean;
  /** Nothing left and no auto-billing: generation is refused until a pack is bought. */
  exhausted: boolean;
};

export type SidebarBillingView =
  | MeteredSidebarBilling
  /** Contract, or products granted without a Stripe plan (admin / grandfathered): unmetered. */
  | { kind: 'managed'; href: string }
  | { kind: 'no_plan'; href: string };

export function toSidebarBilling(
  access: Pick<BrandAccess, 'billingLive' | 'entitlements'>,
): SidebarBillingView | null {
  // billing-cutover: not live ⇒ nothing, exactly as before billing. A failed read shows nothing
  // either — the widget never claims "No plan" for a brand it could not read.
  if (!access.billingLive || !access.entitlements) return null;
  const { billingModel, plans, products, buckets, creditBalance } = access.entitlements;

  if (billingModel === 'contract') return { kind: 'managed', href: billingHref() };
  if (plans.length === 0) {
    return products.length > 0
      ? { kind: 'managed', href: billingHref() }
      : { kind: 'no_plan', href: billingHref() };
  }

  const studio = buckets.find((bucket) => bucket.bucket === 'studio') ?? null;
  const includedCredits = studio ? usdToCredits(studio.includedUsd) : 0;
  const includedRemainingCredits = studio
    ? usdToCredits(Math.max(studio.includedUsd - studio.consumedUsd, 0))
    : 0;
  const remainingCredits =
    includedRemainingCredits + creditBalance.rolloverCredits + creditBalance.purchasedCredits;
  const autoBilling =
    studio?.overageAction === 'bill'
      ? { on: true as const, capUsd: studio.capUsd }
      : { on: false as const };

  return {
    kind: 'metered',
    href: CREDITS_HREF,
    planLabel: [...plans]
      .sort((a, b) => PLAN_CODES.indexOf(a) - PLAN_CODES.indexOf(b))
      .map((plan) => PLAN_NAME[plan])
      .join(' + '),
    remainingCredits,
    includedRemainingCredits,
    includedCredits,
    rolloverCredits: creditBalance.rolloverCredits,
    purchasedCredits: creditBalance.purchasedCredits,
    periodEnd: studio?.periodEnd ?? null,
    autoBilling,
    low:
      remainingCredits < LOW_CREDITS_FLOOR ||
      remainingCredits < includedCredits * LOW_CREDITS_SHARE,
    exhausted: remainingCredits === 0 && !autoBilling.on,
  };
}
