/**
 * Stripe Checkout return query handling for Settings → Billing.
 */

export type CheckoutReturnStatus = 'success' | 'cancel' | null;

export function parseCheckoutReturnStatus(
  searchParams: URLSearchParams | { get(name: string): string | null },
): CheckoutReturnStatus {
  const raw = searchParams.get('billing');
  if (raw === 'success' || raw === 'cancel') return raw;
  return null;
}

/** Drop checkout-return flags while keeping section=billing (and other params). */
export function stripCheckoutReturnParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());
  next.delete('billing');
  next.delete('session_id');
  if (!next.get('section')) {
    next.set('section', 'billing');
  }
  return next;
}

export function buildCheckoutReturnUrls(input: {
  origin: string;
  pathname: string;
  search: string;
}): { successUrl: string; cancelUrl: string; returnBase: string } {
  const params = new URLSearchParams(input.search);
  params.set('section', 'billing');
  // Stripe substitutes {CHECKOUT_SESSION_ID} on success.
  params.delete('billing');
  params.delete('session_id');
  const returnBase = `${input.origin}${input.pathname}?${params.toString()}`;
  return {
    returnBase,
    successUrl: `${returnBase}&billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${returnBase}&billing=cancel`,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
