import { z } from 'zod';

export * from './modelId';

/**
 * Self-serve billing contracts — the one model: prod `billing.*` (USD ledger).
 *
 * `billing.brand_products` is the access grid; `billing.get_brand_entitlements` is the
 * single read. Stripe writes it only through `stripe-billing-webhook` →
 * `billing.apply_stripe_projection`; admins and Contract clients write it directly.
 */

export const PRODUCT_CODES = ['studio', 'organic_agent', 'paid_media', 'trends', 'mcp'] as const;
export const productCodeSchema = z.enum(PRODUCT_CODES);
export type ProductCode = z.infer<typeof productCodeSchema>;

export const ADDON_CODES = [
  'provider_exa',
  'provider_serpapi',
  'provider_apify',
  'provider_x',
  'provider_firecrawl',
] as const;
export const addonCodeSchema = z.enum(ADDON_CODES);
export type AddonCode = z.infer<typeof addonCodeSchema>;

/** The two plans sold self-serve. Codes are the `billing.plan_definitions` keys. */
export const PLAN_CODES = ['organic_studio', 'paid_media'] as const;
export const planCodeSchema = z.enum(PLAN_CODES);
export type PlanCode = z.infer<typeof planCodeSchema>;

/** 1 credit = $0.01 of billed usage (provider cost × 1.15, rounded up per generation). */
export const USD_PER_CREDIT = 0.01;
export const CREDIT_PACK_CREDITS = 1_000;
export const CREDIT_PACK_PRICE_USD = 10;
export const MAX_CREDIT_PACKS = 50;

export function usdToCredits(usd: number): number {
  return Math.floor(usd / USD_PER_CREDIT + 1e-6);
}

export const planCatalogEntrySchema = z
  .object({
    planCode: planCodeSchema,
    displayName: z.string().min(1),
    monthlyPriceUsd: z.number().nonnegative(),
    products: z.array(productCodeSchema).min(1),
    includedCanvasCredits: z.number().int().nonnegative(),
  })
  .strict();
export type PlanCatalogEntry = z.infer<typeof planCatalogEntrySchema>;

export const creditPackOfferSchema = z
  .object({
    credits: z.number().int().positive(),
    priceUsd: z.number().positive(),
    maxPacks: z.number().int().positive(),
  })
  .strict();
export type CreditPackOffer = z.infer<typeof creditPackOfferSchema>;

export const CREDIT_PACK_OFFER: CreditPackOffer = {
  credits: CREDIT_PACK_CREDITS,
  priceUsd: CREDIT_PACK_PRICE_USD,
  maxPacks: MAX_CREDIT_PACKS,
};

/** `none` = never bought, `stripe` = self-serve, `contract` = billed off-Stripe (never metered or blocked). */
export const BILLING_MODELS = ['none', 'stripe', 'contract'] as const;
export const billingModelSchema = z.enum(BILLING_MODELS);
export type BillingModel = z.infer<typeof billingModelSchema>;

export const usageBucketSchema = z
  .object({
    bucket: z.enum(['agent', 'studio']),
    periodStart: z.string().datetime({ offset: true }),
    periodEnd: z.string().datetime({ offset: true }),
    includedUsd: z.number().nonnegative(),
    capUsd: z.number().nonnegative().nullable(),
    consumedUsd: z.number().nonnegative(),
    overageAction: z.enum(['bill', 'block']),
  })
  .strict();
export type UsageBucket = z.infer<typeof usageBucketSchema>;

/** Purchased packs + last period's rollover, in whole credits. */
export const creditBalanceSchema = z
  .object({
    totalCredits: z.number().int().nonnegative(),
    purchasedCredits: z.number().int().nonnegative(),
    rolloverCredits: z.number().int().nonnegative(),
  })
  .strict();
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

/** Exactly the output of `billing.get_brand_entitlements(p_brand_id)`. */
export const brandEntitlementsSchema = z
  .object({
    brandId: z.string().uuid(),
    /** `free` | `contract` | the plan that funds the studio bucket (`organic_studio` wins over `paid_media`). */
    planCode: z.string().min(1),
    status: z.enum(['inactive', 'trialing', 'active', 'past_due', 'canceled']),
    billingModel: billingModelSchema,
    /** Self-serve plans currently on the brand's Stripe subscription. Empty for Contract. */
    plans: z.array(planCodeSchema),
    products: z.array(productCodeSchema),
    addons: z.array(addonCodeSchema),
    trendsTier: z.enum(['base', 'pro']).nullable(),
    buckets: z.array(usageBucketSchema),
    creditBalance: creditBalanceSchema,
  })
  .strict();
export type BrandEntitlements = z.infer<typeof brandEntitlementsSchema>;

export const billingSubscriptionViewSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    plans: z.array(planCodeSchema),
    cancelAtPeriodEnd: z.boolean(),
    currentPeriodStart: z.string().datetime({ offset: true }).nullable(),
    currentPeriodEnd: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type BillingSubscriptionView = z.infer<typeof billingSubscriptionViewSchema>;

/** PCI: amounts and links only — never card brand, last4, expiry or PAN. */
export const billingInvoiceViewSchema = z
  .object({
    id: z.string().min(1),
    number: z.string().nullable(),
    status: z.string().nullable(),
    currency: z.string().min(1),
    amountDue: z.number().int(),
    amountPaid: z.number().int(),
    total: z.number().int(),
    createdAt: z.string().datetime({ offset: true }),
    hostedInvoiceUrl: z.string().nullable(),
    invoicePdf: z.string().nullable(),
  })
  .strict();
export type BillingInvoiceView = z.infer<typeof billingInvoiceViewSchema>;

/** The Canvas meter for the current period, in USD (1 credit = $0.01 → `usdToCredits`). */
export const billingCanvasUsageSchema = z
  .object({
    studioBucket: usageBucketSchema.nullable(),
    rolloverUsd: z.number().nonnegative(),
    purchasedBalanceUsd: z.number().nonnegative(),
    /** Accrued metered overage this period. 0 until wave 2 adds `usage_events.overage_usd`. */
    overageUsd: z.number().nonnegative(),
  })
  .strict();
export type BillingCanvasUsage = z.infer<typeof billingCanvasUsageSchema>;

/** `GET /billing-api/brands/:id/overview` (owner only). */
export const billingOverviewSchema = z
  .object({
    brandId: z.string().uuid(),
    entitlements: brandEntitlementsSchema,
    hasPaymentMethod: z.boolean(),
    subscription: billingSubscriptionViewSchema.nullable(),
    invoices: z.array(billingInvoiceViewSchema),
    canvas: billingCanvasUsageSchema,
    /** Plan cards come from `billing.plan_definitions`, never hardcoded. */
    catalog: z
      .object({
        plans: z.array(planCatalogEntrySchema),
        creditPack: creditPackOfferSchema,
      })
      .strict(),
    livemode: z.literal(false),
  })
  .strict();
export type BillingOverview = z.infer<typeof billingOverviewSchema>;

const returnUrlSchema = z.string().url();

/** `POST /billing-api/brands/:id/checkout` — first plan purchase (Stripe Checkout, subscription mode). */
export const billingCheckoutRequestSchema = z
  .object({
    plans: z
      .array(planCodeSchema)
      .min(1)
      .max(PLAN_CODES.length)
      .refine((plans) => new Set(plans).size === plans.length, 'plans must be unique'),
    successUrl: returnUrlSchema,
    cancelUrl: returnUrlSchema,
  })
  .strict();
export type BillingCheckoutRequest = z.infer<typeof billingCheckoutRequestSchema>;

export const billingCheckoutResponseSchema = z
  .object({
    brandId: z.string().uuid(),
    url: z.string().url(),
    sessionId: z.string().min(1),
    customerId: z.string().min(1),
    plans: z.array(planCodeSchema),
  })
  .strict();
export type BillingCheckoutResponse = z.infer<typeof billingCheckoutResponseSchema>;

/** `POST /billing-api/brands/:id/plans` — add/remove a plan on the existing subscription (card on file). */
export const billingPlanChangeRequestSchema = z
  .object({
    add: planCodeSchema.optional(),
    remove: planCodeSchema.optional(),
  })
  .strict()
  .refine((body) => Boolean(body.add) !== Boolean(body.remove), 'exactly one of add or remove');
export type BillingPlanChangeRequest = z.infer<typeof billingPlanChangeRequestSchema>;

export const billingPlanChangeResponseSchema = z
  .object({
    brandId: z.string().uuid(),
    subscriptionId: z.string().min(1),
    status: z.string().min(1),
    plans: z.array(planCodeSchema),
  })
  .strict();
export type BillingPlanChangeResponse = z.infer<typeof billingPlanChangeResponseSchema>;

/** `POST /billing-api/brands/:id/credits/checkout` — one-time Canvas credit packs ($10 / 1,000). */
export const billingCreditCheckoutRequestSchema = z
  .object({
    packs: z.number().int().min(1).max(MAX_CREDIT_PACKS),
    successUrl: returnUrlSchema,
    cancelUrl: returnUrlSchema,
  })
  .strict();
export type BillingCreditCheckoutRequest = z.infer<typeof billingCreditCheckoutRequestSchema>;

export const billingCreditCheckoutResponseSchema = z
  .object({
    brandId: z.string().uuid(),
    url: z.string().url(),
    sessionId: z.string().min(1),
    customerId: z.string().min(1),
    packs: z.number().int().positive(),
    credits: z.number().int().positive(),
  })
  .strict();
export type BillingCreditCheckoutResponse = z.infer<typeof billingCreditCheckoutResponseSchema>;

/** `POST /billing-api/brands/:id/portal` — Stripe Customer Portal (payment-method update). */
export const billingPortalRequestSchema = z.object({ returnUrl: returnUrlSchema }).strict();
export type BillingPortalRequest = z.infer<typeof billingPortalRequestSchema>;

export const billingPortalResponseSchema = z
  .object({
    brandId: z.string().uuid(),
    url: z.string().url(),
    customerId: z.string().min(1),
    portalSessionId: z.string().min(1),
  })
  .strict();
export type BillingPortalResponse = z.infer<typeof billingPortalResponseSchema>;

export const BILLING_API_ERROR_CODES = [
  'unauthorized',
  'billing_manager_required',
  'invalid_request',
  'route_not_found',
  'method_not_allowed',
  'contract_managed',
  'use_plan_change',
  'no_subscription',
  'plan_already_active',
  'plan_not_active',
  /** Removing the only plan — cancel from the Customer Portal instead. */
  'last_plan',
  'stripe_not_configured',
  'billing_api_failed',
] as const;
export const billingApiErrorSchema = z
  .object({
    error: z.enum(BILLING_API_ERROR_CODES),
    message: z.string().optional(),
  })
  .passthrough();
export type BillingApiError = z.infer<typeof billingApiErrorSchema>;

/** HTTP 402 body for a server-gated product or an exhausted Canvas balance. */
export const billingPaymentRequiredSchema = z
  .object({
    error: z.enum(['product_required', 'credits_exhausted']),
    product: productCodeSchema,
    planCode: planCodeSchema.nullable(),
  })
  .strict();
export type BillingPaymentRequired = z.infer<typeof billingPaymentRequiredSchema>;
