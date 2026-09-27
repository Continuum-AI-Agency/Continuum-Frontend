// Which bytes the stage shows. The head is the asset itself; an older version
// carries its own freshly-signed URL from the versions API, plus its own mime
// type and duration. Reading those from the version — not from the asset — is
// what keeps an image v1 under a video head from rendering as a broken <video>,
// and keeps the scrubber's duration honest for the cut actually on screen.

import type {
  AssetPreview,
  AssetRenditionRole,
  MediaAsset,
  MediaAssetVersion,
} from '@continuum/contracts';
import {
  assetShowsCompanionStage,
  formatUsesCompanionPreview,
} from '@/lib/library/previewPlayable';

/** What the stage renders. `pdf` is a `file` asset the browser can open natively. */
export type StageKind = 'image' | 'video' | 'audio' | 'pdf' | 'file';

export function stageKindForMimeType(mimeType: string): StageKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'file';
}

/** Which bytes play: the uploaded original, or one of its renditions. */
export type StageSourceRole = AssetRenditionRole | 'original';

export type StageMedia = {
  kind: StageKind;
  src: string | null;
  durationMs: number | null;
  label: string;
  /** Identity of the bytes on stage. Remounts the player when it changes, so a
   *  draft in-point or a playhead from one cut never carries onto another. */
  key: string;
  sourceRole: StageSourceRole;
};

type StageBytes = {
  fileName: string;
  mimeType: string;
  signedUrl: string | null;
  durationMs: number | null;
  preview: AssetPreview | null;
};

function readyPreview(preview: AssetPreview | null) {
  return preview?.state === 'ready' && preview.signedUrl && preview.kind
    ? { ...preview, signedUrl: preview.signedUrl, kind: preview.kind }
    : null;
}

// The order the stage picks bytes in, for the head and for an older version alike:
//   1. a ready `preview_video` — the 720p H.264 proxy streams where a 4K ProRes
//      original stalls, and it is the only playable source for MXF;
//   2. the original, when the browser renders it natively — never a poster or
//      thumbnail in its place, which would turn a video into a still;
//   3. any other ready preview — the companion PNG/MP4 of a PSD or AEP.
// Null means "no ready preview/playable original": the caller decides the fallback.
//
// HEIC and TIFF originals paint only in Safari; the WebP made at upload paints everywhere.
const ONLY_SAFARI_PAINTS = new Set(['image/heic', 'image/heif', 'image/tiff']);

function pickSource(bytes: StageBytes, label: string, keyPrefix: string): StageMedia | null {
  const preview = readyPreview(bytes.preview);
  if (preview?.role === 'preview_video') {
    return {
      kind: 'video',
      src: preview.signedUrl,
      durationMs: preview.durationMs ?? bytes.durationMs,
      label,
      key: `${keyPrefix}-preview-${preview.renditionId ?? preview.assetVersionId}`,
      sourceRole: 'preview_video',
    };
  }
  const originalKind = stageKindForMimeType(bytes.mimeType);
  if (
    bytes.signedUrl &&
    originalKind !== 'file' &&
    !formatUsesCompanionPreview(bytes.fileName, bytes.mimeType) &&
    !(preview && ONLY_SAFARI_PAINTS.has(bytes.mimeType))
  ) {
    return null;
  }
  if (preview) {
    return {
      kind: preview.kind,
      src: preview.signedUrl,
      durationMs: preview.durationMs ?? null,
      label,
      key: `${keyPrefix}-preview-${preview.renditionId ?? preview.assetVersionId}`,
      sourceRole: preview.role ?? 'original',
    };
  }
  return null;
}

// `viewedVersion` is an explicit older selection; null means the head.
//
// The head prefers its VERSION row over the asset prop when one exists. The
// asset reaches this modal as a snapshot held in the grid's state, so it still
// describes the file as it was when the card was clicked — after uploading v2
// the stage would keep painting v1's bytes until the modal was reopened, which
// is precisely the lie this whole feature exists to prevent. The version list is
// re-fetched on every mutation and carries a freshly-signed URL, so it is the
// truthful source. Keying on the version id also remounts the player, so a
// playhead never survives the bytes changing underneath it.
export function resolveStageMedia(params: {
  asset: MediaAsset;
  viewedVersion: MediaAssetVersion | null;
  headVersion?: MediaAssetVersion | null;
}): StageMedia {
  const { asset, viewedVersion, headVersion } = params;

  if (viewedVersion === null) {
    const label = asset.title ?? headVersion?.fileName ?? asset.fileName;
    const picked = pickSource(
      {
        fileName: headVersion?.fileName ?? asset.fileName,
        mimeType: headVersion?.mimeType ?? asset.mimeType,
        signedUrl: headVersion?.signedUrl ?? asset.signedUrl ?? null,
        durationMs: headVersion?.durationMs ?? asset.durationMs ?? null,
        preview: headVersion?.preview ?? asset.preview ?? null,
      },
      label,
      'head',
    );
    if (picked) return picked;
    // An MKV/AVI/WMV/MXF original is not browser-playable: until its proxy is ready the
    // stage waits on it (the companion stage) instead of handing the raw file to <video>.
    if (headVersion && formatUsesCompanionPreview(headVersion.fileName, headVersion.mimeType)) {
      return {
        kind: 'file',
        src: null,
        durationMs: null,
        label,
        key: `head-companion-${headVersion.id}`,
        sourceRole: 'original',
      };
    }
    if (headVersion) {
      return {
        kind: stageKindForMimeType(headVersion.mimeType),
        src: headVersion.signedUrl ?? asset.signedUrl ?? null,
        durationMs: headVersion.durationMs ?? asset.durationMs ?? null,
        label,
        key: `head-${headVersion.id}`,
        sourceRole: 'original',
      };
    }
    if (assetShowsCompanionStage(asset)) {
      return {
        kind: 'file',
        src: null,
        durationMs: null,
        label,
        key: `head-companion-${asset.id}`,
        sourceRole: 'original',
      };
    }
    return {
      kind: stageKindForMimeType(asset.mimeType) === 'pdf' ? 'pdf' : asset.kind,
      src: asset.signedUrl ?? null,
      durationMs: asset.durationMs ?? null,
      label,
      // Same key the head branch uses once the version list loads, so its arrival
      // never remounts the stage (and drops an in-progress annotation) for the same bytes.
      key: `head-${asset.headVersionId ?? asset.id}`,
      sourceRole: 'original',
    };
  }

  const picked = pickSource(
    {
      fileName: viewedVersion.fileName,
      mimeType: viewedVersion.mimeType,
      signedUrl: viewedVersion.signedUrl ?? null,
      durationMs: viewedVersion.durationMs ?? null,
      preview: viewedVersion.preview ?? null,
    },
    viewedVersion.fileName,
    viewedVersion.id,
  );
  if (picked) return picked;
  if (formatUsesCompanionPreview(viewedVersion.fileName, viewedVersion.mimeType)) {
    return {
      kind: 'file',
      src: null,
      durationMs: null,
      label: viewedVersion.fileName,
      key: `${viewedVersion.id}-companion`,
      sourceRole: 'original',
    };
  }
  return {
    kind: stageKindForMimeType(viewedVersion.mimeType),
    src: viewedVersion.signedUrl ?? null,
    durationMs: viewedVersion.durationMs ?? null,
    label: viewedVersion.fileName,
    key: viewedVersion.id,
    sourceRole: 'original',
  };
}
