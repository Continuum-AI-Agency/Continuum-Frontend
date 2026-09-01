// The ONE way a Library surface saves an asset to disk.
//
// Airtable filed this theme four times (#253 → #288 → #299, plus #302) because each
// filing named one screen and each fix was a per-screen handler. There is exactly one
// correct sequence — mint a signed URL for the stored ORIGINAL, ask Storage for
// `Content-Disposition: attachment`, click it — so it lives here and every surface
// (grid card, detail header, file stage) calls it rather than re-deriving it.
//
// It NEVER re-renders anything: `/api/library/sign` reads `media.assets` and hands back
// a signed URL for bytes that already exist. Downloading is a read.

import { withForcedDownload } from '@/lib/media/downloadUrl';

export interface LibraryAssetDownload {
  brandId: string;
  assetId: string;
  /** The file name the browser saves as. */
  fileName: string;
  /**
   * Pin an exact immutable version. Omitted signs the asset HEAD — which is what a grid
   * card wants. A reviewer looking at v2 of a creative wants v2's bytes, not whatever
   * the head has moved to since.
   */
  versionId?: string;
}

/**
 * Mints a signed URL and starts the save. Throws with a message worth showing when the
 * sign fails; callers own how they surface it.
 */
export async function downloadLibraryAsset({
  brandId,
  assetId,
  fileName,
  versionId,
}: LibraryAssetDownload): Promise<void> {
  const response = await fetch('/api/library/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, assetId, ...(versionId ? { versionId } : {}) }),
  });
  if (!response.ok) throw new Error(`Could not mint a download link (${response.status})`);

  const { signedUrl } = (await response.json()) as { signedUrl?: string };
  if (!signedUrl) throw new Error('Could not mint a download link.');

  const anchor = document.createElement('a');
  anchor.href = withForcedDownload(signedUrl, fileName);
  // Kept alongside the forced query param: same-origin hrefs honour the attribute, and
  // it is what names the file if Storage ever stops echoing the param.
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.click();
}
