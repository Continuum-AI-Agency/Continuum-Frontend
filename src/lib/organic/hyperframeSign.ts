import { http } from '@/lib/api/http';

type HyperframeSignResponse = { signedUrl: string; expiresAt: string };

const SIGN_BUCKETS = {
  composition: 'hyperframes-compositions',
  mp4: 'hyperframes-mp4',
} as const;

// Every planner surface that renders a draft (month chip, week card, list row, preview
// panel) re-signs the SAME durable bucket+path pairs, and a signed URL is valid for
// ~1h. Without a cache that is one POST per surface per mount; with it, one POST per
// pair per hour. Concurrent callers collapse onto a single in-flight request, so two
// components mounting in the same tick still issue one.
const EXPIRY_MARGIN_MS = 5 * 60_000;
const FALLBACK_TTL_MS = 45 * 60_000;

type CachedSignature = { url: string; expiresAtMs: number };

const signedUrlCache = new Map<string, CachedSignature>();
const inFlightByKey = new Map<string, Promise<string | null>>();

function readCachedUrl(key: string): string | null {
  const cached = signedUrlCache.get(key);
  if (!cached) return null;
  if (cached.expiresAtMs <= Date.now()) {
    signedUrlCache.delete(key);
    return null;
  }
  return cached.url;
}

// The backend returns the real expiry; a response without one falls back to a window
// comfortably inside the 1h storage default.
function cacheSignedUrl(key: string, url: string, expiresAt?: string | null): void {
  const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const expiresAtMs = Number.isFinite(parsed)
    ? parsed - EXPIRY_MARGIN_MS
    : Date.now() + FALLBACK_TTL_MS;
  signedUrlCache.set(key, { url, expiresAtMs });
}

function dedupe(key: string, mint: () => Promise<string | null>): Promise<string | null> {
  const pending = inFlightByKey.get(key);
  if (pending) return pending;
  const request = mint().finally(() => {
    inFlightByKey.delete(key);
  });
  inFlightByKey.set(key, request);
  return request;
}

/** Drop every cached signature. For tests and for teardown on a brand switch. */
export function resetSignedUrlCache(): void {
  signedUrlCache.clear();
  inFlightByKey.clear();
}

/**
 * Re-sign a hyperframe asset (HTML composition or rendered MP4) on read.
 * Persisted drafts store only bucket+path; the upload-time signed URL expires in
 * 1h, so the viewer mints a fresh one here whenever it loads/plays a hyperframe.
 */
export async function signHyperframeAsset(params: {
  brandId: string;
  bucket: string;
  path: string;
}): Promise<string | null> {
  const key = `${params.brandId}:${params.bucket}:${params.path}`;
  const cached = readCachedUrl(key);
  if (cached) return cached;

  return dedupe(key, async () => {
    try {
      const res = await http.request<HyperframeSignResponse>({
        path: '/api/organic/agent/hyperframes/sign',
        method: 'POST',
        body: params,
      });
      const signedUrl = res.signedUrl ?? null;
      if (signedUrl) cacheSignedUrl(key, signedUrl, res.expiresAt);
      return signedUrl;
    } catch (err) {
      console.warn('[hyperframe-sign] failed', err);
      return null;
    }
  });
}

/**
 * Re-sign an organic generated-media asset (post/carousel image or reel cover) on
 * read. Same endpoint + flow as hyperframes — the persisted draft stores only
 * bucket+storagePath, so the calendar/list preview mints a fresh URL on load.
 */
export const signOrganicMediaAsset = signHyperframeAsset;

/**
 * Mint a fresh signed URL for a media-library asset by its registry id. Generated
 * post/carousel/reel media is registered in media.assets (source 'ai_generated');
 * the FE previews lazily from a re-signable assetId rather than holding base64.
 * Reuses the same same-origin route the Media Library realtime hook uses.
 */
export async function signMediaAsset(params: {
  brandId: string;
  assetId: string;
}): Promise<string | null> {
  const key = `asset:${params.brandId}:${params.assetId}`;
  const cached = readCachedUrl(key);
  if (cached) return cached;

  return dedupe(key, async () => {
    try {
      const res = await fetch('/api/library/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { signedUrl?: string; expiresAt?: string };
      const signedUrl = data.signedUrl ?? null;
      if (signedUrl) cacheSignedUrl(key, signedUrl, data.expiresAt);
      return signedUrl;
    } catch (err) {
      console.warn('[media-sign] failed', err);
      return null;
    }
  });
}

export const signHyperframeComposition = (brandId: string, path: string): Promise<string | null> =>
  signHyperframeAsset({ brandId, bucket: SIGN_BUCKETS.composition, path });

export const signHyperframeMp4 = (brandId: string, path: string): Promise<string | null> =>
  signHyperframeAsset({ brandId, bucket: SIGN_BUCKETS.mp4, path });
