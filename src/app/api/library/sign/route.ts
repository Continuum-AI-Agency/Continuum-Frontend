import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mintSignedUrl } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
  // Optional exact immutable version. Without it the asset HEAD is signed, which is
  // what a thumbnail wants; a canvas reference pinned to one render output wants the
  // bytes it was created from, which the head moves away from on the next upload.
  versionId: z.string().uuid().optional(),
});

// Mints a single signed URL for one asset. Used by the realtime hook to fill in
// a thumbnail for an asset that arrived via a postgres INSERT (which carries no
// signed URL). The asset is looked up scoped to the caller's brand.
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId, versionId } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // User-scoped read: media.assets RLS (has_brand_access) already restricts to
  // the caller's brand, so no service-role bypass is needed.
  const { data, error } = await mediaSchema(supabase)
    .from('assets')
    .select('storage_path, bucket, thumbnail_path')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const row = data as { storage_path: string; bucket: string; thumbnail_path: string | null };

  // The head read above stays the authorization AND the soft-delete gate even when an
  // exact version is asked for: `media.asset_versions` has no `deleted_at`, so signing
  // straight from a version row would hand back the bytes of a deleted asset. All three
  // of id/asset_id/brand_id must match — a version id on its own is a cross-asset read.
  if (versionId) {
    const { data: version, error: versionError } = await mediaSchema(supabase)
      .from('asset_versions')
      .select('storage_path, bucket')
      .eq('id', versionId)
      .eq('asset_id', assetId)
      .eq('brand_id', brandId)
      .single();
    if (versionError || !version) {
      return NextResponse.json({ error: 'Asset version not found' }, { status: 404 });
    }
    const versionRow = version as { storage_path: string; bucket: string };
    const versionUrl = await mintSignedUrl(versionRow.storage_path, versionRow.bucket);
    if (!versionUrl) {
      return NextResponse.json({ error: 'Sign failed' }, { status: 500 });
    }
    // No poster. `thumbnail_path` lives on the asset HEAD and follows it forward, so
    // handing it back next to a pinned version's URL would describe two different sets
    // of bytes as one asset. A caller that asks for an exact version gets exactly it.
    return NextResponse.json({ signedUrl: versionUrl, thumbnailUrl: null });
  }

  const signedUrl = await mintSignedUrl(row.storage_path, row.bucket);
  if (!signedUrl) {
    return NextResponse.json({ error: 'Sign failed' }, { status: 500 });
  }

  // The poster rides along because a VIDEO whose signed URL expired needs both back:
  // re-signing only the MP4 leaves ChatMediaThumb with no still to paint or to degrade
  // to, so a recovered video would still look broken. Additive — existing callers read
  // `signedUrl` and ignore this.
  const thumbnailUrl = row.thumbnail_path
    ? await mintSignedUrl(row.thumbnail_path, row.bucket)
    : null;

  return NextResponse.json({ signedUrl, thumbnailUrl });
}
