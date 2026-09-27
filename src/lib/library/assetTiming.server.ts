import 'server-only';

// How one version of a video asset counts time: its measured frame rate and the
// file's own start timecode. Both are read from the bytes on every call — nothing
// stores either, and a guessed rate or a missing start timecode puts markers on
// the wrong frames. Read on the caller's RLS-scoped client.

import type { AssetTiming } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { timecodeForFrame } from '@/lib/library/commentExport';
import { measureFrameRate } from '@/lib/library/frameRate';
import { readStartTimecode } from '@/lib/library/startTimecode';
import { mintSignedUrl } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';

type MediaFile = {
  bucket: string;
  storage_path: string;
  file_name: string | null;
  duration_ms: number | null;
};

export type AssetTimingResult =
  | { ok: true; timing: AssetTiming; headVersionId: string | null }
  | { ok: false; status: number; error: string };

export async function loadAssetTiming(
  supabase: SupabaseClient,
  query: { brandId: string; assetId: string; versionId?: string },
): Promise<AssetTimingResult> {
  const media = mediaSchema(supabase);
  const { data: assetData } = await media
    .from('assets')
    .select('title, file_name, kind, bucket, storage_path, duration_ms, head_version_id')
    .eq('id', query.assetId)
    .eq('brand_id', query.brandId)
    .is('deleted_at', null)
    .maybeSingle();
  const asset = assetData as
    | (MediaFile & { title: string | null; kind: string; head_version_id: string | null })
    | null;
  if (!asset) return { ok: false, status: 404, error: 'Asset not found' };
  if (asset.kind !== 'video') {
    return { ok: false, status: 422, error: 'Timecode needs a video asset' };
  }

  let file: MediaFile = asset;
  if (query.versionId && query.versionId !== asset.head_version_id) {
    const { data: version } = await media
      .from('asset_versions')
      .select('bucket, storage_path, file_name, duration_ms')
      .eq('id', query.versionId)
      .eq('asset_id', query.assetId)
      .eq('brand_id', query.brandId)
      .maybeSingle();
    if (!version) return { ok: false, status: 404, error: 'Version not found' };
    file = version as MediaFile;
  }

  const signedUrl = await mintSignedUrl(file.storage_path, file.bucket);
  const rate = signedUrl ? await measureFrameRate(signedUrl).catch(() => null) : null;
  if (!signedUrl || !rate) {
    return { ok: false, status: 422, error: 'Could not read the video frame rate' };
  }
  const source = await readStartTimecode(signedUrl).catch((error: unknown) => {
    console.warn('[library/assetTiming] start timecode unreadable', error);
    return null;
  });
  const startFrame = source?.startFrame ?? 0;
  const dropFrame = source?.dropFrame ?? false;
  return {
    ok: true,
    headVersionId: asset.head_version_id,
    timing: {
      assetId: query.assetId,
      versionId: query.versionId ?? asset.head_version_id,
      assetName: asset.title || asset.file_name || 'Asset',
      fileName: file.file_name || asset.file_name || 'clip',
      frameRate: rate,
      startFrame,
      dropFrame,
      startTimecode: timecodeForFrame(startFrame, rate, dropFrame),
      durationMs: file.duration_ms ?? 0,
    },
  };
}
