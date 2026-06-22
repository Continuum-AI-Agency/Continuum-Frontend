import { brandBookResponseSchema, type BrandBookResponse } from "@continuum/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Durable Brand Book read. Calls the DB-adjacent `get-brand-book` edge function
// (which reads the composite under the caller's JWT/RLS) rather than the Fastify
// backend — lower-latency for a pure read, no GCP-VM round-trip. Returns null on
// any failure so the Settings viewer can render an empty state.
export async function fetchBrandBook(brandId: string): Promise<BrandBookResponse | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke("get-brand-book", {
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
