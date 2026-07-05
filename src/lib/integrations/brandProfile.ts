// INVARIANT: this module returns only accounts tied to the brand via
// `brand_profile_integration_accounts` (BPIA) and joined to an active
// `brand_integration_grants` row. It MUST NOT surface a user's full set of
// connected assets. Personal-asset reads live in `userIntegrations.ts`.
import "server-only";

import { cache } from "react";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClaimsIdentity } from "@/lib/auth/claims";
import { cachedRead } from "@/lib/cache/redis.server";
import { appCacheKeys } from "@/lib/cache/keys";

export type BrandIntegrationAccountSummary = {
  assignmentId: string;
  integrationAccountId: string;
  name: string;
  alias: string | null;
  externalAccountId: string | null;
  status: string | null;
  linkedAt: string | null;
  providerIntegrationId: string;
  type: string | null;
  settings: Record<string, unknown> | null;
  ownerUserId: string | null;
};

export type BrandIntegrationSummary = Record<
  PlatformKey,
  {
    accounts: BrandIntegrationAccountSummary[];
  }
>;

function createEmptySummary(): BrandIntegrationSummary {
  return PLATFORM_KEYS.reduce((acc, key) => {
    acc[key] = { accounts: [] };
    return acc;
  }, {} as BrandIntegrationSummary);
}

async function loadBrandIntegrationSummaryFromDb(
  brandProfileId: string,
): Promise<BrandIntegrationSummary> {
  const supabase = await createSupabaseServerClient();

  const { data: rows, error: rpcError } = await supabase
    .schema("brand_profiles")
    .rpc("get_brand_integration_summary", {
      p_brand_profile_id: brandProfileId,
    });

  // Throw on a real RPC error so the cache wrapper never persists a degraded
  // (empty) result for the full TTL. A no-error/empty result is a valid empty
  // summary and is safe to cache.
  if (rpcError) {
    throw new Error(`get_brand_integration_summary failed: ${rpcError.message}`);
  }

  const summary = createEmptySummary();
  for (const row of (rows ?? []) as Record<string, unknown>[]) {
    const platformKey = row.platform_key as PlatformKey | null;
    if (!platformKey || !PLATFORM_KEYS.includes(platformKey)) continue;

    summary[platformKey].accounts.push({
      assignmentId: row.assignment_id as string,
      integrationAccountId: row.integration_account_id as string,
      alias: (row.alias as string | null) ?? null,
      name: (row.account_name as string) ?? "Account",
      externalAccountId: (row.external_account_id as string | null) ?? null,
      status: (row.account_status as string | null) ?? null,
      linkedAt: (row.linked_at as string | null) ?? null,
      providerIntegrationId: row.provider_integration_id as string,
      type: (row.account_type as string | null) ?? null,
      settings: (row.settings as Record<string, unknown> | null) ?? null,
      ownerUserId: (row.owner_user_id as string | null) ?? null,
    });
  }
  return summary;
}

// Two-tier cache: React cache() dedups within one request; cachedRead adds a
// cross-request Upstash tier keyed per (brand, user) so repeated navigations
// across dashboard/organic/settings reuse one RPC instead of re-querying. The
// per-user key means a member only ever gets their own RLS-scoped view — the
// route handler authenticates the user but does NOT re-check brand access, so a
// brand-keyed cache would leak. Invalidated by the integration server actions
// (revalidateBrandIntegrationConsumers → invalidateBrandIntegrationsCache), with
// the 1h TTL as the backstop.
export const fetchBrandIntegrationSummary = cache(
  async (brandProfileId: string): Promise<BrandIntegrationSummary> => {
    const identity = await getClaimsIdentity();
    try {
      if (!identity) {
        return await loadBrandIntegrationSummaryFromDb(brandProfileId);
      }
      return await cachedRead({
        key: appCacheKeys.brandIntegrations(brandProfileId, identity.id),
        load: () => loadBrandIntegrationSummaryFromDb(brandProfileId),
      });
    } catch (error) {
      console.error("[fetchBrandIntegrationSummary] failed", error);
      return createEmptySummary();
    }
  },
);
