import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BrandIntegrationGrant = {
  grantId: string;
  integrationId: string;
  provider: string;
  grantedBy: string;
  grantedAt: string;
};

type ListBrandIntegrationsRow = {
  grant_id: string;
  integration_id: string;
  provider: string;
  granted_by: string;
  granted_at: string;
};

export const fetchBrandIntegrationGrants = cache(
  async (brandProfileId: string): Promise<BrandIntegrationGrant[]> => {
    if (!brandProfileId) return [];
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .schema("brand_profiles")
      .rpc("list_brand_integrations", { p_brand_profile_id: brandProfileId });

    if (error) {
      console.error("[fetchBrandIntegrationGrants] RPC failed", error);
      return [];
    }

    const rows = (data ?? []) as ListBrandIntegrationsRow[];
    return rows.map((row) => ({
      grantId: row.grant_id,
      integrationId: row.integration_id,
      provider: row.provider,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
    }));
  },
);

export async function grantIntegrationToBrand(
  brandProfileId: string,
  integrationId: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .rpc("grant_integration_to_brand", {
      p_brand_profile_id: brandProfileId,
      p_integration_id: integrationId,
    });

  if (error) {
    throw new Error(error.message ?? "Failed to grant integration to brand");
  }
  if (typeof data !== "string") {
    throw new Error("grant_integration_to_brand returned no grant id");
  }
  return data;
}

export type ConnectionGrantRow = {
  integrationId: string;
  brandProfileId: string;
  brandName: string;
  grantedAt: string;
};

type ListMyConnectionGrantsRow = {
  integration_id: string;
  brand_profile_id: string;
  brand_name: string;
  granted_at: string;
};

export const fetchMyConnectionGrants = cache(async (): Promise<ConnectionGrantRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .rpc("list_my_connection_grants");

  if (error) {
    console.error("[fetchMyConnectionGrants] RPC failed", error);
    return [];
  }

  const rows = (data ?? []) as ListMyConnectionGrantsRow[];
  return rows.map((row) => ({
    integrationId: row.integration_id,
    brandProfileId: row.brand_profile_id,
    brandName: row.brand_name,
    grantedAt: row.granted_at,
  }));
});

export async function revokeIntegrationFromBrand(grantId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("brand_profiles")
    .rpc("revoke_integration_from_brand", { p_grant_id: grantId });

  if (error) {
    throw new Error(error.message ?? "Failed to revoke grant");
  }
}
