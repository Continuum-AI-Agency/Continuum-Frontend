"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";

async function fetchIntegrations(brandId: string): Promise<BrandIntegrationSummary> {
  const response = await fetch(
    `/api/brand-integrations?brand=${encodeURIComponent(brandId)}`,
    { method: "GET", cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Unable to load integrations");
  }

  const json = (await response.json()) as { summary?: BrandIntegrationSummary };
  if (!json.summary) {
    throw new Error("Malformed integrations response");
  }
  return json.summary;
}

export function useBrandIntegrations(brandId?: string, initialData?: BrandIntegrationSummary) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["brand-integrations", brandId],
    queryFn: () =>
      brandId
        ? fetchIntegrations(brandId)
        : Promise.resolve(initialData ?? ({} as BrandIntegrationSummary)),
    enabled: Boolean(brandId),
    initialData,
  });

  return {
    integrations: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () =>
      brandId
        ? queryClient.invalidateQueries({ queryKey: ["brand-integrations", brandId] })
        : Promise.resolve(),
  };
}
