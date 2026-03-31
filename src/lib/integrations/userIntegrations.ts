import "server-only";

import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserIntegrationAccount = {
  id: string;
  name: string;
  status: string | null;
  externalAccountId: string | null;
  provider: string;
  platformKey: PlatformKey | null;
  createdAt: string | null;
};

export type UserIntegrationSummary = Record<
  PlatformKey,
  {
    accounts: UserIntegrationAccount[];
  }
>;

export function createEmptyUserIntegrationSummary(): UserIntegrationSummary {
  return PLATFORM_KEYS.reduce((acc, key) => {
    acc[key] = { accounts: [] };
    return acc;
  }, {} as UserIntegrationSummary);
}

export async function fetchUserIntegrationSummary(userId: string): Promise<UserIntegrationSummary> {
  const supabase = await createSupabaseServerClient();

  // Primary path: single RPC call (replaces 2 sequential queries)
  const { data: rows, error: rpcError } = await supabase
    .schema("brand_profiles")
    .rpc("get_user_integration_summary", { p_user_id: userId });

  if (!rpcError && rows) {
    const summary = createEmptyUserIntegrationSummary();
    for (const row of rows as Record<string, unknown>[]) {
      const platformKey = row.platform_key as PlatformKey | null;
      if (!platformKey || !PLATFORM_KEYS.includes(platformKey)) continue;

      summary[platformKey].accounts.push({
        id: row.asset_id as string,
        name: (row.asset_name as string) ?? "Account",
        status: (row.asset_status as string | null) ?? null,
        externalAccountId: (row.external_account_id as string | null) ?? null,
        provider: row.provider as string,
        platformKey,
        createdAt: (row.created_at as string | null) ?? null,
      });
    }
    return summary;
  }

  // Fallback: existing 2-query approach for graceful rollout
  console.warn(
    "[fetchUserIntegrationSummary] RPC failed, falling back to sequential queries",
    rpcError,
  );

  const { data: integrations, error: integrationsError } = await supabase
    .schema("brand_profiles")
    .from("user_integrations")
    .select("id, provider, status, user_id, platform_email, platform_user_id, created_at")
    .eq("user_id", userId);

  if (integrationsError || !integrations || integrations.length === 0) {
    if (integrationsError) {
      console.error("[fetchUserIntegrationSummary] fallback query failed", integrationsError);
    }
    return createEmptyUserIntegrationSummary();
  }

  const integrationIds = integrations.map(row => row.id);

  const { data: assets, error: assetsError } = await supabase
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select("id, integration_id, type, name, status, external_account_id, created_at, updated_at")
    .in("integration_id", integrationIds);

  if (assetsError) {
    console.error("[fetchUserIntegrationSummary] fallback assets query failed", assetsError);
    return createEmptyUserIntegrationSummary();
  }

  const assetsByIntegrationId = new Map<string, typeof assets>();
  for (const asset of assets ?? []) {
    const current = assetsByIntegrationId.get(asset.integration_id) ?? [];
    current.push(asset);
    assetsByIntegrationId.set(asset.integration_id, current);
  }

  const summary = createEmptyUserIntegrationSummary();

  for (const integration of integrations) {
    const relatedAssets = assetsByIntegrationId.get(integration.id) ?? [];
    for (const asset of relatedAssets) {
      const platformKey = mapIntegrationTypeToPlatformKey(asset.type ?? undefined);
      if (!platformKey) continue;

      summary[platformKey].accounts.push({
        id: asset.id,
        name: asset.name ?? integration.provider ?? "Account",
        status: asset.status ?? integration.status ?? null,
        externalAccountId: asset.external_account_id ?? null,
        provider: integration.provider,
        platformKey,
        createdAt: asset.created_at ?? integration.created_at ?? null,
      });
    }
  }

  PLATFORM_KEYS.forEach(key => {
    summary[key].accounts.sort((a, b) => a.name.localeCompare(b.name));
  });

  return summary;
}
