import "server-only";

import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type UserIntegrationRow = Database["brand_profiles"]["Tables"]["user_integrations"]["Row"];
type IntegrationAccountAssetRow =
  Database["brand_profiles"]["Tables"]["integration_accounts_assets"]["Row"];

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

  const { data: integrations, error: integrationsError } = await supabase
    .schema("brand_profiles")
    .from("user_integrations")
    .select("id, provider, status, user_id, platform_email, platform_user_id, created_at")
    .eq("user_id", userId);

  if (integrationsError) {
    console.error("[fetchUserIntegrationSummary] failed to load user_integrations", integrationsError);
    return createEmptyUserIntegrationSummary();
  }

  if (!integrations || integrations.length === 0) {
    return createEmptyUserIntegrationSummary();
  }

  const integrationIds = integrations.map(row => row.id);

  const { data: assets, error: assetsError } = await supabase
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select("id, integration_id, type, name, status, external_account_id, created_at")
    .in("integration_id", integrationIds);

  if (assetsError) {
    console.error("[fetchUserIntegrationSummary] failed to load integration_accounts_assets", assetsError);
    return createEmptyUserIntegrationSummary();
  }

  const assetsByIntegrationId = new Map<string, IntegrationAccountAssetRow[]>();
  for (const asset of assets ?? []) {
    const current = assetsByIntegrationId.get(asset.integration_id) ?? [];
    current.push(asset);
    assetsByIntegrationId.set(asset.integration_id, current);
  }

  const summary = createEmptyUserIntegrationSummary();

  integrations.forEach((integration: UserIntegrationRow) => {
    const relatedAssets = assetsByIntegrationId.get(integration.id) ?? [];
    relatedAssets.forEach(asset => {
      const platformKey = mapIntegrationTypeToPlatformKey(asset.type ?? undefined);
      if (!platformKey) return;

      summary[platformKey].accounts.push({
        id: asset.id,
        name: asset.name ?? integration.provider ?? "Account",
        status: asset.status ?? integration.status ?? null,
        externalAccountId: asset.external_account_id ?? null,
        provider: integration.provider,
        platformKey,
        createdAt: asset.created_at ?? integration.created_at ?? null,
      });
    });
  });

  PLATFORM_KEYS.forEach(key => {
    summary[key].accounts.sort((a, b) => a.name.localeCompare(b.name));
  });

  return summary;
}
