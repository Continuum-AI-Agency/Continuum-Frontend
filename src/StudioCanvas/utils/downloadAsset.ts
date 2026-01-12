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

  const link = document.createElement('a');
  link.href = url;
  link.download = buildDownloadName(baseName, extension);
  link.rel = 'noopener';
  link.target = '_blank';
  link.click();

  if (revokeUrl) {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return true;
};
