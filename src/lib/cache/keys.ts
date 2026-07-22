// App-cache Redis key builders. Shared by the read path (cachedRead) and the
// invalidation path (server actions) so the two can never drift. This is the
// Redis layer that sits alongside — not instead of — the Next.js cache tags in
// tags.ts: tags gate Next's own data cache; these keys gate the cross-request
// Upstash app cache.

const NAMESPACE = 'fe';

export const appCacheKeys = {
  // Per-(brand, user). The cached value is exactly what THAT user's RLS-scoped
  // read returns and is served only back to the same user — so a member without
  // access can never receive another member's data (leak-proof by construction).
  // Brand-first ordering lets a brand mutation prefix-invalidate every member's
  // cached view in one scan.
  brandIntegrations: (brandProfileId: string, userId: string) =>
    `${NAMESPACE}:brand-integrations:${brandProfileId}:${userId}`,
  brandIntegrationsPrefix: (brandProfileId: string) =>
    `${NAMESPACE}:brand-integrations:${brandProfileId}:`,
} as const;
