import { assetUsageSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { rowToMediaAsset } from '@/lib/media/mapper';
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from '@/lib/media/schema';
import { mintSignedUrls } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const MAX_DERIVED = 50;

// media_get_asset_usage is SECURITY DEFINER, asserts brand membership itself
// (media._assert_brand) and grants EXECUTE to `authenticated`, so it runs on the
// user-scoped client. It post-dates the generated Database type, so the rpc()
// surface is cast once, here, at the boundary.
type JsonbRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

// The Library end of the round trip: every asset generated FROM this one. The RPC
// owns the match — it honours both the legacy scalar `origin_ref.sourceAssetId` and
// the `origin_ref.sourceAssetIds` array a multi-input generation writes — so the
// lineage rule lives in exactly one place instead of drifting between this route
// and the usage panel. We hydrate the matched ids into full assets here because the
// caller renders thumbnails and needs signed URLs.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const brandId = url.searchParams.get('brandId');
  const assetId = url.searchParams.get('assetId');
  if (!brandId || !assetId) {
    return NextResponse.json({ error: 'brandId and assetId are required' }, { status: 422 });
  }

  const client = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const usageRpc = client as unknown as JsonbRpcClient;
  const { data: usageData, error: usageError } = await usageRpc.rpc('media_get_asset_usage', {
    p_brand_id: brandId,
    p_asset_id: assetId,
  });
  if (usageError) {
    console.warn('[library/derived] usage rpc failed', { assetId, error: usageError.message });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const usage = assetUsageSchema.safeParse(usageData);
  if (!usage.success) {
    console.warn('[library/derived] unexpected usage shape', { assetId });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const derivedIds = usage.data.derivedAssets.slice(0, MAX_DERIVED).map((entry) => entry.assetId);
  if (derivedIds.length === 0) {
    return NextResponse.json({ assets: [] });
  }

  const { data, error } = await mediaSchema(client)
    .from('assets')
    .select(MEDIA_ASSET_SELECT)
    .eq('brand_id', brandId)
    .in('id', derivedIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[library/derived] query failed', { assetId, error: error.message });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as MediaAssetRow[];
  const signedUrls = await mintSignedUrls(
    rows.map((row) => ({ path: row.storage_path, bucket: row.bucket })),
  );

  return NextResponse.json({
    assets: rows.map((row) => rowToMediaAsset(row, signedUrls.get(row.storage_path) ?? null)),
  });
}
