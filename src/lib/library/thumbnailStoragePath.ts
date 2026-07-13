// Where an asset's poster lives, and the guard that says a given path is really
// that asset's poster. Pure so both the route and its tests read the same rule.
//
// Posters are siblings of the asset inside the asset's OWN bucket, under the
// brand-first folder every library path uses:
//   <brandId>/<assetId>/thumb.webp
// The route derives this path itself and never accepts one from the client, so
// the guard below is a belt-and-braces assertion, not the only line of defense.

export const THUMBNAIL_BASENAME = 'thumb';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

export const ALLOWED_THUMBNAIL_MIME_TYPES = Object.keys(EXTENSION_BY_MIME);

export function thumbnailExtensionFor(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType] ?? null;
}

export function buildThumbnailStoragePath(params: {
  brandId: string;
  assetId: string;
  mimeType: string;
}): string | null {
  const extension = thumbnailExtensionFor(params.mimeType);
  if (!extension) return null;
  return `${params.brandId}/${params.assetId}/${THUMBNAIL_BASENAME}.${extension}`;
}

// True only for a path inside this asset's own <brandId>/<assetId>/ folder whose
// leaf is the poster file — no traversal, no sibling-asset writes, no overwriting
// the asset's own bytes.
export function isOwnedThumbnailPath(
  path: string,
  params: { brandId: string; assetId: string },
): boolean {
  if (path.includes('..') || path.includes('//') || path.startsWith('/')) return false;
  const prefix = `${params.brandId}/${params.assetId}/`;
  if (!path.startsWith(prefix)) return false;
  const leaf = path.slice(prefix.length);
  return ALLOWED_THUMBNAIL_MIME_TYPES.some(
    (mime) => leaf === `${THUMBNAIL_BASENAME}.${thumbnailExtensionFor(mime)}`,
  );
}
