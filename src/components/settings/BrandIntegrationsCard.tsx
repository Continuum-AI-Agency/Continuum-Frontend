"use client";

import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { BrandIntegrationsManager } from "@/components/integrations/BrandIntegrationsManager";

type Props = {
  brandProfileId?: string;
  summary?: BrandIntegrationSummary;
  showHeader?: boolean;
  isLoading?: boolean;
  onRefresh?: () => Promise<void> | void;
};

export function BrandIntegrationsCard({
  brandProfileId,
  summary,
  showHeader = true,
  isLoading = false,
  onRefresh,
}: Props) {
  return (
    <BrandIntegrationsManager
      brandProfileId={brandProfileId}
      summary={summary}
      showHeader={showHeader}
      isLoading={isLoading}
      onRefresh={onRefresh}
    />
  );
}
