import { classifyLibraryFile, type MediaAsset } from '@continuum/contracts';

type Previewable = Pick<MediaAsset, 'fileName' | 'mimeType' | 'preview'>;

export function formatUsesCompanionPreview(fileName: string, mimeType?: string | null): boolean {
  const format = classifyLibraryFile({ fileName, mimeType });
  return (
    format.accepted &&
    (format.previewStrategy === 'companion' || format.previewStrategy === 'proxy_transcode')
  );
}

/** MXF / AEP / PSD — play the companion or proxy, never the original bytes. */
export function assetShowsCompanionStage(asset: Previewable): boolean {
  if (asset.preview?.state === 'ready') return false;
  return formatUsesCompanionPreview(asset.fileName, asset.mimeType);
}
