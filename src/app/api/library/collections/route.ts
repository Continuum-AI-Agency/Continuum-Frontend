import type { MediaCollection } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import type { MediaCollectionRow } from '@/lib/media/schema';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function rowToCollection(row: MediaCollectionRow): MediaCollection {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    kind: row.kind,
    smartQuery: row.smart_query,
    coverAssetId: row.cover_asset_id,
    itemCount: 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const createSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, name } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await mediaSchema(admin)
    .from('collections')
    .insert({ brand_id: brandId, name, kind: 'manual', created_by: user.id })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[library/collections] create failed', error);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  return NextResponse.json(
    { collection: rowToCollection(data as MediaCollectionRow) },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const brandId = new URL(request.url).searchParams.get('brandId');
  if (!brandId || !z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: 'Missing brandId' }, { status: 400 });
  }

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await mediaSchema(admin)
    .from('collections')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[library/collections] list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const collections = ((data as MediaCollectionRow[] | null) ?? []).map(rowToCollection);
  return NextResponse.json({ collections });
}
