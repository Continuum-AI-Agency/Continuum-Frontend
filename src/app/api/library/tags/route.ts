import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { aggregateTagCounts } from '@/lib/media/filters';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const TAG_CAP = 40;
// PostgREST caps responses at max_rows (1000), so the scan pages explicitly.
const SCAN_PAGE_SIZE = 1000;
const MAX_SCAN_PAGES = 5;

const querySchema = z.object({
  brandId: z.string().uuid(),
});

// Brand tag vocabulary feeding the library's tag filter chips: distinct
// unnested tags with usage counts over the newest tagged assets (bounded scan),
// excluding the carousel-slide system tag.
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ brandId: url.searchParams.get('brandId') });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // User-scoped read: media.assets RLS (has_brand_access) already restricts to
  // the caller's brand, so no service-role bypass is needed.
  const tagRows: { tags: string[] | null }[] = [];
  for (let page = 0; page < MAX_SCAN_PAGES; page++) {
    const from = page * SCAN_PAGE_SIZE;
    const { data, error } = await mediaSchema(supabase)
      .from('assets')
      .select('tags')
      .eq('brand_id', brandId)
      .is('deleted_at', null)
      .not('tags', 'is', null)
      .neq('tags', '{}')
      .order('created_at', { ascending: false })
      .range(from, from + SCAN_PAGE_SIZE - 1);
    if (error) {
      console.error('[library/tags] tags query failed', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    const batch = (data ?? []) as { tags: string[] | null }[];
    tagRows.push(...batch);
    if (batch.length < SCAN_PAGE_SIZE) break;
  }

  return NextResponse.json({ tags: aggregateTagCounts(tagRows, TAG_CAP) });
}
