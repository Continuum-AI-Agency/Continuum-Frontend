'use client';

// Client-side Brand Book read for the AI Studio canvas. Mirrors the server-side
// fetchBrandBook (src/lib/brands/brandBook.ts) but uses the browser Supabase
// client so canvas node menus can show which brand-book pieces exist and disable
// the ones the brand has not built yet. The get-brand-book edge function never
// 404s — an absent/assembling book returns present:false.

import { type BrandBookResponse, brandBookResponseSchema } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const brandBookQueryKey = (brandId?: string) => ['brand-book', brandId] as const;

async function fetchBrandBookClient(brandId: string): Promise<BrandBookResponse | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke('get-brand-book', { body: { brandId } });
  if (error) {
    console.error(`[brandBook] get-brand-book failed for ${brandId}`, error);
    return null;
  }
  const parsed = brandBookResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.error(
      `[brandBook] invalid get-brand-book response for ${brandId}`,
      parsed.error.issues,
    );
    return null;
  }
  return parsed.data;
}

export function useBrandBook(brandId?: string) {
  const query = useQuery({
    queryKey: brandBookQueryKey(brandId),
    queryFn: () => (brandId ? fetchBrandBookClient(brandId) : Promise.resolve(null)),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });

  return {
    brandBook: query.data ?? null,
    brandTokens: query.data?.brand_tokens ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
