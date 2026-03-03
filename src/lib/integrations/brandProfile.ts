import "server-only";

import { createClient } from "@supabase/supabase-js";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
type IntegrationAccountAssetRow =
  Database["brand_profiles"]["Tables"]["integration_accounts_assets"]["Row"];

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

function resolveAccountName(row: {
  alias: string | null;
  accountName: string | null;
  externalAccountId: string | null;
}): string {
  if (row.alias) return row.alias;
  if (row.accountName) return row.accountName;
  if (row.externalAccountId) return row.externalAccountId;
  return "Account";
}

export async function fetchBrandIntegrationSummary(
  brandProfileId: string
): Promise<BrandIntegrationSummary> {
  const supabase = await createSupabaseServerClient();
  
  // We invoke the edge function which handles the cross-owner bypass using its own service role.
  // This avoids needing the service role key in the frontend server's environment.
  const { data, error } = await supabase.functions.invoke("fetch-brand-integrations", {
    body: { brandId: brandProfileId },
  });

  if (!error && data?.summary) {
    return data.summary as BrandIntegrationSummary;
  }

  // Fallback to local implementation if Edge Function is unavailable or fails
  console.warn("[fetchBrandIntegrationSummary] Edge function failed, falling back to local query", error);
  
  // Local implementation (requires SERVICE_ROLE_KEY for cross-owner access if user is not owner)
  const querySupabase =
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? createClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
      : supabase;

  const { data: assignments, error: queryError } = await querySupabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .select(`
      id,
      alias,
      created_at,
      settings,
      integration_accounts_assets:integration_account_id (
        id,
        integration_id,
        type,
        name,
        status,
        external_account_id
      )
    `)
    .eq("brand_profile_id", brandProfileId);

  if (queryError || !assignments) {
    console.error("[fetchBrandIntegrationSummary] assignments query failed", queryError);
    return createEmptySummary();
  }

  const summary = createEmptySummary();
  const rows = assignments as any[];

  rows.forEach((assignment) => {
    const account = assignment.integration_accounts_assets;
    if (!account) return;

    const platformKey = mapIntegrationTypeToPlatformKey(account.type ?? undefined);
    if (!platformKey) return;

summary[platformKey].accounts.push({
assignmentId: assignment.id,
integrationAccountId: account.id,
      alias: assignment.alias ?? null,
      name: accountName,
      externalAccountId: account.external_account_id ?? null,
      status: account.status ?? null,
      linkedAt: assignment.created_at ?? null,
      providerIntegrationId: account.integration_id,
      type: account.type ?? null,
      settings: (assignment.settings as Record<string, unknown> | null) ?? null,
    });
  });

  // Fallback: if a type wasn't mapped but clearly indicates platform, attempt substring mapping.
  rows.forEach((assignment) => {
    const account = assignment.integration_accounts_assets;
    if (!account) return;
    const alreadyIncluded = summary.youtube.accounts.some((a) => a.integrationAccountId === account.id);
    if (alreadyIncluded) return;
    const typeGuess = account.type?.toLowerCase() ?? "";
    if (!mapIntegrationTypeToPlatformKey(account.type) && typeGuess.includes("youtube")) {
      summary.youtube.accounts.push({
        assignmentId: assignment.id,
        integrationAccountId: account.id,
        alias: assignment.alias ?? null,
name: resolveAccountName({
alias: assignment.alias ?? null,
accountName: account.name ?? null,
externalAccountId: account.external_account_id ?? null,
}),
externalAccountId: account.external_account_id ?? null,
status: account.status ?? null,
linkedAt: assignment.created_at ?? null,
providerIntegrationId: account.integration_id,
type: account.type ?? null,
settings: (assignment.settings as Record<string, unknown> | null) ?? null,
    });
    }
});

  // Sort
  PLATFORM_KEYS.forEach(key => {
    summary[key].accounts.sort((a, b) => a.name.localeCompare(b.name));
  });

  return summary;
}
