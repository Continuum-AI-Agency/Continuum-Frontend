// What a brand's tier lets it do.
//
// `brand_profiles.tier` is a plain integer, and until now every gate in the codebase was binary —
// `tier === 0` or `tier > 0` — with the threshold written inline at each call site and no
// server-side check anywhere. That was survivable while "paid or not" was the only question.
//
// It stops being survivable the moment a tier gates something that costs real money to run, so
// the threshold lives here, named after the capability rather than the number, and both the page
// and the API route import the same predicate. A rule spelled twice is a rule that will
// eventually be enforced in one place and not the other — and the place it gets missed is always
// the server.

/**
 * Ingesting your own After Effects project — upload, parse, forge run, variable editor.
 *
 * Tier 3 because a run provisions a real NocoBase collection, its columns, a workflow and its
 * node in a shared render workspace, and then holds a template there. That is not a page view.
 */
export const BRAND_TIER_TEMPLATE_FORGE = 3;

export function brandTierAllowsTemplateForge(tier: number | null | undefined): boolean {
  return typeof tier === 'number' && Number.isFinite(tier) && tier >= BRAND_TIER_TEMPLATE_FORGE;
}
