import "server-only";

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

  const { data: assignments, error: assignmentsError } = await supabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .select("id, integration_account_id, alias, created_at")
    .eq("brand_profile_id", brandProfileId);

  if (assignmentsError) {
    console.error("[fetchBrandIntegrationSummary] assignments query failed", assignmentsError);
    return createEmptySummary();
  }

  if (!assignments || assignments.length === 0) {
    return createEmptySummary();
  }

  const integrationAccountIds = Array.from(
    new Set(assignments.map(assignment => assignment.integration_account_id))
  );

  const { data: accounts, error: accountsError } = await supabase
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select("id, integration_id, type, name, status, external_account_id, created_at")
    .in("id", integrationAccountIds);

  if (accountsError) {
    console.error("[fetchBrandIntegrationSummary] accounts query failed", accountsError);
    return createEmptySummary();
  }

  const accountRows = (accounts ?? []) as IntegrationAccountAssetRow[];
  const accountsById = new Map<string, IntegrationAccountAssetRow>();
  for (const account of accountRows) {
    accountsById.set(account.id, account);
  }

  const summary = createEmptySummary();

  assignments.forEach((assignment: BrandProfileIntegrationRow) => {
    const account = accountsById.get(assignment.integration_account_id);
    if (!account) {
      return;
    }

    const platformKey = mapIntegrationTypeToPlatformKey(account.type ?? undefined);
    if (!platformKey) {
      return;
    }

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
    });
  });

  PLATFORM_KEYS.forEach(key => {
    summary[key].accounts.sort((a, b) => a.name.localeCompare(b.name));
  });

  return summary;
}
