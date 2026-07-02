// Canonical cache-tag taxonomy for Next.js Cache Components.
//
// Read side (Server Components / 'use cache' functions): call cacheTag(...)
//   inside the cached function to register the tag against the cached result.
// Write side (Server Actions / Route Handlers): call revalidateTag(...) for
//   background stale-while-revalidate, or updateTag(...) when the same
//   request must observe the fresh data after the mutation.
//
// All tags are brand-scoped where applicable so invalidation only nukes
// the brand whose data actually changed.

export const tags = {
  integrations: {
    forBrand: (brandProfileId: string) => `integrations:brand:${brandProfileId}`,
    forUser: (userId: string) => `integrations:user:${userId}`,
  },
  brandProfile: (brandProfileId: string) => `brand-profile:${brandProfileId}`,
  brandInsights: (brandProfileId: string) => `brand-insights:${brandProfileId}`,
  brandGuidelines: (brandProfileId: string) => `brand-guidelines:${brandProfileId}`,
  campaigns: {
    forBrand: (brandProfileId: string) => `campaigns:brand:${brandProfileId}`,
    forCampaign: (campaignId: string) => `campaigns:campaign:${campaignId}`,
  },
  organicCalendar: (brandProfileId: string) => `organic-calendar:${brandProfileId}`,
} as const;
