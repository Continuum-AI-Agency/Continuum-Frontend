"use client";

import { http } from "@/lib/api/http";
import {
  assetsResponseSchema,
  updateAssetsInputSchema,
} from "@/lib/schemas/brand-assets";

export async function updateBrandProfileAssets(brandProfileId: string, input: unknown) {
  const body = updateAssetsInputSchema.parse(input);
  const res = await http.request({
    path: `/brands/${brandProfileId}/assets`,
    method: "PUT",
    body,
    schema: assetsResponseSchema,
    cache: "no-store",
  });
  return res.assets;
}


