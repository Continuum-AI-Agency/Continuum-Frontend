import {
  type BillingCheckoutReceipt,
  type BillingCheckoutResponse,
  type BillingCreditCheckoutResponse,
  type BillingOverageResponse,
  type BillingOverview,
  type BillingPlanChangeRequest,
  type BillingPlanChangeResponse,
  type BillingPortalResponse,
  billingApiErrorSchema,
  type CreditWallet,
  billingCheckoutReceiptSchema,
  billingCheckoutRequestSchema,
  billingCheckoutResponseSchema,
  billingCreditCheckoutRequestSchema,
  billingCreditCheckoutResponseSchema,
  billingCreditRedeemRequestSchema,
  billingOverageRequestSchema,
  billingOverageResponseSchema,
  billingOverviewSchema,
  billingPlanChangeRequestSchema,
  billingPlanChangeResponseSchema,
  billingPortalRequestSchema,
  billingPortalResponseSchema,
  type PlanCode,
} from '@continuum/contracts';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { trackBillingEvent } from './telemetry';

// Typed client for the `billing-api` edge function. Every call runs as the signed-in user
// (supabase-js attaches the session bearer), every request body is built through its
// contracts schema, and every response is Zod-parsed — a shape drift fails here, loudly,
// instead of rendering a half-empty panel.

export class BillingApiRequestError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'BillingApiRequestError';
  }
}

export function isBillingManagerRequired(error: unknown): boolean {
  return (
    error instanceof BillingApiRequestError &&
    error.status === 403 &&
    error.code === 'billing_manager_required'
  );
}

/** A refused promo code, in the words the Redeem field shows under the input. */
export function promoErrorMessage(error: unknown): string {
  const code = error instanceof BillingApiRequestError ? error.code : null;
  if (code === 'promo_code_not_found') return "That code isn't valid for this brand.";
  if (code === 'promo_code_used') return 'This code has already been used.';
  if (code === 'invalid_request') return 'Enter a promo code.';
  return "Couldn't check that code. Try again.";
}

async function toRequestError(path: string, error: unknown): Promise<BillingApiRequestError> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => null);
    const parsed = billingApiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { error: code, message } = parsed.data;
      return new BillingApiRequestError(
        response.status,
        code,
        [response.status, code, message].filter(Boolean).join(' · '),
      );
    }
    return new BillingApiRequestError(
      response.status,
      null,
      `${response.status} · ${path} · ${body === null ? error.message : JSON.stringify(body)}`,
    );
  }
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return new BillingApiRequestError(null, null, `${path} · ${message}`);
}

async function callBillingApi<T>(
  path: string,
  schema: z.ZodType<T>,
  init: { method: 'GET' } | { method: 'POST'; body: Record<string, unknown> },
): Promise<T> {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke<unknown>(
    `billing-api/${path}`,
    init.method === 'GET' ? { method: 'GET' } : { method: 'POST', body: init.body },
  );
  if (error) throw await toRequestError(path, error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new BillingApiRequestError(
      200,
      'invalid_response',
      `${path} returned an unexpected shape · ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function fetchBillingOverview(brandId: string): Promise<BillingOverview> {
  // `include=x` opts in to the X API wallet; billing-api leaves it out for older clients.
  return callBillingApi(`brands/${brandId}/overview?include=x`, billingOverviewSchema, {
    method: 'GET',
  });
}

export function fetchCheckoutReceipt(
  brandId: string,
  sessionId: string,
): Promise<BillingCheckoutReceipt> {
  return callBillingApi(
    `brands/${brandId}/checkout-sessions/${encodeURIComponent(sessionId)}`,
    billingCheckoutReceiptSchema,
    { method: 'GET' },
  );
}

/**
 * Stripe swaps `{CHECKOUT_SESSION_ID}` in the success URL for the real id, so the return can
 * fetch its receipt. Appended as raw text, last: URLSearchParams would encode the braces, and
 * Stripe only substitutes the literal template.
 */
export function withCheckoutSessionId(successUrl: string): string {
  return `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;
}

export function startPlanCheckout(
  brandId: string,
  input: { plans: PlanCode[]; successUrl: string; cancelUrl: string },
): Promise<BillingCheckoutResponse> {
  trackBillingEvent('checkout_started', { kind: 'plan', plans: input.plans.join(',') });
  return callBillingApi(`brands/${brandId}/checkout`, billingCheckoutResponseSchema, {
    method: 'POST',
    body: billingCheckoutRequestSchema.parse({
      ...input,
      successUrl: withCheckoutSessionId(input.successUrl),
    }),
  });
}

export function changePlan(
  brandId: string,
  input: BillingPlanChangeRequest,
): Promise<BillingPlanChangeResponse> {
  return callBillingApi(`brands/${brandId}/plans`, billingPlanChangeResponseSchema, {
    method: 'POST',
    body: billingPlanChangeRequestSchema.parse(input),
  });
}

/**
 * Auto-bill overage to the card on file — Canvas, or the X API wallet with `meter: 'x'` — by
 * adding or removing that metered item on the subscription.
 */
export function setOverageBilling(
  brandId: string,
  input: { enabled: boolean; meter?: CreditWallet },
): Promise<BillingOverageResponse> {
  return callBillingApi(`brands/${brandId}/overage`, billingOverageResponseSchema, {
    method: 'POST',
    body: billingOverageRequestSchema.parse(input),
  });
}

/** One-time credit packs for the Canvas wallet, or the X API wallet with `wallet: 'x'`. */
export function startCreditCheckout(
  brandId: string,
  input: { packs: number; wallet?: CreditWallet; successUrl: string; cancelUrl: string },
): Promise<BillingCreditCheckoutResponse> {
  trackBillingEvent('checkout_started', {
    kind: input.wallet === 'x' ? 'x_credits' : 'credits',
    packs: input.packs,
  });
  return callBillingApi(`brands/${brandId}/credits/checkout`, billingCreditCheckoutResponseSchema, {
    method: 'POST',
    body: billingCreditCheckoutRequestSchema.parse({
      ...input,
      successUrl: withCheckoutSessionId(input.successUrl),
    }),
  });
}

/** A promo code, applied up front: Checkout for the packs it covers, returning to `successUrl`. */
export function redeemCreditPromo(
  brandId: string,
  input: { code: string; successUrl: string; cancelUrl: string },
): Promise<BillingCreditCheckoutResponse> {
  trackBillingEvent('checkout_started', { kind: 'credits', promo: true });
  return callBillingApi(`brands/${brandId}/credits/redeem`, billingCreditCheckoutResponseSchema, {
    method: 'POST',
    body: billingCreditRedeemRequestSchema.parse({
      ...input,
      successUrl: withCheckoutSessionId(input.successUrl),
    }),
  });
}

export function openBillingPortal(
  brandId: string,
  input: { returnUrl: string },
): Promise<BillingPortalResponse> {
  return callBillingApi(`brands/${brandId}/portal`, billingPortalResponseSchema, {
    method: 'POST',
    body: billingPortalRequestSchema.parse(input),
  });
}
