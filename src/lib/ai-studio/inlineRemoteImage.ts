// Converts a remote image URL into an inline base64 data URL via the
// same-origin /api/ai-studio/instagram/inline-media route. The server fetch
// sidesteps the browser CORS wall on Instagram/Facebook CDN URLs, which cannot
// be read client-side and would otherwise never reach the generation model.

const INLINE_MEDIA_ENDPOINT = "/api/ai-studio/instagram/inline-media";

export interface InlinedImage {
  dataUrl: string;
  mimeType: string;
}

export async function inlineRemoteImage(url: string): Promise<InlinedImage> {
  const response = await fetch(INLINE_MEDIA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { dataUrl?: string; mimeType?: string; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Failed to inline image (${response.status})`);
  }

  if (!payload?.dataUrl || !payload.mimeType) {
    throw new Error("Inline image response was missing data");
  }

  return { dataUrl: payload.dataUrl, mimeType: payload.mimeType };
}
