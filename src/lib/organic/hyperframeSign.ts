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

export const signHyperframeComposition = (brandId: string, path: string): Promise<string | null> =>
  signHyperframeAsset({ brandId, bucket: SIGN_BUCKETS.composition, path });

export const signHyperframeMp4 = (brandId: string, path: string): Promise<string | null> =>
  signHyperframeAsset({ brandId, bucket: SIGN_BUCKETS.mp4, path });
