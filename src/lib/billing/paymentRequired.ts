import {
  type BillingPaymentRequired,
  billingPaymentRequiredOf,
  billingPaymentRequiredSchema,
  PLAN_CODES,
} from '@continuum/contracts';
import type { ToastOptions } from '@/components/ui/ToastProvider';
import { toast } from '@/components/ui/toast-imperative';
import { billingHref, creditsHref } from './productAccess';
import { trackBillingEvent } from './telemetry';
import { openTopUp } from './topUp';

// The Backend (and any edge function) answers a product the brand has not bought, or a spent
// Canvas balance, with HTTP 402 and the contracts body. This turns that body into the one CTA
// that fixes it — never a generic "request failed".

const PRODUCT_LABEL: Record<BillingPaymentRequired['product'], string> = {
  studio: 'AI Canvas',
  organic_agent: 'Organic',
  paid_media: 'Paid media',
  trends: 'Trends',
  mcp: 'MCP connections',
  listening: 'Brand listening',
};

export function parsePaymentRequired(status: number, body: unknown): BillingPaymentRequired | null {
  if (status !== 402) return null;
  const parsed = billingPaymentRequiredSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * A 402 as a typed error: the contracts body rides on it so the surface that caught it can
 * render the refusal and its control instead of the raw JSON `fetch` would otherwise give an
 * `Error` as its message. The message is the body's own sentence, so even a caller that only
 * prints `error.message` says something a person can read.
 */
export class PaymentRequiredError extends Error {
  readonly body: BillingPaymentRequired;

  constructor(body: BillingPaymentRequired) {
    super(body.message);
    this.name = 'PaymentRequiredError';
    this.body = body;
  }
}

/** The 402 body an error carries, when it is one. */
export function readPaymentRequired(error: unknown): BillingPaymentRequired | null {
  return error instanceof PaymentRequiredError ? error.body : null;
}

/**
 * `fetch` that turns a billing 402 into `PaymentRequiredError`. For transports that own their
 * request loop (the AI SDK chat transport, streaming readers): the Backend's gate answers 402
 * before any stream starts, and two real customers saw that as an empty chat because the
 * transport threw the JSON body as text and nothing rendered it. Every other response passes
 * through untouched. The body is read from a clone so the caller's own error path still can.
 */
export async function paymentRequiredFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 402) return response;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const paymentRequired = parsePaymentRequired(response.status, body);
  if (paymentRequired) throw new PaymentRequiredError(paymentRequired);
  return response;
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
      description: body.message,
      variant: 'warning',
      durationMs: 10_000,
      dedupeKey: 'billing-402-credits',
      // The Top up dialog where they are; Settings only when no dialog is mounted.
      action: {
        label: 'Buy credits',
        onClick: () => openTopUp('toast', () => navigate(creditsHref(from))),
      },
    };
  }
  return {
    title: `${PRODUCT_LABEL[body.product]} isn't on your plan`,
    description: body.message,
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
export function notifyPaymentRequired(
  status: number,
  body: unknown,
): BillingPaymentRequired | null {
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
  // Composed through the contracts, as the Backend's gates compose theirs: the strict body
  // schema refuses a hand-rolled three-field object, which would have made this a silent null.
  return notifyPaymentRequired(
    402,
    billingPaymentRequiredOf({ error: code, product: 'studio', planCode: 'organic_studio' }),
  );
}
