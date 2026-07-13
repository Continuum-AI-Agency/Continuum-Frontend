import {
  versionSignUploadRequestSchema,
  versionSignUploadResponseSchema,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { buildVersionStoragePath, nextVersionNumber } from '@/lib/library/versionMapping';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Mints a signed upload URL for the next version of an asset's file at
// <brandId>/<assetId>/v<versionNumber>/<sanitizedName> in the asset's CURRENT
// bucket. The browser PUTs the bytes straight to storage (no proxy through
// Next), then calls POST /api/library/versions to register the row.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = versionSignUploadRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId, fileName } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  const { data: asset, error: assetError } = await mediaSchema(admin)
    .from('assets')
    .select('id, bucket')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  if (assetError) {
    console.error('[library/versions/sign] asset lookup failed', assetError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  const head = asset as { id: string; bucket: string };

  const { data: maxRow, error: maxError } = await mediaSchema(admin)
    .from('asset_versions')
    .select('version_number')
    .eq('asset_id', assetId)
    .eq('brand_id', brandId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) {
    console.error('[library/versions/sign] version lookup failed', maxError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const versionNumber = nextVersionNumber(
    (maxRow as { version_number: number } | null)?.version_number ?? null,
  );
  const path = buildVersionStoragePath({ brandId, assetId, versionNumber, fileName });

  const { data: signed, error: signError } = await admin.storage
    .from(head.bucket)
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    console.error('[library/versions/sign] createSignedUploadUrl failed', {
      bucket: head.bucket,
      path,
      error: signError,
    });
    return NextResponse.json({ error: 'Sign failed' }, { status: 500 });
  }

  return NextResponse.json(
    versionSignUploadResponseSchema.parse({
      bucket: head.bucket,
      path: signed.path,
      token: signed.token,
      versionNumber,
    }),
  );
}
