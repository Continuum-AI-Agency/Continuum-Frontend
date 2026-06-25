// Canonical billing/entitlements contract — the single source of truth for what a
// brand is entitled to (products + add-ons + usage buckets) shared across the
// Frontend (gating, settings), the Backend (MCP gate, usage enforcement), and the
// Supabase edge functions (analyze_media, cron warmer, stripe webhook).
//
// Entitlements are DATA, not env flags: the shape mirrors the
// billing.get_brand_entitlements RPC output. The products[] / addons[] arrays are
// authoritative — the RPC only returns active rows, so membership IS entitlement
// regardless of subscription status (this is what makes admin overrides and
// grandfathered brands work). `status` is advisory (past_due banners etc.), never a
// hard gate on its own.

import { z } from "zod";

export const PRODUCTS = [
  "studio",
  "organic_agent",
  "paid_media",
  "trends",
  "mcp",
  "paid_optimizer",
] as const;
export const productSchema = z.enum(PRODUCTS);
export type Product = z.infer<typeof productSchema>;

export const ADD_ONS = [
  "provider_exa",
  "provider_serpapi",
  "provider_apify",
  "provider_x",
  "provider_firecrawl",
] as const;
export const addOnSchema = z.enum(ADD_ONS);
export type AddOn = z.infer<typeof addOnSchema>;

// Trends is a tiered product: `base` (native Google grounding only) vs `pro`
// (flips every 3rd-party provider add-on on). The tier lives on the brand_products
// row for the `trends` product.
export const productTierSchema = z.enum(["base", "pro"]);
export type ProductTier = z.infer<typeof productTierSchema>;

export const subscriptionStatusSchema = z.enum([
  "inactive",
  "trialing",
  "active",
  "past_due",
  "canceled",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const usageBucketKindSchema = z.enum(["agent", "studio"]);
export type UsageBucketKind = z.infer<typeof usageBucketKindSchema>;

export const usageBucketSchema = z.object({
  bucket: usageBucketKindSchema,
  includedUsd: z.number(),
  capUsd: z.number().nullable(),
  consumedUsd: z.number(),
  overageAction: z.enum(["bill", "block"]),
});
export type UsageBucket = z.infer<typeof usageBucketSchema>;

export const entitlementsSchema = z.object({
  brandId: z.string().uuid(),
  planCode: z.string(),
  status: subscriptionStatusSchema,
  products: z.array(productSchema),
  addons: z.array(addOnSchema),
  trendsTier: productTierSchema.nullable().default(null),
  buckets: z.array(usageBucketSchema).default([]),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

// A safe empty entitlement for free / unprovisioned brands.
export function emptyEntitlements(brandId: string): Entitlements {
  return {
    brandId,
    planCode: "free",
    status: "inactive",
    products: [],
    addons: [],
    trendsTier: null,
    buckets: [],
  };
}

// Membership IS entitlement — see file header. Status is intentionally NOT gated here.
export function hasProduct(entitlements: Entitlements, product: Product): boolean {
  return entitlements.products.includes(product);
}

export function hasAddOn(entitlements: Entitlements, addon: AddOn): boolean {
  return entitlements.addons.includes(addon);
}

// Intelligence-provider names (App/trends/intelligence) → their gating add-on.
const PROVIDER_ADD_ON: Record<string, AddOn> = {
  exa: "provider_exa",
  serpapi: "provider_serpapi",
  apify: "provider_apify",
  x: "provider_x",
  firecrawl: "provider_firecrawl",
};

export function providerAddOn(providerName: string): AddOn | null {
  return PROVIDER_ADD_ON[providerName] ?? null;
}

// A Trends-Pro brand has every provider add-on regardless of individual rows.
export function hasProviderAccess(entitlements: Entitlements, providerName: string): boolean {
  if (!hasProduct(entitlements, "trends")) return false;
  if (entitlements.trendsTier === "pro") return true;
  const addon = providerAddOn(providerName);
  return addon ? hasAddOn(entitlements, addon) : false;
}

export function findUsageBucket(
  entitlements: Entitlements,
  bucket: UsageBucketKind
): UsageBucket | null {
  return entitlements.buckets.find((b) => b.bucket === bucket) ?? null;
}
