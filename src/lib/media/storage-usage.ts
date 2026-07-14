import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaSchema } from './supabase-media';

const STORAGE_USAGE_PAGE_SIZE = 1_000;

export async function sumActiveMediaAssetBytes(
  client: SupabaseClient,
  brandId: string,
): Promise<number> {
  const query = mediaSchema(client)
    .from('assets')
    .select('size_bytes')
    .eq('brand_id', brandId)
    .is('deleted_at', null);

  let total = 0;
  for (let from = 0; ; from += STORAGE_USAGE_PAGE_SIZE) {
    const { data, error } = await query.range(from, from + STORAGE_USAGE_PAGE_SIZE - 1);
    if (error) throw new Error(`storage usage query failed: ${error.message}`);
    const rows = (data ?? []) as unknown as { size_bytes: number | null }[];
    total += rows.reduce((sum, row) => sum + (row.size_bytes ?? 0), 0);
    if (rows.length < STORAGE_USAGE_PAGE_SIZE) return total;
  }
}
