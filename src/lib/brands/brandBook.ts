import { type BrandBookResponse, brandBookResponseSchema } from '@continuum/contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Durable Brand Book read. Calls the DB-adjacent `get-brand-book` edge function
// (which reads the materialized brand_book row under the caller's JWT/RLS) rather
// than the Fastify backend — lower-latency for a pure read, no GCP-VM round-trip.
// The edge function NEVER 404s: an absent/assembling book returns 200 with
// `present:false`, so this resolves to a valid envelope the viewer can switch on.
// Returns null only on a genuine transport error or a schema mismatch — the
// benign "not built yet" case is no longer an error.
export async function fetchBrandBook(brandId: string): Promise<BrandBookResponse | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke('get-brand-book', {
    body: { brandId },
  });

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
