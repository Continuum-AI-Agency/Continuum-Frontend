import "server-only";

import { createClient } from "@supabase/supabase-js";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type BrandProfileIntegrationRow =
  Database["brand_profiles"]["Tables"]["brand_profile_integration_accounts"]["Row"];
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
  // Prefer service role to avoid RLS blockers on cross-owner integration assets.
  const supabase =
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? createClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
      : await createSupabaseServerClient();

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .select(
      `
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
    `
    )
    .eq("brand_profile_id", brandProfileId);

  if (error) {
    console.error("[fetchBrandIntegrationSummary] assignments query failed", error);
    return createEmptySummary();
  }

  if (!data || data.length === 0) {
    return createEmptySummary();
  }

  const summary = createEmptySummary();

  data.forEach((assignment: any) => {
    const account = assignment.integration_accounts_assets as IntegrationAccountAssetRow | null;
    if (!account) return;

    const platformKey = mapIntegrationTypeToPlatformKey(account.type ?? undefined);
    if (!platformKey) return;

    const accountName = resolveAccountName({
      alias: assignment.alias ?? null,
      accountName: account.name ?? null,
      externalAccountId: account.external_account_id ?? null,
    });

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
  data.forEach((assignment: any) => {
    const account = assignment.integration_accounts_assets as IntegrationAccountAssetRow | null;
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

  PLATFORM_KEYS.forEach(key => {
    summary[key].accounts.sort((a, b) => a.name.localeCompare(b.name));
  });

  return summary;
}
