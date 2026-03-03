"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";

async function fetchIntegrations(brandId: string): Promise<BrandIntegrationSummary> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
  const supabase = createSupabaseBrowserClient();
  
  const { data, error } = await supabase.functions.invoke("fetch-brand-integrations", {
    body: { brandId },
  });

  if (error || !data?.summary) {
    console.error("[useBrandIntegrations] Edge function failed", error);
    // Fallback to internal API route if edge function is not deployed or fails
    const response = await fetch(`/api/brand-integrations?brand=${encodeURIComponent(brandId)}`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Unable to load integrations");
    }

    const json = await response.json();
    return json.summary as BrandIntegrationSummary;
  }

  return data.summary as BrandIntegrationSummary;
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
