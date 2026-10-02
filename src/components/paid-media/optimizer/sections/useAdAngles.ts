'use client';

// The communication angle of each ad in one ad set, for the creative recommendation card.
// Reads `paid_media_get_ad_angles` (brand-asserting, granted to authenticated) and keeps
// the closed-vocabulary keys the shared `PaidAdAngleSchema` would strip — hence its own
// query key, so the two parsed shapes never share a cache entry.

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { type CardAdAngle, parseCardAdAngles } from './creativeCardModel';

const TEN_MINUTES = 10 * 60 * 1000;
const NO_ROWS: CardAdAngle[] = [];

export const adAnglesQueryKey = (brandId: string, adsetId: string) =>
  ['optimizer', 'ad-angles', 'card', brandId, adsetId] as const;

async function fetchCardAdAngles(brandId: string, adsetId: string): Promise<CardAdAngle[]> {
  const { data, error } = await createSupabaseBrowserClient().rpc('paid_media_get_ad_angles', {
    p_brand_id: brandId,
    p_adset_ids: [adsetId],
  });
  if (error) throw new Error('paid_media_get_ad_angles unreachable');
  return parseCardAdAngles(data);
}

export function useAdAngles(brandId: string, adsetId: string | null) {
  const query = useQuery({
    queryKey: adAnglesQueryKey(brandId, adsetId ?? 'none'),
    queryFn: () => fetchCardAdAngles(brandId, adsetId as string),
    enabled: Boolean(brandId && adsetId),
    staleTime: TEN_MINUTES,
    retry: 1,
  });
  return { ...query, data: query.data ?? NO_ROWS };
}
