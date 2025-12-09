"use server";

import "server-only";

import { httpServer } from "@/lib/api/http.server";
import { assetsResponseSchema, type Asset } from "@/lib/schemas/brand-assets";

export async function fetchAvailableAssets(providers?: string[]): Promise<Asset[]> {
  const query = providers?.length ? `?providers=${encodeURIComponent(providers.join(","))}` : "";
  const res = await httpServer.request({
    path: `/integrations/assets${query}`,
    method: "GET",
    schema: assetsResponseSchema,
    cache: "no-store",
  });
  // Ensure included is always a concrete boolean for form consumers.
  return res.assets.map(asset => ({
    ...asset,
    included: Boolean(asset.included),
  }));
}
