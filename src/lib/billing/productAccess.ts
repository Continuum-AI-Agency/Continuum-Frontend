import {
  type BrandEntitlements,
  keepsTierGate,
  type PlanCode,
  type ProductCode,
} from '@continuum/contracts';

export type BrandAccess = {
  /** False while PostgREST does not expose `billing` (PGRST106). */
  billingLive: boolean;
  /** The brand's active products. Empty when billing is not live or the read failed. */
  products: ProductCode[];
  /** The full `get_brand_entitlements` read. Null when billing is not live or the read failed. */
  entitlements: BrandEntitlements | null;
  // grandfathered: the tier-era access rule (`brand_profiles.tier`). Consulted while billing is not
  // live, and after go-live for a grandfathered brand's Forge. Kept at the cutover.
  legacyTier: number;
};

// Which product each gated page needs, and what a brand without it sees. Pure, so every branch
// — live or not — is decided (and unit-tested) here. The Frontend gate is a courtesy: the
// Backend refuses the same brands with 402 `product_required`.

export type GatedSurface = 'ai-studio' | 'organic' | 'scale' | 'approvals' | 'forge';

type SurfaceRule = {
  product: ProductCode;
  // Today's tier rule for this page; `null` = the page had no gate before billing. billing-cutover:
  // used only while billing is not live — except Forge's, which grandfathered brands keep (below).
  legacy: { minTier: number; description: string } | null;
  /** grandfathered: the tier rule outlives go-live for a grandfathered brand (Forge, tier 3). */
  keepsTierForGrandfathered?: true;
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
    keepsTierForGrandfathered: true,
  },
};

/** The self-serve plan that sells each product (the Backend's 402 names the same one). */
export const PLAN_NAME_FOR_PRODUCT: Partial<Record<ProductCode, string>> = {
  studio: 'Organic Plus',
  organic_agent: 'Organic Plus',
  paid_media: 'Performance Plus',
};

/** The self-serve plans' display names (`billing.plan_definitions.display_name`). */
export const PLAN_NAME: Record<PlanCode, string> = {
  organic_studio: 'Organic Plus',
  paid_media: 'Performance Plus',
};

/** Settings → Billing, with the plan that grants `product` highlighted. */
export function billingHref(product?: ProductCode): string {
  return product ? `/settings?section=billing&need=${product}` : '/settings?section=billing';
}

/** The id of Settings → Billing's credit-pack section, which scrolls into view on that anchor. */
export const CREDITS_ANCHOR = 'credits';

/** Settings → Billing at the credit-pack section. */
export const CREDITS_HREF = `/settings?section=billing#${CREDITS_ANCHOR}`;

export type ProductGateDecision =
  | { kind: 'allow' }
  | { kind: 'billing'; href: string }
  // The tier-era toast + redirect to the dashboard: not live, or a grandfathered brand's Forge.
  | { kind: 'legacy'; description: string };

export function decideProductGate(
  surface: GatedSurface,
  access: Pick<BrandAccess, 'billingLive' | 'products' | 'legacyTier' | 'entitlements'>,
): ProductGateDecision {
  const { product, legacy, keepsTierForGrandfathered } = SURFACES[surface];
  if (access.billingLive) {
    if (!access.products.includes(product)) return { kind: 'billing', href: billingHref(product) };
    const tierStillGates =
      keepsTierForGrandfathered && access.entitlements && keepsTierGate(access.entitlements);
    if (!tierStillGates) return { kind: 'allow' };
  }
  // Not live ⇒ exactly the tier gate each page had before billing; live ⇒ a grandfathered Forge.
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
