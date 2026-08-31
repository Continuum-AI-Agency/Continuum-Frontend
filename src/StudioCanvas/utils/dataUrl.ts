export type ParsedDataUrl = {
  mimeType: string;
  base64: string;
};

function normalizeBase64Payload(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

export function parseDataUrl(value?: string | null): ParsedDataUrl | null {
  if (!value || typeof value !== 'string') return null;
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(value.trim());
  if (!match) return null;
  const mimeType = match[1] ?? 'application/octet-stream';
  const base64 = normalizeBase64Payload(match[2] ?? '');
  return { mimeType, base64 };
}

export function buildDataUrl(mimeType: string, base64: string): string {
  const safeMime = mimeType || 'application/octet-stream';
  return `data:${safeMime};base64,${normalizeBase64Payload(base64)}`;
}

/** Bytes as base64, for the endpoints whose schema takes data rather than a URL. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
