import {
  listReviewEventsResponseSchema,
  reviewTransitionRequestSchema,
  reviewTransitionResponseSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  REVIEW_EVENT_SELECT,
  type ReviewEventRow,
  reviewEventRowToContract,
} from '@/lib/library/reviewMapping';
import { normalizeReviewStatus } from '@/lib/library/reviewStatus';
import { writeReviewTransition } from '@/lib/library/reviewTransition.server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const EVENT_PAGE_SIZE = 100;

const listQuerySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
});

// Names are cosmetic — a failed lookup degrades to null actors, never a 500.
async function loadMemberEmailMap(
  admin: SupabaseClient,
  brandId: string,
): Promise<Map<string, string>> {
  const { data, error } = await admin
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

// POST /api/library/review — one workflow transition: updates the asset's
// review_status and appends an immutable audit event (who, from→to, why).
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = reviewTransitionRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId, toStatus, note } = parsed.data;

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

  const admin = createSupabaseAdminClient();

  const { data: asset, error: assetError } = await mediaSchema(admin)
    .from('assets')
    .select('id, review_status')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  if (assetError) {
    console.error('[library/review] asset lookup failed', assetError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  const fromStatus = normalizeReviewStatus((asset as { review_status: string }).review_status);

  let write: Awaited<ReturnType<typeof writeReviewTransition>>;
  try {
    write = await writeReviewTransition(admin, {
      brandId,
      assetId,
      fromStatus,
      toStatus,
      actor: user.id,
      note: note ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  return NextResponse.json(
    reviewTransitionResponseSchema.parse({
      assetId,
      reviewStatus: toStatus,
      reviewStatusUpdatedAt: write.reviewStatusUpdatedAt,
      event: reviewEventRowToContract(write.event, user.email ?? null),
    }),
  );
}

// GET /api/library/review?brandId&assetId — the asset's audit trail, newest
// first, with actor names resolved from brand membership emails.
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

  const admin = createSupabaseAdminClient();

  const { data, error } = await mediaSchema(admin)
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
  const emailMap = await loadMemberEmailMap(admin, brandId);
  const events = rows.map((row) =>
    reviewEventRowToContract(row, row.actor ? (emailMap.get(row.actor) ?? null) : null),
  );

  return NextResponse.json(listReviewEventsResponseSchema.parse({ events }));
}
