import "server-only";

import { cache } from "react";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

// cache() deduplicates within a single server request — multiple Server Components
// calling fetchBrandIntegrationSummary(same brandId) only execute once.
export const fetchBrandIntegrationSummary = cache(
  async (brandProfileId: string): Promise<BrandIntegrationSummary> => {
    const supabase = await createSupabaseServerClient();

    const { data: rows, error: rpcError } = await supabase
      .schema("brand_profiles")
      .rpc("get_brand_integration_summary", {
        p_brand_profile_id: brandProfileId,
      });

    if (rpcError || !rows) {
      console.error("[fetchBrandIntegrationSummary] RPC failed", rpcError);
      return createEmptySummary();
    }

    const summary = createEmptySummary();
    for (const row of rows as Record<string, unknown>[]) {
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
      });
    }
    return summary;
  },
);
