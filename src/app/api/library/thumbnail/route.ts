import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ALLOWED_THUMBNAIL_MIME_TYPES,
  buildThumbnailStoragePath,
  isOwnedThumbnailPath,
} from '@/lib/library/thumbnailStoragePath';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// A decoded video frame at 640px wide is tens of KB. Anything approaching a
// megabyte is not a poster, so it is refused rather than stored.
const MAX_POSTER_BYTES = 1_500_000;

const fieldsSchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
});

// POST /api/library/thumbnail — stores the browser-generated poster for a video
// asset and persists media.assets.thumbnail_path.
//
// The bytes come as multipart (a poster is far below the serverless body cap, so
// unlike the asset upload itself there is no reason to bounce the client off to
// storage first). The storage path is DERIVED here from the caller-verified
// brandId/assetId — the client never names a path — and the poster lands in the
// asset's own bucket.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 422 });
  }

  const parsed = fieldsSchema.safeParse({
    brandId: form.get('brandId'),
    assetId: form.get('assetId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId } = parsed.data;

  const poster = form.get('poster');
  if (!(poster instanceof Blob)) {
    return NextResponse.json({ error: 'Missing poster file' }, { status: 422 });
  }
  if (!ALLOWED_THUMBNAIL_MIME_TYPES.includes(poster.type)) {
    return NextResponse.json({ error: `Unsupported poster type: ${poster.type}` }, { status: 415 });
  }
  if (poster.size === 0 || poster.size > MAX_POSTER_BYTES) {
    return NextResponse.json({ error: 'Poster size out of range' }, { status: 413 });
  }

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  const { data: asset, error: assetError } = await mediaSchema(admin)
    .from('assets')
    .select('id, bucket, kind, thumbnail_path')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  if (assetError) {
    console.error('[library/thumbnail] asset lookup failed', assetError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  const head = asset as {
    id: string;
    bucket: string;
    kind: string;
    thumbnail_path: string | null;
  };
  if (head.kind !== 'video') {
    return NextResponse.json({ error: 'Only video assets carry a poster' }, { status: 409 });
  }
  if (head.thumbnail_path) {
    return NextResponse.json({ assetId, bucket: head.bucket, thumbnailPath: head.thumbnail_path });
  }

  const thumbnailPath = buildThumbnailStoragePath({ brandId, assetId, mimeType: poster.type });
  if (!thumbnailPath || !isOwnedThumbnailPath(thumbnailPath, { brandId, assetId })) {
    return NextResponse.json({ error: 'Invalid poster path' }, { status: 422 });
  }

  const { error: uploadError } = await admin.storage
    .from(head.bucket)
    .upload(thumbnailPath, poster, { contentType: poster.type, upsert: true });
  if (uploadError) {
    console.error('[library/thumbnail] poster upload failed', {
      bucket: head.bucket,
      thumbnailPath,
      error: uploadError,
    });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { error: updateError } = await mediaSchema(admin)
    .from('assets')
    .update({ thumbnail_path: thumbnailPath })
    .eq('id', assetId)
    .eq('brand_id', brandId);
  if (updateError) {
    console.error('[library/thumbnail] thumbnail_path update failed', updateError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  return NextResponse.json({ assetId, bucket: head.bucket, thumbnailPath });
}
