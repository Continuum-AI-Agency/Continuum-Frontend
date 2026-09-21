import type { ProductCode } from '@continuum/contracts';

export type BrandAccess = {
  /** False while PostgREST does not expose `billing` (PGRST106). */
  billingLive: boolean;
  /** The brand's active products. Empty when billing is not live or the read failed. */
  products: ProductCode[];
  // billing-cutover: today's access rule (`brand_profiles.tier`), consulted only while billing is
  // not live. Wave 4 deletes this field and the tier read in brandAccess.server.ts.
  legacyTier: number;
};

// Which product each gated page needs, and what a brand without it sees. Pure, so every branch
// — live or not — is decided (and unit-tested) here. The Frontend gate is a courtesy: the
// Backend refuses the same brands with 402 `product_required`.

export type GatedSurface = 'ai-studio' | 'organic' | 'scale' | 'approvals' | 'forge';

type SurfaceRule = {
  product: ProductCode;
  // billing-cutover: today's tier rule for this page, used only while billing is not live.
  // `null` = the page had no gate before billing.
  legacy: { minTier: number; description: string } | null;
};

const SURFACES: Record<GatedSurface, SurfaceRule> = {
  'ai-studio': {
    product: 'studio',
    legacy: {
      minTier: 1,
      description: 'AI Studio is a paid feature. Please contact an Administrator.',
    },
  },
  organic: { product: 'organic_agent', legacy: null },
  scale: {
    product: 'paid_media',
    legacy: {
      minTier: 1,
      description: 'Paid Media is a paid feature. Please contact an Administrator.',
    },
  },
  approvals: {
    product: 'paid_media',
    legacy: {
      minTier: 1,
      description: 'Approvals is a paid feature. Please contact an Administrator.',
    },
  },
  forge: {
    product: 'paid_media',
    legacy: {
      minTier: 3,
      description: 'Forge is available on Tier 3. Please contact an Administrator.',
    },
  },
};

/** The self-serve plan that sells each product (the Backend's 402 names the same one). */
export const PLAN_NAME_FOR_PRODUCT: Partial<Record<ProductCode, string>> = {
  studio: 'Organic Plus',
  organic_agent: 'Organic Plus',
  paid_media: 'Performance Plus',
};

/** Settings → Billing, with the plan that grants `product` highlighted. */
export function billingHref(product?: ProductCode): string {
  return product ? `/settings?section=billing&need=${product}` : '/settings?section=billing';
}

export type ProductGateDecision =
  | { kind: 'allow' }
  | { kind: 'billing'; href: string }
  // billing-cutover: the tier-era toast + redirect to the dashboard.
  | { kind: 'legacy'; description: string };

export function decideProductGate(
  surface: GatedSurface,
  access: Pick<BrandAccess, 'billingLive' | 'products' | 'legacyTier'>,
): ProductGateDecision {
  const { product, legacy } = SURFACES[surface];
  if (access.billingLive) {
    return access.products.includes(product)
      ? { kind: 'allow' }
      : { kind: 'billing', href: billingHref(product) };
  }
  // billing-cutover: not live ⇒ exactly the tier gate each page had before billing.
  if (legacy && access.legacyTier < legacy.minTier) {
    return { kind: 'legacy', description: legacy.description };
  }
  return { kind: 'allow' };
}

const SIDEBAR_PRODUCTS: readonly ProductCode[] = ['studio', 'organic_agent', 'paid_media'];

/** Products whose sidebar entries carry a lock. None until billing is live. */
export function lockedProducts(
  access: Pick<BrandAccess, 'billingLive' | 'products'>,
): ProductCode[] {
  if (!access.billingLive) return [];
  return SIDEBAR_PRODUCTS.filter((product) => !access.products.includes(product));
}

/**
 * Onboarding may not complete for a brand with no product once billing is live — a paid plan or
 * a Contract grant. Before go-live it completes exactly as it always did.
 */
export function onboardingNeedsPlan(
  access: Pick<BrandAccess, 'billingLive' | 'products'>,
): boolean {
  return access.billingLive && access.products.length === 0;
}

/** "Paid" for the library's storage tier: any active product once live, else tier > 0. */
export function isPaidBrand(access: BrandAccess): boolean {
  // billing-cutover: the tier answers only while billing is not live.
  return access.billingLive ? access.products.length > 0 : access.legacyTier > 0;
}
