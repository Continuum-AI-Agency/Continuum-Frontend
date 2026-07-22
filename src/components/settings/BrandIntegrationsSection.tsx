'use client';

import React from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useBrandIntegrations } from '@/hooks/useBrandIntegrations';
import type { BrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import { BrandIntegrationsCard } from './BrandIntegrationsCard';

type Props = {
  initialSummary?: BrandIntegrationSummary;
};

export function BrandIntegrationsSection({ initialSummary }: Props) {
  const { activeBrandId } = useActiveBrandContext();
  const { integrations, isLoading, refresh } = useBrandIntegrations(activeBrandId, initialSummary);

  return (
    <BrandIntegrationsCard
      brandProfileId={activeBrandId}
      summary={integrations}
      isLoading={isLoading}
      onRefresh={refresh}
    />
  );
}
