// Which bytes the stage shows. The head is the asset itself; an older version
// carries its own freshly-signed URL from the versions API, plus its own mime
// type and duration. Reading those from the version — not from the asset — is
// what keeps an image v1 under a video head from rendering as a broken <video>,
// and keeps the scrubber's duration honest for the cut actually on screen.

import type { MediaAsset, MediaAssetVersion, MediaKind } from '@continuum/contracts';

export function stageKindForMimeType(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

export type StageMedia = {
  kind: MediaKind;
  src: string | null;
  durationMs: number | null;
  label: string;
  /** Identity of the bytes on stage. Remounts the player when it changes, so a
   *  draft in-point or a playhead from one cut never carries onto another. */
  key: string;
};

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
    if (headVersion) {
      return {
        kind: stageKindForMimeType(headVersion.mimeType),
        src: headVersion.signedUrl ?? asset.signedUrl ?? null,
        durationMs: headVersion.durationMs ?? asset.durationMs ?? null,
        label: asset.title ?? headVersion.fileName,
        key: `head-${headVersion.id}`,
      };
    }
    return {
      kind: asset.kind,
      src: asset.signedUrl ?? null,
      durationMs: asset.durationMs ?? null,
      label: asset.title ?? asset.fileName,
      key: `head-${asset.id}`,
    };
  }

  return {
    kind: stageKindForMimeType(viewedVersion.mimeType),
    src: viewedVersion.signedUrl ?? null,
    durationMs: viewedVersion.durationMs ?? null,
    label: viewedVersion.fileName,
    key: viewedVersion.id,
  };
}
