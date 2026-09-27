import { listReviewEventsResponseSchema, type MediaReviewStatus } from '@continuum/contracts';
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
// first, with actor names resolved from brand membership emails, and each
// version's own decided state. Transitions are
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

  // Each version's own decided state, for the pill on an older version.
  const [versionsResult, assetResult] = await Promise.all([
    mediaSchema(client)
      .from('asset_versions')
      .select('id, version_number, review_status, review_state_id')
      .eq('asset_id', assetId)
      .eq('brand_id', brandId)
      .order('version_number', { ascending: false }),
    mediaSchema(client)
      .from('assets')
      .select('head_version_id')
      .eq('id', assetId)
      .eq('brand_id', brandId)
      .maybeSingle(),
  ]);
  if (versionsResult.error || assetResult.error) {
    console.error(
      '[library/review] version state read failed',
      versionsResult.error ?? assetResult.error,
    );
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const headVersionId = (assetResult.data as { head_version_id: string | null } | null)
    ?.head_version_id;
  const versions = (
    (versionsResult.data ?? []) as {
      id: string;
      version_number: number;
      review_status: MediaReviewStatus | null;
      review_state_id: string | null;
    }[]
  ).map((row) => ({
    versionId: row.id,
    versionNumber: row.version_number,
    isHead: row.id === headVersionId,
    reviewStatus: row.review_status,
    reviewStateId: row.review_state_id,
  }));

  const rows = (data ?? []) as unknown as ReviewEventRow[];
  const emailMap = await loadMemberEmailMap(client, brandId);
  const events = rows.map((row) =>
    reviewEventRowToContract(row, row.actor ? (emailMap.get(row.actor) ?? null) : null),
  );

  return NextResponse.json(listReviewEventsResponseSchema.parse({ events, versions }));
}
