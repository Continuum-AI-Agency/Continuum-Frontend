"use server";

import { revalidatePath, updateTag } from "next/cache";
import {
  grantIntegrationToBrand,
  revokeIntegrationFromBrand,
} from "@/lib/integrations/grants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tags } from "@/lib/cache/tags";

function revalidateBrandIntegrationConsumers(brandProfileId: string) {
  // Immediate invalidation so the same request reads fresh data after the mutation.
  updateTag(tags.integrations.forBrand(brandProfileId));

  // Path-based invalidation remains until consumer pages adopt cacheTag()
  // on the read side. Once tagged, drop these revalidatePath calls.
  revalidatePath("/settings");
  revalidatePath("/settings/integrations");
  revalidatePath("/integrations");
  revalidatePath("/dashboard");
  revalidatePath("/organic");
  revalidatePath("/paid-media");
}

export async function grantIntegrationToBrandAction(
  brandProfileId: string,
  integrationId: string,
): Promise<string> {
  if (!brandProfileId) throw new Error("brandProfileId is required");
  if (!integrationId) throw new Error("integrationId is required");

  const grantId = await grantIntegrationToBrand(brandProfileId, integrationId);
  revalidateBrandIntegrationConsumers(brandProfileId);
  return grantId;
}

export async function revokeIntegrationFromBrandAction(
  grantId: string,
  brandProfileId: string,
): Promise<void> {
  if (!grantId) throw new Error("grantId is required");
  if (!brandProfileId) throw new Error("brandProfileId is required");

  await revokeIntegrationFromBrand(grantId);
  revalidateBrandIntegrationConsumers(brandProfileId);
}

export async function applyBrandIntegrationAssignmentsAction(
  brandProfileId: string,
  desiredAccountIds: string[],
): Promise<{ linked: number }> {
  if (!brandProfileId) throw new Error("brandProfileId is required");

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .select("id, integration_account_id")
    .eq("brand_profile_id", brandProfileId);

  if (fetchError) throw new Error(fetchError.message);

  const existingRows = (existing ?? []) as Array<{
    id: string;
    integration_account_id: string;
  }>;

  const existingIds = new Set(existingRows.map((r) => r.integration_account_id));
  const desiredSet = new Set(desiredAccountIds);

  const toRemove = existingRows.filter((r) => !desiredSet.has(r.integration_account_id));
  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .delete()
      .in(
        "id",
        toRemove.map((r) => r.id),
      );
    if (deleteError) throw new Error(deleteError.message);
  }

  const toAdd = desiredAccountIds.filter((id) => !existingIds.has(id));
  if (toAdd.length > 0) {
    const { error: insertError } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .insert(
        toAdd.map((accountId) => ({
          brand_profile_id: brandProfileId,
          integration_account_id: accountId,
        })),
      );
    if (insertError) throw new Error(insertError.message);
  }

  revalidateBrandIntegrationConsumers(brandProfileId);
  return { linked: desiredAccountIds.length };
}
