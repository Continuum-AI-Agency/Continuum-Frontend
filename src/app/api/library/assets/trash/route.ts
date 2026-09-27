import { LIBRARY_TRASH_RETENTION_DAYS, type LibraryTrashPage } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { rowToSignedMediaAsset } from '@/lib/media/mapper';
import {
  buildAssetPreview,
  loadAssetRenditions,
  renditionSignablePaths,
} from '@/lib/media/renditions';
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from '@/lib/media/schema';
import { assetSignablePaths, mintSignedUrls } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const TRASH_LIMIT = 200;

const querySchema = z.object({ brandId: z.string().uuid() });

// A stacked asset is soft-deleted too, but its bytes already live on as a version
// of the asset it was stacked into — restore refuses it, so Trash does not offer it.
function isRestorable(row: MediaAssetRow): boolean {
  return !(row.origin_ref && 'stackedInto' in row.origin_ref);
}

// GET /api/library/assets/trash?brandId — soft-deleted assets still inside the
// retention window, newest deletion first.
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    brandId: new URL(request.url).searchParams.get('brandId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId } = parsed.data;

  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // User-scoped read: the media.assets policy is has_brand_access(brand_id) with no
  // deleted_at clause, so members already see their brand's soft-deleted rows.
  const cutoff = new Date(Date.now() - LIBRARY_TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await mediaSchema(supabase)
    .from('assets')
    .select(MEDIA_ASSET_SELECT)
    .eq('brand_id', brandId)
    .gte('deleted_at', cutoff)
    .order('deleted_at', { ascending: false })
    // ponytail: stacked rows are dropped after the cap, so a brand that stacked
    // heavily can see fewer than 200; add a SQL `origin_ref ? 'stackedInto'` filter then.
    .limit(TRASH_LIMIT);
  if (error) {
    console.error('[library/assets/trash] query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const rows = ((data ?? []) as unknown as MediaAssetRow[]).filter(isRestorable);
  const renditions = await loadAssetRenditions(
    supabase,
    rows.flatMap((row) => (row.head_version_id ? [row.head_version_id] : [])),
  );
  const signedUrlMap = await mintSignedUrls([
    ...assetSignablePaths(rows),
    ...renditionSignablePaths(renditions),
  ]);

  const body: LibraryTrashPage = {
    items: rows.map((row) => ({
      asset: rowToSignedMediaAsset(
        row,
        signedUrlMap,
        buildAssetPreview(row, renditions, signedUrlMap),
      ),
      deletedAt: row.deleted_at ?? '',
    })),
  };
  return NextResponse.json(body);
}
