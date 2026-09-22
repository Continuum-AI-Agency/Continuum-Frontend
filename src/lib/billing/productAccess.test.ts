import { describe, expect, test } from 'bun:test';
import { type BrandEntitlements, brandEntitlementsSchema, type ProductCode } from '@continuum/contracts';
import {
  type BrandAccess,
  decideProductGate,
  type GatedSurface,
  isPaidBrand,
  lockedProducts,
  onboardingNeedsPlan,
} from './productAccess';

const live = (products: ProductCode[]): BrandAccess => ({
  billingLive: true,
  products,
  entitlements: null,
  legacyTier: 0,
});
const notLive = (legacyTier: number): BrandAccess => ({
  billingLive: false,
  products: [],
  entitlements: null,
  legacyTier,
});

const ALL_PRODUCTS: ProductCode[] = ['mcp', 'organic_agent', 'paid_media', 'studio', 'trends'];

/** A live read through the contracts schema, so the fixture cannot drift from the RPC's shape. */
const liveWith = (
  legacyTier: number,
  patch: Pick<BrandEntitlements, 'planCode' | 'billingModel' | 'products'>,
): BrandAccess => ({
  billingLive: true,
  products: patch.products,
  legacyTier,
  entitlements: brandEntitlementsSchema.parse({
    brandId: '00000000-0000-4000-8000-0000000000b2',
    status: 'active',
    plans: [],
    addons: [],
    trendsTier: null,
    buckets: [],
    creditBalance: { totalCredits: 0, purchasedCredits: 0, rolloverCredits: 0 },
    ...patch,
  }),
});
const grandfathered = (legacyTier: number) =>
  liveWith(legacyTier, {
    planCode: 'grandfathered',
    billingModel: 'none',
    products: ['organic_agent', 'paid_media', 'studio', 'trends', 'mcp'],
  });
const FORGE_TOAST = {
  kind: 'legacy',
  description: 'Forge is available on Tier 3. Please contact an Administrator.',
};

const SURFACES: GatedSurface[] = ['ai-studio', 'organic', 'scale', 'approvals', 'forge'];
const decide = (access: BrandAccess) =>
  Object.fromEntries(SURFACES.map((surface) => [surface, decideProductGate(surface, access)]));

describe('decideProductGate — billing live (the product matrix)', () => {
  test('an Organic Plus brand opens Canvas and Organic, and is sent to Billing for paid media', () => {
    expect(decide(live(['organic_agent', 'studio']))).toEqual({
      'ai-studio': { kind: 'allow' },
      organic: { kind: 'allow' },
      scale: { kind: 'billing', href: '/settings?section=billing&need=paid_media' },
      approvals: { kind: 'billing', href: '/settings?section=billing&need=paid_media' },
      forge: { kind: 'billing', href: '/settings?section=billing&need=paid_media' },
    });
  });

  test('a Performance Plus brand opens paid media only', () => {
    expect(decide(live(['paid_media']))).toEqual({
      'ai-studio': { kind: 'billing', href: '/settings?section=billing&need=studio' },
      organic: { kind: 'billing', href: '/settings?section=billing&need=organic_agent' },
      scale: { kind: 'allow' },
      approvals: { kind: 'allow' },
      forge: { kind: 'allow' },
    });
  });

  test('a brand with no product is sent to Billing everywhere — a high tier grants nothing', () => {
    const decisions = decide({ ...live([]), legacyTier: 3 });
    expect(Object.values(decisions).every((decision) => decision.kind === 'billing')).toBe(true);
  });
});

describe('decideProductGate — billing live, grandfathered brands keep Forge at tier 3', () => {
  test('a grandfathered tier-2 brand opens every surface but Forge, which gets the tier toast', () => {
    expect(decide(grandfathered(2))).toEqual({
      'ai-studio': { kind: 'allow' },
      organic: { kind: 'allow' },
      scale: { kind: 'allow' },
      approvals: { kind: 'allow' },
      forge: FORGE_TOAST,
    });
  });

  test('a grandfathered tier-3 brand opens everything', () => {
    expect(Object.values(decide(grandfathered(3))).every((d) => d.kind === 'allow')).toBe(true);
  });

  test('only Forge keeps its tier: a grandfathered tier-0 brand still opens Canvas and paid media', () => {
    expect(decide(grandfathered(0))).toMatchObject({
      'ai-studio': { kind: 'allow' },
      scale: { kind: 'allow' },
      approvals: { kind: 'allow' },
      forge: FORGE_TOAST,
    });
  });

  test('without the product a grandfathered brand is sent to Billing, not the tier toast', () => {
    const access = liveWith(3, {
      planCode: 'grandfathered',
      billingModel: 'none',
      products: ['studio'],
    });
    expect(decideProductGate('forge', access)).toEqual({
      kind: 'billing',
      href: '/settings?section=billing&need=paid_media',
    });
  });

  test('internal (reads as Contract) and Stripe brands open Forge at tier 0', () => {
    const internal = liveWith(0, {
      planCode: 'grandfathered',
      billingModel: 'contract',
      products: ALL_PRODUCTS,
    });
    const stripe = liveWith(0, {
      planCode: 'paid_media',
      billingModel: 'stripe',
      products: ['paid_media'],
    });
    expect(decideProductGate('forge', internal)).toEqual({ kind: 'allow' });
    expect(decideProductGate('forge', stripe)).toEqual({ kind: 'allow' });
  });

  test('a live read that failed (entitlements null) falls back to products alone', () => {
    expect(decideProductGate('forge', { ...live(['paid_media']), legacyTier: 0 })).toEqual({
      kind: 'allow',
    });
  });
});

describe('decideProductGate — billing NOT live (PGRST106): exactly the tier gates of today', () => {
  test('tier 0 is bounced from AI Studio, Scale, Approvals and Forge; Organic had no gate', () => {
    expect(decide(notLive(0))).toEqual({
      'ai-studio': {
        kind: 'legacy',
        description: 'AI Studio is a paid feature. Please contact an Administrator.',
      },
      organic: { kind: 'allow' },
      scale: {
        kind: 'legacy',
        description: 'Paid Media is a paid feature. Please contact an Administrator.',
      },
      approvals: {
        kind: 'legacy',
        description: 'Approvals is a paid feature. Please contact an Administrator.',
      },
      forge: {
        kind: 'legacy',
        description: 'Forge is available on Tier 3. Please contact an Administrator.',
      },
    });
  });

  test('tiers 1 and 2 open everything except Forge; tier 3 opens everything', () => {
    for (const tier of [1, 2]) {
      const decisions = decide(notLive(tier));
      expect(decisions.forge?.kind).toBe('legacy');
      expect(
        (['ai-studio', 'organic', 'scale', 'approvals'] as const).map((s) => decisions[s]?.kind),
      ).toEqual(['allow', 'allow', 'allow', 'allow']);
    }
    expect(Object.values(decide(notLive(3))).every((d) => d.kind === 'allow')).toBe(true);
  });

  test('not live never redirects to Billing', () => {
    for (const tier of [0, 1, 2, 3]) {
      expect(Object.values(decide(notLive(tier))).some((d) => d.kind === 'billing')).toBe(false);
    }
  });
});

describe('lockedProducts (sidebar)', () => {
  test('live: locks exactly the sold products the brand lacks', () => {
    expect(lockedProducts(live(['organic_agent', 'studio']))).toEqual(['paid_media']);
    expect(lockedProducts(live([]))).toEqual(['studio', 'organic_agent', 'paid_media']);
    expect(lockedProducts(live(['studio', 'organic_agent', 'paid_media', 'trends']))).toEqual([]);
  });

  test('not live: no locks at all, whatever the tier', () => {
    expect(lockedProducts(notLive(0))).toEqual([]);
  });
});

describe('onboardingNeedsPlan', () => {
  test('live with no product cannot complete; any product (paid or Contract) can', () => {
    expect(onboardingNeedsPlan(live([]))).toBe(true);
    expect(onboardingNeedsPlan(live(['paid_media']))).toBe(false);
  });

  test('not live completes exactly as today', () => {
    expect(onboardingNeedsPlan(notLive(0))).toBe(false);
  });
});

describe('isPaidBrand (library)', () => {
  test('live: any active product; not live: tier > 0', () => {
    expect(isPaidBrand(live([]))).toBe(false);
    expect(isPaidBrand(live(['trends']))).toBe(true);
    expect(isPaidBrand(notLive(0))).toBe(false);
    expect(isPaidBrand(notLive(2))).toBe(true);
  });
});
