import { describe, expect, test } from 'bun:test';
import { type BrandEntitlements, brandEntitlementsSchema } from '@continuum/contracts';
import { toSidebarBilling } from './sidebarBilling';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

// Built through the contracts schema, so a fixture that drifts from the real
// get_brand_entitlements shape fails here instead of passing against one the RPC never returns.
function entitlements(patch: Partial<BrandEntitlements>): BrandEntitlements {
  return brandEntitlementsSchema.parse({
    brandId: BRAND_ID,
    planCode: 'free',
    status: 'inactive',
    billingModel: 'none',
    plans: [],
    products: [],
    addons: [],
    trendsTier: null,
    buckets: [],
    creditBalance: { totalCredits: 0, purchasedCredits: 0, rolloverCredits: 0 },
    ...patch,
  });
}

const studio = (
  includedUsd: number,
  consumedUsd: number,
  overage: { action: 'bill'; capUsd: number } | { action: 'block' } = { action: 'block' },
) => ({
  bucket: 'studio' as const,
  periodStart: '2026-09-21T00:00:00.000Z',
  periodEnd: '2026-10-21T00:00:00.000Z',
  includedUsd,
  capUsd: overage.action === 'bill' ? overage.capUsd : null,
  consumedUsd,
  overageAction: overage.action,
});

const organicPlus = (patch: Partial<BrandEntitlements> = {}) =>
  entitlements({
    planCode: 'organic_studio',
    status: 'active',
    billingModel: 'stripe',
    plans: ['organic_studio'],
    products: ['organic_agent', 'studio'],
    buckets: [studio(10, 0)],
    ...patch,
  });

const live = (read: BrandEntitlements | null) =>
  toSidebarBilling({ billingLive: true, entitlements: read });

describe('toSidebarBilling', () => {
  test('billing not live renders nothing, whatever the read says', () => {
    expect(toSidebarBilling({ billingLive: false, entitlements: null })).toBeNull();
    expect(toSidebarBilling({ billingLive: false, entitlements: organicPlus() })).toBeNull();
  });

  test('a live but failed read renders nothing rather than claiming "No plan"', () => {
    expect(live(null)).toBeNull();
  });

  test('a fresh Organic Plus period: 1,000 credits, deep link to the credit-pack section', () => {
    expect(live(organicPlus())).toEqual({
      kind: 'metered',
      href: '/settings?section=billing#credits',
      planLabel: 'Organic Plus',
      remainingCredits: 1000,
      includedRemainingCredits: 1000,
      includedCredits: 1000,
      rolloverCredits: 0,
      purchasedCredits: 0,
      periodEnd: '2026-10-21T00:00:00.000Z',
      autoBilling: { on: false },
      low: false,
      exhausted: false,
    });
  });

  test('remaining = included left + rollover + purchased packs', () => {
    const view = live(
      organicPlus({
        buckets: [studio(10, 7.6)],
        creditBalance: { totalCredits: 1200, purchasedCredits: 1000, rolloverCredits: 200 },
      }),
    );
    expect(view).toMatchObject({
      kind: 'metered',
      includedRemainingCredits: 240,
      rolloverCredits: 200,
      purchasedCredits: 1000,
      remainingCredits: 1440,
    });
  });

  test('both plans read as one label in catalog order', () => {
    const view = live(
      organicPlus({
        plans: ['paid_media', 'organic_studio'],
        products: ['organic_agent', 'paid_media', 'studio'],
      }),
    );
    expect(view).toMatchObject({ kind: 'metered', planLabel: 'Organic Plus + Performance Plus' });
  });

  test('Performance Plus alone has no included credits and draws on packs', () => {
    const view = live(
      entitlements({
        planCode: 'paid_media',
        status: 'active',
        billingModel: 'stripe',
        plans: ['paid_media'],
        products: ['paid_media'],
        creditBalance: { totalCredits: 2000, purchasedCredits: 2000, rolloverCredits: 0 },
      }),
    );
    expect(view).toMatchObject({
      kind: 'metered',
      planLabel: 'Performance Plus',
      includedCredits: 0,
      remainingCredits: 2000,
      periodEnd: null,
      low: false,
    });
  });

  test('auto-billing reads the studio bucket: bill ⇒ on with its cap, block ⇒ off', () => {
    const on = live(organicPlus({ buckets: [studio(10, 0, { action: 'bill', capUsd: 100 })] }));
    expect(on).toMatchObject({ autoBilling: { on: true, capUsd: 100 } });
    expect(live(organicPlus())).toMatchObject({ autoBilling: { on: false } });
  });

  test('low: under 10% of the period allowance, or under 100 credits', () => {
    expect(live(organicPlus({ buckets: [studio(10, 9.01)] }))).toMatchObject({
      remainingCredits: 99,
      low: true,
    });
    expect(live(organicPlus({ buckets: [studio(10, 9)] }))).toMatchObject({
      remainingCredits: 100,
      low: false,
    });
    // A bigger allowance warns at its own 10%, above the 100-credit floor.
    expect(live(organicPlus({ buckets: [studio(50, 46)] }))).toMatchObject({
      remainingCredits: 400,
      low: true,
    });
  });

  test('exhausted only when nothing is left AND auto-billing is off', () => {
    expect(live(organicPlus({ buckets: [studio(10, 10)] }))).toMatchObject({
      remainingCredits: 0,
      low: true,
      exhausted: true,
    });
    expect(
      live(organicPlus({ buckets: [studio(10, 12, { action: 'bill', capUsd: 100 })] })),
    ).toMatchObject({ remainingCredits: 0, exhausted: false });
  });

  test('a Contract brand is managed and unmetered, linking to Billing', () => {
    expect(
      live(
        entitlements({
          planCode: 'contract',
          status: 'active',
          billingModel: 'contract',
          products: ['organic_agent', 'paid_media', 'studio'],
        }),
      ),
    ).toEqual({ kind: 'managed', href: '/settings?section=billing' });
  });

  test('an internal brand reads as Contract (even on the grandfathered plan) and is managed', () => {
    expect(
      live(
        entitlements({
          planCode: 'grandfathered',
          billingModel: 'contract',
          products: ['mcp', 'organic_agent', 'paid_media', 'studio', 'trends'],
          creditBalance: { totalCredits: 2000, purchasedCredits: 2000, rolloverCredits: 0 },
        }),
      ),
    ).toEqual({ kind: 'managed', href: '/settings?section=billing' });
  });

  test('a grandfathered brand (products, no plan) is metered: its purchased + rollover credits', () => {
    expect(
      live(
        entitlements({
          planCode: 'grandfathered',
          products: ['organic_agent', 'paid_media', 'studio'],
          creditBalance: { totalCredits: 22_000, purchasedCredits: 21_950, rolloverCredits: 50 },
        }),
      ),
    ).toEqual({
      kind: 'metered',
      href: '/settings?section=billing#credits',
      planLabel: 'Canvas credits',
      remainingCredits: 22_000,
      includedRemainingCredits: 0,
      includedCredits: 0,
      rolloverCredits: 50,
      purchasedCredits: 21_950,
      periodEnd: null,
      autoBilling: { on: false },
      low: false,
      exhausted: false,
    });
  });

  test('a grandfathered brand at 0 credits is exhausted (no auto-billing without a plan)', () => {
    expect(
      live(entitlements({ planCode: 'grandfathered', products: ['studio'] })),
    ).toMatchObject({ kind: 'metered', remainingCredits: 0, low: true, exhausted: true });
  });

  test('an admin grant that outlived a cancelled subscription is metered, not managed', () => {
    expect(
      live(entitlements({ billingModel: 'stripe', status: 'canceled', products: ['trends'] })),
    ).toMatchObject({ kind: 'metered', planLabel: 'Canvas credits' });
  });

  test('no products and no plan reads "No plan" and links to Billing', () => {
    expect(live(entitlements({}))).toEqual({ kind: 'no_plan', href: '/settings?section=billing' });
  });
});
