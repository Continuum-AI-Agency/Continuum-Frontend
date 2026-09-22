import {
  type BillingCheckoutResponse,
  type BillingCreditCheckoutResponse,
  type BillingOverageResponse,
  type BillingOverview,
  type BillingPlanChangeRequest,
  type BillingPlanChangeResponse,
  type BillingPortalResponse,
  billingApiErrorSchema,
  billingCheckoutRequestSchema,
  billingCheckoutResponseSchema,
  billingCreditCheckoutRequestSchema,
  billingCreditCheckoutResponseSchema,
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
  return callBillingApi(`brands/${brandId}/overview`, billingOverviewSchema, { method: 'GET' });
}

export function startPlanCheckout(
  brandId: string,
  input: { plans: PlanCode[]; successUrl: string; cancelUrl: string },
): Promise<BillingCheckoutResponse> {
  return callBillingApi(`brands/${brandId}/checkout`, billingCheckoutResponseSchema, {
    method: 'POST',
    body: billingCheckoutRequestSchema.parse(input),
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

/** Auto-bill Canvas overage to the card on file: adds or removes the metered subscription item. */
export function setOverageBilling(
  brandId: string,
  input: { enabled: boolean },
): Promise<BillingOverageResponse> {
  return callBillingApi(`brands/${brandId}/overage`, billingOverageResponseSchema, {
    method: 'POST',
    body: billingOverageRequestSchema.parse(input),
  });
}

export function startCreditCheckout(
  brandId: string,
  input: { packs: number; successUrl: string; cancelUrl: string },
): Promise<BillingCreditCheckoutResponse> {
  return callBillingApi(`brands/${brandId}/credits/checkout`, billingCreditCheckoutResponseSchema, {
    method: 'POST',
    body: billingCreditCheckoutRequestSchema.parse(input),
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
