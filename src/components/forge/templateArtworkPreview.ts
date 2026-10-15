import type { MediaAssetVersion, TemplateAuthoringCommand } from '@continuum/contracts';

export type PinnedArtworkAssetRef = Extract<TemplateAuthoringCommand, { type: 'artwork.create' }>['assetRef'];

export function resolvePinnedArtworkVersion(
  versions: readonly MediaAssetVersion[],
  assetRef: PinnedArtworkAssetRef,
): MediaAssetVersion {
  const version = versions.find((item) => item.id === assetRef.versionId && item.assetId === assetRef.assetId);
  if (!version || version.checksum?.toLowerCase() !== assetRef.sha256.toLowerCase()) {
    throw new Error('The selected image version or checksum is no longer available. Choose it again from the Library.');
  }
  if (version.mimeType !== 'image/png' && version.mimeType !== 'image/jpeg') {
    throw new Error('Forge artwork supports PNG and JPEG images only.');
  }
  if (!version.signedUrl) {
    throw new Error('A private preview for this exact image version is unavailable. Retry from the Library.');
  }
  return version;
}
