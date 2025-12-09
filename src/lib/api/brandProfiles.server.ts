import "server-only";

import { httpServer } from "@/lib/api/http.server";
import {
  assetsResponseSchema,
  updateAssetsInputSchema,
  type Asset,
} from "@/lib/schemas/brand-assets";

export async function fetchBrandProfileIncludedAssets(brandProfileId: string): Promise<Asset[]> {
  const res = await httpServer.request({
    path: `/brands/${brandProfileId}/assets`,
    method: "GET",
    schema: assetsResponseSchema,
    cache: "no-store",
  });
  // Ensure included flag is always a boolean for downstream consumers.
  return res.assets.map(asset => ({
    ...asset,
    included: Boolean(asset.included),
  }));
}

export async function updateBrandProfileAssets(brandProfileId: string, input: unknown) {
  const body = updateAssetsInputSchema.parse(input);
  const res = await httpServer.request({
    path: `/brands/${brandProfileId}/assets`,
    method: "PUT",
    body,
    schema: assetsResponseSchema,
    cache: "no-store",
  });
  return res.assets;
}

