import { describe, expect, it } from 'bun:test';

import {
  billingCheckoutRequestSchema,
  billingOverviewSchema,
  billingPaymentRequiredSchema,
  billingPlanChangeRequestSchema,
  brandEntitlementsSchema,
  usdToCredits,
} from './index';

const brandId = '00000000-0000-4000-8000-0000000000b2';

// Verbatim `billing.get_brand_entitlements` output from the local stack (timestamps as
// Postgres renders them in jsonb).
const entitlements = {
  brandId,
  planCode: 'organic_studio',
  status: 'active',
  billingModel: 'stripe',
  plans: ['organic_studio'],
  products: ['organic_agent', 'studio'],
  addons: [],
  trendsTier: null,
  buckets: [
    {
      bucket: 'studio',
      periodStart: '2026-09-21T19:40:02+00:00',
      periodEnd: '2026-10-21T19:40:02+00:00',
      includedUsd: 10.0,
      capUsd: 100.0,
      consumedUsd: 0,
      overageAction: 'bill',
    },
  ],
  creditBalance: { totalCredits: 1000, purchasedCredits: 1000, rolloverCredits: 0 },
};

describe('billing contracts', () => {
  it('parses the get_brand_entitlements output', () => {
    expect(brandEntitlementsSchema.parse(entitlements).billingModel).toBe('stripe');
  });

  it('parses a full overview and refuses livemode', () => {
    const overview = {
      brandId,
      entitlements,
      hasPaymentMethod: true,
      subscription: {
        id: 'sub_1',
        status: 'active',
        plans: ['organic_studio'],
        cancelAtPeriodEnd: false,
        currentPeriodStart: '2026-09-21T19:40:02.000Z',
        currentPeriodEnd: '2026-10-21T19:40:02.000Z',
      },
      invoices: [],
      canvas: { studioBucket: entitlements.buckets[0], rolloverUsd: 0, purchasedBalanceUsd: 10, overageUsd: 0 },
      catalog: {
        plans: [
          {
            planCode: 'organic_studio',
            displayName: 'Organic Plus',
            monthlyPriceUsd: 30,
            products: ['studio', 'organic_agent'],
            includedCanvasCredits: 1000,
          },
        ],
        creditPack: { credits: 1000, priceUsd: 10, maxPacks: 50 },
      },
      livemode: false,
    };
    expect(billingOverviewSchema.parse(overview).subscription?.plans).toEqual(['organic_studio']);
    expect(billingOverviewSchema.safeParse({ ...overview, livemode: true }).success).toBe(false);
  });

  it('accepts only unique self-serve plans at checkout', () => {
    const urls = { successUrl: 'http://localhost:3000/ok', cancelUrl: 'http://localhost:3000/no' };
    expect(billingCheckoutRequestSchema.safeParse({ plans: ['organic_studio'], ...urls }).success).toBe(true);
    expect(billingCheckoutRequestSchema.safeParse({ plans: ['trends'], ...urls }).success).toBe(false);
    expect(
      billingCheckoutRequestSchema.safeParse({ plans: ['paid_media', 'paid_media'], ...urls }).success,
    ).toBe(false);
  });

  it('takes exactly one of add or remove on plan change', () => {
    expect(billingPlanChangeRequestSchema.safeParse({ add: 'paid_media' }).success).toBe(true);
    expect(billingPlanChangeRequestSchema.safeParse({}).success).toBe(false);
    expect(
      billingPlanChangeRequestSchema.safeParse({ add: 'paid_media', remove: 'organic_studio' }).success,
    ).toBe(false);
  });

  it('parses the 402 body', () => {
    expect(
      billingPaymentRequiredSchema.parse({ error: 'credits_exhausted', product: 'studio', planCode: null }).error,
    ).toBe('credits_exhausted');
  });

  it('converts USD to whole credits without float drift', () => {
    expect(usdToCredits(10)).toBe(1000);
    expect(usdToCredits(0.29)).toBe(29);
    expect(usdToCredits(0.005)).toBe(0);
  });
});
