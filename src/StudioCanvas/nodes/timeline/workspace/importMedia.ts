import type { MediaAsset, VideoEditorPoolAsset } from '@continuum/contracts';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { probeAudioDuration, probeVideoDuration } from '../mediaProbe';
import { rememberPreviewUrl } from '../useClipPreviewUrls';

export const IMPORTABLE_MEDIA = 'video/*,audio/*,image/*,.mov,.mp4,.webm,.m4a,.mp3,.wav';

const kindOf = (file: File): VideoEditorPoolAsset['kind'] | null => {
  const type = file.type || '';
  if (type.startsWith('video/') || /\.(mov|mp4|webm|m4v)$/i.test(file.name)) return 'video';
  if (type.startsWith('audio/') || /\.(m4a|mp3|wav|aac|ogg)$/i.test(file.name)) return 'audio';
  if (type.startsWith('image/')) return 'image';
  return null;
};

/** The file's own length, read locally before the upload finishes — no round trip. */
async function probeFile(
  file: File,
  kind: VideoEditorPoolAsset['kind'],
): Promise<number | undefined> {
  if (kind === 'image') return undefined;
  const url = URL.createObjectURL(file);
  try {
    const seconds = await (kind === 'audio' ? probeAudioDuration(url) : probeVideoDuration(url));
    return seconds > 0 ? seconds : undefined;
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A dropped or recorded file becomes a Library asset through the Library's own upload
 * path, so it is a real, versioned asset the export and the agent can read — never a
 * blob only this tab knows about.
 */
export async function importMediaFile(brandId: string, file: File): Promise<VideoEditorPoolAsset> {
  const kind = kindOf(file);
  if (!kind) throw new Error(`${file.name} is not a video, audio or image file.`);
  const [durationSec, uploaded] = await Promise.all([
    probeFile(file, kind),
    uploadMediaAsset({ file, brandId }),
  ]);
  rememberPreviewUrl(uploaded.assetId, uploaded.versionId, uploaded.signedUrl);
  return {
    assetId: uploaded.assetId,
    versionId: uploaded.versionId,
    kind,
    title: file.name,
    ...(durationSec ? { durationSec } : {}),
    origin: 'project',
  };
}

/** A Library pick as a placeable asset (image, video or audio). */
export function poolAssetFromLibrary(asset: MediaAsset): VideoEditorPoolAsset | null {
  const kind =
    asset.kind === 'video' || asset.kind === 'image'
      ? asset.kind
      : asset.mimeType?.startsWith('audio/')
        ? 'audio'
        : null;
  if (!kind || !asset.headVersionId) return null;
  if (asset.signedUrl) rememberPreviewUrl(asset.id, asset.headVersionId, asset.signedUrl);
  return {
    assetId: asset.id,
    versionId: asset.headVersionId,
    kind,
    title: asset.title?.trim() || asset.fileName,
    ...(asset.durationMs ? { durationSec: asset.durationMs / 1_000 } : {}),
    ...(asset.width ? { width: asset.width } : {}),
    ...(asset.height ? { height: asset.height } : {}),
    ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
    origin: 'project',
  };
}
