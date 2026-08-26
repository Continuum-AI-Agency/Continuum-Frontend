import { z } from 'zod';

// Unsplash stock photos as canvas REFERENCE images.
//
// Two rules from Unsplash's API Guidelines shape this contract, and neither is
// cosmetic:
//
// 1. HOTLINKING. The `photo.urls.*` values the API returns must be used as-is.
//    They carry an `ixid` tracking parameter that is how a photographer gets
//    credited for a view, so the urls here are opaque strings that must never be
//    rebuilt, trimmed, or re-hosted. This is also why nothing in this contract
//    describes stored bytes: an Unsplash reference is a URL, not a media.assets
//    row.
// 2. ATTRIBUTION on every display. `photographerName`/`photographerUrl` and
//    `unsplashUrl` are required, not optional decoration — a surface that renders
//    the photo owes the credit line. The two profile links (and ONLY those) carry
//    the UTM below.

/** Appended to the two profile links Unsplash requires us to link back to. */
export const UNSPLASH_UTM = 'utm_source=continuum&utm_medium=referral';

/** Fired when a user actually SELECTS a photo for use — never on search render. */
export const UNSPLASH_ATTRIBUTION_PROVIDER = 'unsplash';

export const unsplashOrientationSchema = z.enum(['landscape', 'portrait', 'squarish']);
export type UnsplashOrientation = z.infer<typeof unsplashOrientationSchema>;

export const unsplashPhotoSchema = z
  .object({
    id: z.string().min(1),
    /** `urls.regular` — what the canvas node holds and generation reads. Opaque. */
    url: z.string().url(),
    /** `urls.small` — the picker grid tile. Opaque. */
    thumbUrl: z.string().url(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** Dominant hex Unsplash computes; paints the tile before the image lands. */
    color: z.string(),
    blurHash: z.string().nullable(),
    /** `alt_description` — the only human text Unsplash guarantees. */
    alt: z.string().nullable(),
    photographerName: z.string().min(1),
    photographerUrl: z.string().url(),
    unsplashUrl: z.string().url(),
    /**
     * `links.download_location`. Kept on the wire because the compliance ping is
     * fired by the client at the moment of selection, not by the search call.
     */
    downloadLocation: z.string().url(),
  })
  .strict();
export type UnsplashPhoto = z.infer<typeof unsplashPhotoSchema>;

export const unsplashSearchRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    query: z.string().min(1).max(200),
    page: z.number().int().min(1).max(20).default(1),
    // Unsplash caps per_page at 30.
    perPage: z.number().int().min(1).max(30).default(24),
    orientation: unsplashOrientationSchema.optional(),
  })
  .strict();
export type UnsplashSearchRequest = z.infer<typeof unsplashSearchRequestSchema>;

export const unsplashSearchResponseSchema = z
  .object({
    results: z.array(unsplashPhotoSchema),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    /**
     * False when the backend has no Unsplash key configured. The panel says so
     * rather than rendering an empty grid that reads as "no results".
     */
    configured: z.boolean(),
  })
  .strict();
export type UnsplashSearchResponse = z.infer<typeof unsplashSearchResponseSchema>;

export const unsplashTrackDownloadRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    downloadLocation: z.string().url(),
  })
  .strict();
export type UnsplashTrackDownloadRequest = z.infer<typeof unsplashTrackDownloadRequestSchema>;

/**
 * What a canvas image node carries so it can render the required credit line
 * after a reload. Stored on the node's free-form `data`, not in the database.
 */
export const unsplashAttributionSchema = z
  .object({
    provider: z.literal(UNSPLASH_ATTRIBUTION_PROVIDER),
    photographerName: z.string().min(1),
    photographerUrl: z.string().url(),
    sourceUrl: z.string().url(),
  })
  .strict();
export type UnsplashAttribution = z.infer<typeof unsplashAttributionSchema>;

/**
 * Append the required UTM to an Unsplash PROFILE/PHOTO PAGE link.
 *
 * Never call this on a `urls.*` CDN value — those already carry `ixid` and are
 * required to go out byte-identical.
 */
export function withUnsplashUtm(link: string): string {
  return `${link}${link.includes('?') ? '&' : '?'}${UNSPLASH_UTM}`;
}
