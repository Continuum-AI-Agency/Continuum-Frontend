import "server-only";

import { httpServer } from "@/lib/api/http.server";
import {
  assetsResponseSchema,
  updateAssetsInputSchema,
} from "@/lib/schemas/brand-assets";

export async function fetchBrandProfileIncludedAssets(brandProfileId: string) {
  const res = await httpServer.request({
    path: `/brands/${brandProfileId}/assets`,
    method: "GET",
    schema: assetsResponseSchema,
    cache: "no-store",
  });
  return res.assets;
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


