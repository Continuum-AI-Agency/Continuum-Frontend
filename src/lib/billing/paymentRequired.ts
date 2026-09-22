import {
  type BillingPaymentRequired,
  billingPaymentRequiredSchema,
  PLAN_CODES,
} from '@continuum/contracts';
import type { ToastOptions } from '@/components/ui/ToastProvider';
import { toast } from '@/components/ui/toast-imperative';
import { billingHref, creditsHref, PLAN_NAME_FOR_PRODUCT } from './productAccess';
import { trackBillingEvent } from './telemetry';

// The Backend (and any edge function) answers a product the brand has not bought, or a spent
// Canvas balance, with HTTP 402 and the contracts body. This turns that body into the one CTA
// that fixes it — never a generic "request failed".

const PRODUCT_LABEL: Record<BillingPaymentRequired['product'], string> = {
  studio: 'AI Canvas',
  organic_agent: 'Organic',
  paid_media: 'Paid media',
  trends: 'Trends',
  mcp: 'MCP connections',
};

export function parsePaymentRequired(status: number, body: unknown): BillingPaymentRequired | null {
  if (status !== 402) return null;
  const parsed = billingPaymentRequiredSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/** `from` is the page the refusal happened on: Billing offers the way back after the purchase. */
export function paymentRequiredToast(
  body: BillingPaymentRequired,
  navigate: (href: string) => void,
  from?: string,
): ToastOptions {
  if (body.error === 'credits_exhausted') {
    return {
      title: 'Out of Canvas credits',
      description: 'Add a credit pack to keep generating.',
      variant: 'warning',
      durationMs: 10_000,
      dedupeKey: 'billing-402-credits',
      action: { label: 'Buy credits', onClick: () => navigate(creditsHref(from)) },
    };
  }
  const planName = PLAN_NAME_FOR_PRODUCT[body.product];
  return {
    title: `${PRODUCT_LABEL[body.product]} isn't on your plan`,
    description: planName
      ? `Upgrade to ${planName} to use it.`
      : 'Ask your Continuum team to turn it on for this brand.',
    variant: 'warning',
    durationMs: 10_000,
    dedupeKey: `billing-402-${body.product}`,
    // A product no self-serve plan sells (planCode null) has nothing to buy, so no button.
    action:
      body.planCode && (PLAN_CODES as readonly string[]).includes(body.planCode)
        ? { label: 'Upgrade', onClick: () => navigate(billingHref(body.product, from)) }
        : undefined,
  };
}

/**
 * Shows the upgrade / buy-credits toast when `status` + `body` are a billing 402, and returns
 * the refusal it showed. Browser only — on the server there is nobody to show a toast to.
 */
export function notifyPaymentRequired(status: number, body: unknown): BillingPaymentRequired | null {
  if (typeof window === 'undefined') return null;
  const paymentRequired = parsePaymentRequired(status, body);
  if (!paymentRequired) return null;
  const { title, description, durationMs, dedupeKey, action } = paymentRequiredToast(
    paymentRequired,
    (href) => window.location.assign(href),
    `${window.location.pathname}${window.location.search}`,
  );
  toast.warning(title, { description, durationMs, dedupeKey, action });
  trackBillingEvent('payment_required_shown', {
    error: paymentRequired.error,
    product: paymentRequired.product,
  });
  return paymentRequired;
}

/**
 * `notifyPaymentRequired` for a raw `fetch` — the canvas's SSE generations bypass `http`, so a
 * spent balance reached them as "API request failed: 402 - {…}". Reads a clone: the caller's
 * own error path can still read the body.
 */
export async function notifyPaymentRequiredResponse(
  response: Response,
): Promise<BillingPaymentRequired | null> {
  if (response.status !== 402) return null;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  return notifyPaymentRequired(response.status, body);
}

/**
 * A Canvas SSE `error` frame whose code is the billing refusal (the allowance ran out between the
 * route's pre-check and the provider call) gets the same toast as the 402 — never a generic one.
 */
export function notifyStreamPaymentRequired(code: unknown): BillingPaymentRequired | null {
  if (code !== 'credits_exhausted' && code !== 'product_required') return null;
  return notifyPaymentRequired(402, { error: code, product: 'studio', planCode: 'organic_studio' });
}
