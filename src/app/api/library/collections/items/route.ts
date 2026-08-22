import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const itemSchema = z.object({
  brandId: z.string().uuid(),
  collectionId: z.string().uuid(),
  assetId: z.string().uuid(),
});

// Confirms the collection AND asset both belong to brandId before mutating, so
// a member of one brand cannot graft assets onto another brand's collection.
async function assertCollectionAndAssetInBrand(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  brandId: string,
  collectionId: string,
  assetId: string,
): Promise<boolean> {
  const [{ data: col }, { data: asset }] = await Promise.all([
    mediaSchema(admin)
      .from('collections')
      .select('id')
      .eq('id', collectionId)
      .eq('brand_id', brandId)
      .single(),
    mediaSchema(admin)
      .from('assets')
      .select('id')
      .eq('id', assetId)
      .eq('brand_id', brandId)
      .single(),
  ]);
  return Boolean(col && asset);
}

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

  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, collectionId, assetId } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  if (!(await assertCollectionAndAssetInBrand(admin, brandId, collectionId, assetId))) {
    return NextResponse.json({ error: 'Collection or asset not found' }, { status: 404 });
  }

  const { error } = await mediaSchema(admin)
    .from('collection_items')
    .upsert(
      { collection_id: collectionId, asset_id: assetId, added_by: user.id },
      { onConflict: 'collection_id,asset_id' },
    );

  if (error) {
    console.error('[library/collections/items] add failed', error);
    return NextResponse.json({ error: 'Add failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
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

  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, collectionId, assetId } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  if (!(await assertCollectionAndAssetInBrand(admin, brandId, collectionId, assetId))) {
    return NextResponse.json({ error: 'Collection or asset not found' }, { status: 404 });
  }

  const { error } = await mediaSchema(admin)
    .from('collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .eq('asset_id', assetId);

  if (error) {
    console.error('[library/collections/items] remove failed', error);
    return NextResponse.json({ error: 'Remove failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
