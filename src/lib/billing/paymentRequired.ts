import {
  type BillingPaymentRequired,
  billingPaymentRequiredSchema,
  PLAN_CODES,
} from '@continuum/contracts';
import type { ToastOptions } from '@/components/ui/ToastProvider';
import { toast } from '@/components/ui/toast-imperative';
import { billingHref, CREDITS_HREF, PLAN_NAME_FOR_PRODUCT } from './productAccess';

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

export function paymentRequiredToast(
  body: BillingPaymentRequired,
  navigate: (href: string) => void,
): ToastOptions {
  if (body.error === 'credits_exhausted') {
    return {
      title: 'Out of Canvas credits',
      description: 'Buy a credit pack, or turn on auto-billing, to keep generating.',
      variant: 'warning',
      durationMs: 10_000,
      dedupeKey: 'billing-402-credits',
      action: { label: 'Buy credits', onClick: () => navigate(CREDITS_HREF) },
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
        ? { label: 'Upgrade', onClick: () => navigate(billingHref(body.product)) }
        : undefined,
  };
}

/**
 * Shows the upgrade / buy-credits toast when `status` + `body` are a billing 402. Returns
 * whether it did. Browser only — on the server there is nobody to show a toast to.
 */
export function notifyPaymentRequired(status: number, body: unknown): boolean {
  if (typeof window === 'undefined') return false;
  const paymentRequired = parsePaymentRequired(status, body);
  if (!paymentRequired) return false;
  const { title, description, durationMs, dedupeKey, action } = paymentRequiredToast(
    paymentRequired,
    (href) => window.location.assign(href),
  );
  toast.warning(title, { description, durationMs, dedupeKey, action });
  return true;
}
