// Tier helper for the Frontend. Source of truth: brand_profiles.tier > 0 means paid.
// The edge-function version is Deno-only; this one is for Next.js RSC / route handlers.

export function isPaidTier(tier: number): boolean {
  return tier > 0;
}
