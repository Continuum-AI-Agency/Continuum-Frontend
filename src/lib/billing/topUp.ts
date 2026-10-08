import { CREDIT_PACK_OFFER, type CreditPackOffer, type CreditWallet } from '@continuum/contracts';
import { checkoutReturnParams } from './billingViewModel';
import { trackBillingEvent } from './telemetry';

// "Buy credits" everywhere opens one Top up dialog where the person already is, and Stripe
// returns them to that same page — never a detour through Settings. The dialog lives in the
// app shell; toasts and canvas nodes are not React-owned by it, so they reach it through this
// module, the way `toast-imperative` reaches the ToastProvider. With no dialog mounted (a page
// outside the shell), the caller's fallback runs: the credit-pack section in Settings.

export type TopUpSource = 'toast' | 'nudge' | 'sidebar' | 'node' | 'billing';

type TopUpHost = (source: TopUpSource) => boolean;

let host: TopUpHost | null = null;

/** Called by the mounted TopUpDialog. The host returns false when it cannot sell here. */
export function registerTopUpHost(next: TopUpHost): () => void {
  host = next;
  return () => {
    if (host === next) host = null;
  };
}

export function openTopUp(source: TopUpSource, fallback: () => void): void {
  if (host?.(source)) {
    trackBillingEvent('top_up_opened', { source });
    return;
  }
  fallback();
}

export const TOP_UP_PACK_PRESETS = [1, 5, 10] as const;
export const DEFAULT_TOP_UP_PACKS = 5;

export function topUpPackPresets(offer: CreditPackOffer = CREDIT_PACK_OFFER): number[] {
  return TOP_UP_PACK_PRESETS.filter((packs) => packs <= offer.maxPacks);
}

const CHECKOUT_RETURN_PARAMS = ['checkout', 'plan', 'balance', 'xbalance', 'session_id'] as const;

/** `search` without a Checkout return's params: what the page reads as once the return is handled. */
export function withoutCheckoutReturn(search: string, alsoDrop: readonly string[] = []): string {
  const params = new URLSearchParams(search);
  for (const key of [...CHECKOUT_RETURN_PARAMS, ...alsoDrop]) params.delete(key);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Stripe's success/cancel URLs for a pack bought from `href` (the page the person is on). The
 * page is kept as is — its path, its other params, its `from=` — so the return lands exactly
 * where the purchase started and the page's own return handler confirms it.
 */
export function topUpReturnUrls(
  href: string,
  purchasedCreditsBefore: number,
  wallet: CreditWallet = 'canvas',
): { successUrl: string; cancelUrl: string } {
  const query = checkoutReturnParams(
    wallet === 'x'
      ? { kind: 'x_credits_added', xCreditsBefore: purchasedCreditsBefore }
      : { kind: 'credits_added', purchasedCreditsBefore },
  );
  const build = (returnQuery: string) => {
    const url = new URL(href);
    url.hash = '';
    for (const key of CHECKOUT_RETURN_PARAMS) url.searchParams.delete(key);
    for (const [key, value] of new URLSearchParams(returnQuery)) {
      // The Settings section comes from the page itself; never pull the buyer onto Billing.
      if (key !== 'section') url.searchParams.set(key, value);
    }
    return url.toString();
  };
  return { successUrl: build(query.success), cancelUrl: build(query.cancel) };
}
