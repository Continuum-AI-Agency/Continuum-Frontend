import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mintSignedUrl } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const bodySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
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
  const { brandId, assetId } = parsed.data;

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
