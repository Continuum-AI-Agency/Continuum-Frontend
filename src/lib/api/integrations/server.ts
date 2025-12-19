"use server";

import "server-only";

import { httpServer } from "@/lib/api/http.server";
import {
  selectableAssetsResponseSchema,
  integrationAssetsResponseSchema,
  applyBrandProfileIntegrationAccountsRequestSchema,
  linkIntegrationAccountsResponseSchema,
  type SelectableAssetsResponse,
  type IntegrationAssetsResponse,
  type LinkIntegrationAccountsResponse,
} from "@/lib/schemas/integrations";

async function getServerUserId(): Promise<string | undefined> {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? undefined;
  } catch {
    return undefined;
  }
}

export async function fetchSelectableAssetsForUser(userId: string): Promise<SelectableAssetsResponse> {
  return httpServer.request({
    path: `/integrations/brand-profiles/${encodeURIComponent(userId)}/selectable-assets`,
    method: "GET",
    schema: selectableAssetsResponseSchema,
    cache: "no-store",
  });
}

export async function fetchSelectableAssetsForCurrentUser(): Promise<SelectableAssetsResponse> {
  const userId = await getServerUserId();
  if (!userId) {
    throw new Error("Unable to determine user id for selectable assets.");
  }
  return fetchSelectableAssetsForUser(userId);
}

export async function fetchIntegrationAssetsServer(integrationId: string): Promise<IntegrationAssetsResponse> {
  if (!integrationId) {
    throw new Error("integrationId is required to fetch integration assets.");
  }

  const search = new URLSearchParams({ integration_id: integrationId });
  return httpServer.request({
    path: `/integrations/assets?${search.toString()}`,
    method: "GET",
    schema: integrationAssetsResponseSchema,
    cache: "no-store",
  });
}

export type ApplyBrandProfileIntegrationAccountsParams =
  | { brandId: string; assetPks: string[] }
  | { brandId: string; integrationAccountIds: string[] };

export async function applyBrandProfileIntegrationAccountsServer(
  params: ApplyBrandProfileIntegrationAccountsParams
): Promise<LinkIntegrationAccountsResponse> {
  const { brandId } = params;
  const body = "assetPks" in params
    ? { asset_pks: params.assetPks }
    : { integration_account_ids: params.integrationAccountIds };

  const parsedBody = applyBrandProfileIntegrationAccountsRequestSchema.parse(body);

  return httpServer.request({
    path: `/integrations/brand-profiles/${encodeURIComponent(brandId)}/integration-accounts`,
    method: "POST",
    body: parsedBody,
    schema: linkIntegrationAccountsResponseSchema,
    cache: "no-store",
  });
}
