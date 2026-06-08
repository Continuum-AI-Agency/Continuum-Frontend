/**
 * Canonical media-suggestion → preview-image resolution, shared by the Backend
 * pipeline emit and every Frontend surface (in-chat cards, list, calendar,
 * hover). This is the single mapper for "what image represents this post":
 * before this, the Backend pipeline preview only read signed/url (dropping the
 * base64-only 512px Nano Banana mockups) while the Frontend read base64 — so
 * the same post showed an image in the calendar but a blank in chat.
 *
 * Priority: a multi-asset carousel wins (one URL per slide, by `order`);
 * otherwise the single best source — hosted URL first, then a base64 data URL.
 */

export type OrganicMediaAsset = {
  signedUrl?: string | null;
  url?: string | null;
  assetUrl?: string | null;
  assetBase64?: string | null;
  mimeType?: string | null;
  order?: number | null;
};

export type OrganicMediaLike =
  | (OrganicMediaAsset & { assets?: OrganicMediaAsset[] | null })
  | null
  | undefined;

function base64ToDataUrl(base64?: string | null, mimeType?: string | null): string | null {
  if (typeof base64 !== "string") return null;
  const trimmed = base64.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:${mimeType || "image/png"};base64,${trimmed}`;
}

function resolveAsset(asset: OrganicMediaAsset | null | undefined): string | null {
  if (!asset) return null;
  if (typeof asset.signedUrl === "string" && asset.signedUrl.trim()) return asset.signedUrl.trim();
  if (typeof asset.url === "string" && asset.url.trim()) return asset.url.trim();
  if (typeof asset.assetUrl === "string" && asset.assetUrl.trim()) return asset.assetUrl.trim();
  return base64ToDataUrl(asset.assetBase64, asset.mimeType);
}

/**
 * All preview image URLs for a media suggestion (carousel-aware), in display
 * order. Base64-only assets are returned as `data:` URLs.
 */
export function resolveOrganicImageUrls(media: OrganicMediaLike): string[] {
  if (!media) return [];

  const assets = Array.isArray(media.assets) ? media.assets : [];
  if (assets.length > 0) {
    const ordered = [...assets].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
    const urls = ordered.map(resolveAsset).filter((u): u is string => u !== null);
    if (urls.length > 0) return urls;
  }

  const single = resolveAsset(media);
  return single ? [single] : [];
}

/** The single best preview image URL (or `null`). */
export function resolveOrganicImageUrl(media: OrganicMediaLike): string | null {
  return resolveOrganicImageUrls(media)[0] ?? null;
}
