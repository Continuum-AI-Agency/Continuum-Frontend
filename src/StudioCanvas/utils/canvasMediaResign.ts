import type { StudioNode } from '../types';

// A canvas node carries durable storage pointers (bucket + path) for its media
// independent of the expiring signed URL. After a Realtime sync merge or catch-up
// the node arrives from a persist-stripped row: the durable pointers survive but
// the signed-URL/media field has been removed. These helpers detect that state so
// the sync layer can re-sign the media instead of rendering a blank node.

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const nodeData = (node: StudioNode): Record<string, unknown> =>
  (node?.data ?? {}) as Record<string, unknown>;

function decodeJwtExpSeconds(token: string): number | null {
  const segments = token.split('.');
  if (segments.length < 2) return null;
  const payload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
  try {
    const json =
      typeof atob === 'function'
        ? atob(payload)
        : Buffer.from(payload, 'base64').toString('binary');
    const parsed = JSON.parse(json) as { exp?: unknown };
    return typeof parsed.exp === 'number' && Number.isFinite(parsed.exp) ? parsed.exp : null;
  } catch {
    return null;
  }
}

// True when a Supabase signed URL's `token` JWT has an `exp` in the past. A small
// skew refreshes URLs about to lapse. Unknown shapes (no token, unparseable) are
// treated as NOT expired so this never triggers a needless re-sign storm.
export function isSignedUrlExpired(url: string, skewSeconds = 30): boolean {
  try {
    const token = new URL(url).searchParams.get('token');
    if (!token) return false;
    const exp = decodeJwtExpSeconds(token);
    if (exp === null) return false;
    return exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return false;
  }
}

// True when a node has a durable pointer (generated output or uploaded reference)
// but its corresponding signed URL is missing OR already expired. Expired-URL
// detection matters for "Ready" thumbnails: the URL is present, so the old
// missing-only check skipped them and they rendered as a broken image forever.
export function nodeNeedsResign(node: StudioNode): boolean {
  const data = nodeData(node);

  const imageDurable =
    isNonEmptyString(data.generatedImageStoragePath) && isNonEmptyString(data.generatedImageBucket);
  const imageUrl = data.generatedImageUrl;
  if (imageDurable && (!isNonEmptyString(imageUrl) || isSignedUrlExpired(imageUrl))) return true;

  const videoDurable =
    isNonEmptyString(data.generatedVideoStoragePath) && isNonEmptyString(data.generatedVideoBucket);
  const videoUrl = data.generatedVideoUrl;
  if (videoDurable && (!isNonEmptyString(videoUrl) || isSignedUrlExpired(videoUrl))) return true;

  const referenceDurable = isNonEmptyString(data.sourcePath) && isNonEmptyString(data.bucket);
  const sourceUrl = data.sourceUrl;
  if (referenceDurable && (!isNonEmptyString(sourceUrl) || isSignedUrlExpired(sourceUrl)))
    return true;

  return false;
}

// Stable key for the durable pointer driving a re-sign, used to avoid re-signing
// the same media repeatedly across successive catch-ups (storm control). Returns
// null when the node has no durable pointer.
export function resignKey(node: StudioNode): string | null {
  const data = nodeData(node);

  if (
    isNonEmptyString(data.generatedImageStoragePath) &&
    isNonEmptyString(data.generatedImageBucket)
  ) {
    return `img:${data.generatedImageBucket}\n${data.generatedImageStoragePath}`;
  }
  if (
    isNonEmptyString(data.generatedVideoStoragePath) &&
    isNonEmptyString(data.generatedVideoBucket)
  ) {
    return `vid:${data.generatedVideoBucket}\n${data.generatedVideoStoragePath}`;
  }
  if (isNonEmptyString(data.sourcePath) && isNonEmptyString(data.bucket)) {
    return `ref:${data.bucket}\n${data.sourcePath}`;
  }
  return null;
}
