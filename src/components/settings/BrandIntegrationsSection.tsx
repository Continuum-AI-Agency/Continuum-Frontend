"use client";

import React from "react";
import { BrandIntegrationsCard } from "./BrandIntegrationsCard";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { useBrandIntegrations } from "@/hooks/useBrandIntegrations";

type Props = {
  initialSummary?: BrandIntegrationSummary;
};

export function BrandIntegrationsSection({ initialSummary }: Props) {
  const { activeBrandId } = useActiveBrandContext();
  const { integrations, isLoading, refresh } = useBrandIntegrations(activeBrandId, initialSummary);

  return <BrandIntegrationsCard summary={integrations} isLoading={isLoading} onRefresh={refresh} />;
}
