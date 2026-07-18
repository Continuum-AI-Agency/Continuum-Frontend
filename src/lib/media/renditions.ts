import type { AssetPreview, AssetPreviewState, AssetRenditionRole } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaAssetRow } from './schema';
import type { SignablePath } from './signed-urls';
import { mediaSchema } from './supabase-media';

export type AssetRenditionRow = {
  id: string;
  brand_id: string;
  asset_id: string;
  asset_version_id: string;
  role: AssetRenditionRole;
  state: AssetPreviewState;
  bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

const RENDITION_SELECT =
  'id, brand_id, asset_id, asset_version_id, role, state, bucket, storage_path, mime_type, width, height, duration_ms, error_code, created_at, updated_at';

export async function loadAssetRenditions(
  client: SupabaseClient,
  versionIds: readonly string[],
): Promise<AssetRenditionRow[]> {
  if (versionIds.length === 0) return [];
  const { data, error } = await mediaSchema(client)
    .from('asset_renditions')
    .select(RENDITION_SELECT)
    .in('asset_version_id', [...new Set(versionIds)]);
  if (error) throw new Error(`Library rendition hydration failed: ${error.message}`);
  return (data ?? []) as unknown as AssetRenditionRow[];
}

export function renditionSignablePaths(rows: readonly AssetRenditionRow[]): SignablePath[] {
  return rows.flatMap((row) =>
    row.state === 'ready' && row.bucket && row.storage_path
      ? [{ bucket: row.bucket, path: row.storage_path }]
      : [],
  );
}

const CARD_ROLES: AssetRenditionRole[] = ['thumbnail', 'poster', 'preview_image'];

export function buildAssetPreview(
  asset: Pick<
    MediaAssetRow,
    'kind' | 'head_version_id' | 'storage_path' | 'mime_type' | 'width' | 'height' | 'duration_ms'
  >,
  renditions: readonly AssetRenditionRow[],
  signedUrls: ReadonlyMap<string, string>,
): AssetPreview | null {
  const versionId = asset.head_version_id;
  if (!versionId) return null;
  const exact = renditions.filter((row) => row.asset_version_id === versionId);
  const ready = CARD_ROLES.flatMap((role) => exact.filter((row) => row.role === role)).find(
    (row) => row.state === 'ready',
  );
  if (ready) {
    return {
      assetVersionId: versionId,
      state: 'ready',
      kind: ready.mime_type?.startsWith('video/') ? 'video' : 'image',
      renditionId: ready.id,
      role: ready.role,
      mimeType: ready.mime_type,
      width: ready.width,
      height: ready.height,
      durationMs: ready.duration_ms,
      signedUrl: ready.storage_path ? (signedUrls.get(ready.storage_path) ?? null) : null,
      errorCode: null,
    };
  }
  const explicit = exact[0];
  if (explicit) {
    return {
      assetVersionId: versionId,
      state: explicit.state,
      kind: null,
      renditionId: explicit.id,
      role: explicit.role,
      signedUrl: null,
      errorCode: explicit.error_code,
    };
  }
  if (asset.kind === 'image' || asset.kind === 'video') {
    return {
      assetVersionId: versionId,
      state: signedUrls.has(asset.storage_path) ? 'ready' : 'failed',
      kind: asset.kind,
      role: null,
      mimeType: asset.mime_type,
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration_ms,
      signedUrl: signedUrls.get(asset.storage_path) ?? null,
    };
  }
  return {
    assetVersionId: versionId,
    state: 'unsupported',
    kind: null,
    signedUrl: null,
    errorCode: 'no_preview_rendition',
  };
}
