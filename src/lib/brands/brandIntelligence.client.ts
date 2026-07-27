import {
  type BrandIntelligenceEnrichResponse,
  type BrandIntelligenceOverview,
  brandIntelligenceEnrichResponseSchema,
  brandIntelligenceOverviewSchema,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';

export const getBrandIntelligenceOverview = (brandId: string): Promise<BrandIntelligenceOverview> =>
  http.request({
    path: `/api/brands/${brandId}/intelligence/overview`,
    schema: brandIntelligenceOverviewSchema,
    cache: 'no-store',
  });

export const refreshBrandIntelligence = (
  brandId: string,
): Promise<BrandIntelligenceEnrichResponse> =>
  http.request({
    method: 'POST',
    path: `/api/brands/${brandId}/intelligence/enrich`,
    schema: brandIntelligenceEnrichResponseSchema,
  });
