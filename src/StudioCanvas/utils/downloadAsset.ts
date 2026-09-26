import {
  CANVAS_MEDIA_BUCKETS,
  CANVAS_MEDIA_SIGN_ROUTE,
  type CanvasMediaCoordinate,
  type CanvasMediaSignResponse,
} from '@continuum/contracts';
import { toast } from '@/components/ui/toast-imperative';
import { request } from '@/lib/api/http';
import { withForcedDownload } from '@/lib/media/downloadUrl';
import { isSignedUrlExpired } from './canvasMediaResign';
import { parseDataUrl } from './dataUrl';

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/mxf': 'mxf',
};

const getExtensionFromMime = (mimeType?: string | null) => {
  if (!mimeType) return null;
  return MIME_EXTENSION_MAP[mimeType.toLowerCase()] ?? null;
};

const getExtensionFromUrl = (url: string) => {
  try {
    const parsed = new URL(url, window.location.href);
    const match = parsed.pathname.match(/\.([a-z0-9]+)$/i);
    return match?.[1] ?? null;
  } catch {
    const match = url.match(/\.([a-z0-9]+)(?:$|[?#])/i);
    return match?.[1] ?? null;
  }
};

const buildDownloadName = (baseName: string, extension?: string | null) => {
  if (!extension) return baseName;
  if (baseName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) return baseName;
  return `${baseName}.${extension}`;
};

const SIGNED_STORAGE_PATH = /\/storage\/v1\/(object|render\/image)\/sign\/([^/]+)\/(.+)$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

type SignOriginal = (brandProfileId: string, item: CanvasMediaCoordinate) => Promise<string | null>;

const signOriginal: SignOriginal = async (brandProfileId, item) => {
  // No `preview` flag: a download wants the stored original, not the display derivative.
  const response = await request<CanvasMediaSignResponse>({
    path: CANVAS_MEDIA_SIGN_ROUTE,
    method: 'POST',
    body: { brandProfileId, items: [item] },
  });
  return response.items[0]?.signedUrl ?? null;
};

const isCanvasBucket = (bucket: string): bucket is CanvasMediaCoordinate['bucket'] =>
  (CANVAS_MEDIA_BUCKETS as readonly string[]).includes(bucket);

/**
 * The link a download should follow for `url`, or null when no working one exists.
 *
 * A canvas holds signed Storage URLs that die an hour after signing, and after a reload
 * they point at the 480px display derivative rather than the original. So a Storage URL
 * is re-signed to the original at click time. Storage paths are brand-prefixed, and the
 * sign route re-checks that the path belongs to that brand. Anything that is not a signed
 * Storage URL (data:, blob:, another host) is followed as is.
 */
export async function resolveDownloadUrl(
  url: string,
  sign: SignOriginal = signOriginal,
): Promise<string | null> {
  let match: RegExpMatchArray | null;
  try {
    match = new URL(url).pathname.match(SIGNED_STORAGE_PATH);
  } catch {
    return url;
  }
  if (!match) return url;

  const [, route, bucket = '', encodedPath = ''] = match;
  const path = decodeURIComponent(encodedPath);
  const brandProfileId = path.split('/')[0] ?? '';
  if (isCanvasBucket(bucket) && UUID.test(brandProfileId)) {
    try {
      const fresh = await sign(brandProfileId, { bucket, path });
      if (fresh) return fresh;
    } catch (err) {
      console.warn('[studio] download: could not re-sign, falling back to the stored link', err);
    }
  }
  // Following a dead link navigates the canvas tab onto Storage's JSON error page.
  return route === 'object' && !isSignedUrlExpired(url) ? url : null;
}

const clickDownload = (url: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = withForcedDownload(url, fileName);
  link.download = fileName;
  link.rel = 'noopener';
  link.click();
};

export const downloadAsset = (options: {
  data?: string | Blob | null;
  baseName: string;
  fallbackExtension?: string;
}) => {
  const { data, baseName, fallbackExtension } = options;
  if (!data) return false;

  let url: string | null = null;
  let extension: string | null = null;
  let revokeUrl = false;

  if (data instanceof Blob) {
    url = URL.createObjectURL(data);
    extension = getExtensionFromMime(data.type) ?? fallbackExtension ?? null;
    revokeUrl = true;
  } else if (typeof data === 'string') {
    const parsed = parseDataUrl(data);
    if (parsed) {
      url = data;
      extension = getExtensionFromMime(parsed.mimeType) ?? fallbackExtension ?? null;
    } else {
      url = data;
      extension = getExtensionFromUrl(data) ?? fallbackExtension ?? null;
    }
  }

  if (!url) return false;

  const fileName = buildDownloadName(baseName, extension);
  if (!revokeUrl && !parseDataUrl(url)) {
    void resolveDownloadUrl(url).then((resolved) => {
      if (resolved) {
        clickDownload(resolved, fileName);
        return;
      }
      toast.error('Download failed', {
        description: 'The file link could not be refreshed. Try again in a moment.',
      });
    });
    return true;
  }
  clickDownload(url, fileName);

  if (revokeUrl) {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return true;
};
