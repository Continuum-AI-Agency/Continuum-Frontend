// Anonymous share-token resolution for /share/[token]. No caller auth: the
// token IS the credential. media.share_links is deny-all RLS and the target
// buckets are private, so everything here runs on the admin client and only
// short-lived signed URLs ever reach the visitor.

import 'server-only';

import type { MediaAsset, PublicSharePayload } from '@continuum/contracts';
import { type ShareLinkRow, shareLinkStatus } from '@/lib/library/shareValidation';
import { rowToMediaAsset } from '@/lib/media/mapper';
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from '@/lib/media/schema';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { loadShareComments } from './loadShareComments';

const SIGNED_URL_TTL_SECONDS = 3600;
const COLLECTION_ASSET_CAP = 100;

export type ShareUnavailableReason = 'missing' | 'revoked' | 'expired';

export type LoadShareResult =
  | { ok: true; payload: PublicSharePayload }
  | { ok: false; reason: ShareUnavailableReason };

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Signs each asset's storage path from its own bucket (media-library,
// media-source, ...). Mirrors src/lib/media/signed-urls.ts, which is bound to
// the user-scoped server client and therefore unusable on this anonymous page.
async function signAssets(admin: AdminClient, rows: MediaAssetRow[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pathsByBucket = new Map<string, string[]>();
  for (const row of rows) {
    const existing = pathsByBucket.get(row.bucket);
    if (existing) existing.push(row.storage_path);
    else pathsByBucket.set(row.bucket, [row.storage_path]);
  }

  await Promise.all(
    Array.from(pathsByBucket.entries()).map(async ([bucket, paths]) => {
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (error || !data) {
        console.error('[share] batch sign failed', { bucket, error });
        return;
      }
      for (const item of data) {
        if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
      }
    }),
  );

  return map;
}

async function loadAssetRows(
  admin: AdminClient,
  link: ShareLinkRow,
): Promise<{ rows: MediaAssetRow[]; collectionName: string | null } | null> {
  const media = mediaSchema(admin);

  if (link.scope === 'asset') {
    const { data } = await media
      .from('assets')
      .select(MEDIA_ASSET_SELECT)
      .eq('id', link.asset_id ?? '')
      .eq('brand_id', link.brand_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return null;
    return { rows: [data as unknown as MediaAssetRow], collectionName: null };
  }

  const { data: collection } = await media
    .from('collections')
    .select('id, name')
    .eq('id', link.collection_id ?? '')
    .eq('brand_id', link.brand_id)
    .maybeSingle();
  if (!collection) return null;

  const { data: items } = await media
    .from('collection_items')
    .select('asset_id, position')
    .eq('collection_id', link.collection_id ?? '')
    .order('position', { ascending: true })
    .order('added_at', { ascending: true })
    .limit(COLLECTION_ASSET_CAP);
  const assetIds = ((items as { asset_id: string }[] | null) ?? []).map((i) => i.asset_id);

  let rows: MediaAssetRow[] = [];
  if (assetIds.length > 0) {
    const { data: assets } = await media
      .from('assets')
      .select(MEDIA_ASSET_SELECT)
      .in('id', assetIds)
      .eq('brand_id', link.brand_id)
      .is('deleted_at', null);
    const byId = new Map(
      ((assets as unknown as MediaAssetRow[] | null) ?? []).map((row) => [row.id, row]),
    );
    rows = assetIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  return { rows, collectionName: (collection as { name: string }).name };
}

export async function loadSharePayload(token: string): Promise<LoadShareResult> {
  if (!token || token.length > 128) return { ok: false, reason: 'missing' };

  const admin = createSupabaseAdminClient();
  const { data: linkRow } = await mediaSchema(admin)
    .from('share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!linkRow) return { ok: false, reason: 'missing' };

  const link = linkRow as ShareLinkRow;
  const status = shareLinkStatus({ revokedAt: link.revoked_at, expiresAt: link.expires_at });
  if (!status.active) return { ok: false, reason: status.reason };

  const loaded = await loadAssetRows(admin, link);
  if (!loaded) return { ok: false, reason: 'missing' };

  // Signing and the comment read are independent reads over the same rows.
  const [signedByPath, comments] = await Promise.all([
    signAssets(admin, loaded.rows),
    loadShareComments(admin, {
      brandId: link.brand_id,
      assetIds: loaded.rows.map((row) => row.id),
    }),
  ]);

  const assets: MediaAsset[] = loaded.rows.map((row) =>
    rowToMediaAsset(row, signedByPath.get(row.storage_path) ?? null),
  );

  return {
    ok: true,
    payload: {
      scope: link.scope,
      brandName: null,
      collectionName: loaded.collectionName,
      assets,
      comments,
    },
  };
}
