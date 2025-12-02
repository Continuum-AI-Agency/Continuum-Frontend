"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";

async function fetchIntegrations(brandId: string): Promise<BrandIntegrationSummary> {
  const response = await fetch(`/api/brand-integrations?brand=${encodeURIComponent(brandId)}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Unable to load integrations");
  }

  const json = await response.json();
  return json.summary as BrandIntegrationSummary;
}

export function useBrandIntegrations(brandId?: string, initialData?: BrandIntegrationSummary) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["brand-integrations", brandId],
    queryFn: () => (brandId ? fetchIntegrations(brandId) : Promise.resolve(initialData ?? ({} as BrandIntegrationSummary))),
    enabled: Boolean(brandId),
    initialData: initialData,
  });

  return {
    integrations: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () => (brandId ? queryClient.invalidateQueries({ queryKey: ["brand-integrations", brandId] }) : Promise.resolve()),
  };
}
