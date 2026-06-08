import { http } from "@/lib/api/http";

type HyperframeSignResponse = { signedUrl: string; expiresAt: string };

const SIGN_BUCKETS = {
  composition: "hyperframes-compositions",
  mp4: "hyperframes-mp4",
} as const;

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
  try {
    const res = await http.request<HyperframeSignResponse>({
      path: "/api/organic/agent/hyperframes/sign",
      method: "POST",
      body: params,
    });
    return res.signedUrl ?? null;
  } catch (err) {
    console.warn("[hyperframe-sign] failed", err);
    return null;
  }
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
  try {
    const res = await fetch("/api/library/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { signedUrl?: string };
    return data.signedUrl ?? null;
  } catch (err) {
    console.warn("[media-sign] failed", err);
    return null;
  }
}

export const signHyperframeComposition = (brandId: string, path: string): Promise<string | null> =>
  signHyperframeAsset({ brandId, bucket: SIGN_BUCKETS.composition, path });

export const signHyperframeMp4 = (brandId: string, path: string): Promise<string | null> =>
  signHyperframeAsset({ brandId, bucket: SIGN_BUCKETS.mp4, path });
