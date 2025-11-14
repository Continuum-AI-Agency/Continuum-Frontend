"use server";

import "server-only";

import { httpServer } from "@/lib/api/http.server";
import { assetsResponseSchema } from "@/lib/schemas/brand-assets";

export async function fetchAvailableAssets(providers?: string[]) {
  const query = providers?.length ? `?providers=${encodeURIComponent(providers.join(","))}` : "";
  const res = await httpServer.request({
    path: `/integrations/assets${query}`,
    method: "GET",
    schema: assetsResponseSchema,
    cache: "no-store",
  });
  return res.assets;
}
