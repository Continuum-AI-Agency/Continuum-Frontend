import {
  collectionViewConfigSchema,
  collectionVisibilitySchema,
  type MediaCollection,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLibraryCollectionOperation } from '@/lib/library/creativeOperations';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { ensureLibrarySystemViews } from '@/lib/media/fetchers.server';
import type { MediaCollectionRow } from '@/lib/media/schema';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { operationFailure, refuseViewer } from './operationFailure';

function rowToCollection(row: MediaCollectionRow): MediaCollection {
  const visibility = collectionVisibilitySchema.safeParse(row.visibility);
  const viewConfig = collectionViewConfigSchema.safeParse(row.view_config);
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    kind: row.kind,
    smartQuery: row.smart_query,
    coverAssetId: row.cover_asset_id,
    itemCount: 0,
    parentId: row.parent_id ?? null,
    depth: row.depth ?? 0,
    systemKey: row.system_key ?? null,
    visibility: visibility.success ? visibility.data : 'team',
    viewConfig: viewConfig.success ? viewConfig.data : {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const createSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

// Every write goes through the Library dispatcher (library-creative-operations) on the
// CALLER's own session: the edge function verifies the JWT and passes that user as the
// actor, so library_internal.authorize_operation refuses a viewer. A service-role write here
// would skip that gate — and there is no service-role key on the deployed Frontend anyway.
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

  const refused = await refuseViewer(supabase, brandId);
  if (refused) return refused;

  try {
    const collection = await createLibraryCollectionOperation(supabase, {
      brandId,
      name,
      kind: 'manual',
    });
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    return operationFailure('create', error);
  }
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

  await ensureLibrarySystemViews(supabase, brandId);

  // The user-scoped client: RLS is the fence, including the restrictive policy that keeps a
  // private collection its creator's alone.
  const { data, error } = await mediaSchema(supabase)
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
