import { listReviewEventsResponseSchema } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  REVIEW_EVENT_SELECT,
  type ReviewEventRow,
  reviewEventRowToContract,
} from '@/lib/library/reviewMapping';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const EVENT_PAGE_SIZE = 100;

const listQuerySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
});

// Names are cosmetic — a failed lookup degrades to null actors, never a 500.
async function loadMemberEmailMap(
  client: SupabaseClient,
  brandId: string,
): Promise<Map<string, string>> {
  const { data, error } = await client
    .schema('brand_profiles')
    .from('permissions')
    .select('user_id, email')
    .eq('brand_profile_id', brandId);
  const map = new Map<string, string>();
  if (error) {
    console.warn('[library/review] member email lookup failed', error);
    return map;
  }
  for (const row of (data ?? []) as { user_id: string | null; email: string | null }[]) {
    if (row.user_id && row.email) map.set(row.user_id, row.email);
  }
  return map;
}

// GET /api/library/review?brandId&assetId — the asset's audit trail, newest
// first, with actor names resolved from brand membership emails. Transitions are
// written through the Creative Operations edge function, not here.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Read on the caller's RLS-scoped client: review events and team permissions
  // are member-readable, and the service-role key does not live on Vercel.
  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await mediaSchema(client)
    .from('asset_review_events')
    .select(REVIEW_EVENT_SELECT)
    .eq('asset_id', assetId)
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(EVENT_PAGE_SIZE);
  if (error) {
    console.error('[library/review] event list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ReviewEventRow[];
  const emailMap = await loadMemberEmailMap(client, brandId);
  const events = rows.map((row) =>
    reviewEventRowToContract(row, row.actor ? (emailMap.get(row.actor) ?? null) : null),
  );

  return NextResponse.json(listReviewEventsResponseSchema.parse({ events }));
}
