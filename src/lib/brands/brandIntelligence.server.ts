import 'server-only';

import {
  type BrandIntelligenceOverview,
  brandIntelligenceOverviewSchema,
} from '@continuum/contracts';
import { httpServer } from '@/lib/api/http.server';

export async function fetchBrandIntelligenceOverview(
  brandId: string,
): Promise<BrandIntelligenceOverview | null> {
  try {
    return await httpServer.request({
      path: `/api/brands/${brandId}/intelligence/overview`,
      schema: brandIntelligenceOverviewSchema,
      cache: 'no-store',
    });
  } catch (error) {
    console.error(`[brandIntelligence] overview failed for ${brandId}`, error);
    return null;
  }
}
