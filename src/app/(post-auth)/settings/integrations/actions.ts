"use server";

import { revalidatePath } from "next/cache";
import {
  grantIntegrationToBrand,
  revokeIntegrationFromBrand,
} from "@/lib/integrations/grants";

export async function grantIntegrationToBrandAction(
  brandProfileId: string,
  integrationId: string,
): Promise<string> {
  if (!brandProfileId) throw new Error("brandProfileId is required");
  if (!integrationId) throw new Error("integrationId is required");

  const grantId = await grantIntegrationToBrand(brandProfileId, integrationId);
  revalidatePath("/integrations");
  revalidatePath("/settings/integrations");
  return grantId;
}

export async function revokeIntegrationFromBrandAction(grantId: string): Promise<void> {
  if (!grantId) throw new Error("grantId is required");

  await revokeIntegrationFromBrand(grantId);
  revalidatePath("/integrations");
  revalidatePath("/settings/integrations");
}
