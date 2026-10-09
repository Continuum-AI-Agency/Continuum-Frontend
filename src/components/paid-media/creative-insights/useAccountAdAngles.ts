'use client';

// Every labelled ad's closed-vocabulary angle across the brand, for Creative Insights.
//
// Same RPC as the Optimizer card's useAdAngles (paid_media_get_ad_angles, brand-asserting,
// granted to authenticated), called without an ad-set filter: this page needs the whole
// account, and the RPC carries no account column — the caller scopes the rows by ad set.
// Parsed with the card's schema so the closed-vocabulary keys survive.

import { useQuery } from '@tanstack/react-query';
import {
  type CardAdAngle,
  parseCardAdAngles,
} from '@/components/paid-media/optimizer/sections/creativeCardModel';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const TEN_MINUTES = 10 * 60 * 1000;
const NO_ROWS: CardAdAngle[] = [];

export const accountAdAnglesQueryKey = (brandId: string) =>
  ['creative-insights', 'ad-angles', brandId] as const;

async function fetchBrandAdAngles(brandId: string): Promise<CardAdAngle[]> {
  const { data, error } = await createSupabaseBrowserClient().rpc('paid_media_get_ad_angles', {
    p_brand_id: brandId,
  });
  if (error) throw new Error('paid_media_get_ad_angles unreachable');
  return parseCardAdAngles(data);
}

export function useAccountAdAngles(brandId: string) {
  const query = useQuery({
    queryKey: accountAdAnglesQueryKey(brandId),
    queryFn: () => fetchBrandAdAngles(brandId),
    enabled: Boolean(brandId),
    staleTime: TEN_MINUTES,
    retry: 1,
  });
  return { ...query, data: query.data ?? NO_ROWS };
}
