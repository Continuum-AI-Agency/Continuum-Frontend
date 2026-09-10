// Tier helpers for the Frontend. Source of truth: brand_profiles.tier.
// The edge-function version is Deno-only; this one is for Next.js RSC / route handlers.

import { brandTierAllowsTemplateForge } from '@continuum/contracts';

export function isPaidTier(tier: number): boolean {
  return tier > 0;
}

/**
 * May this brand ingest its own After Effects projects?
 *
 * Re-exported from `@continuum/contracts` rather than restated, because the API route that
 * actually enforces it imports the same predicate. Every other tier gate in this app is written
 * inline at its call site, which was survivable while "paid or not" was the only question — it
 * stops being survivable when the two sides of one rule can disagree, and the side that gets
 * missed is always the server.
 */
export const isTemplateForgeTier = brandTierAllowsTemplateForge;
