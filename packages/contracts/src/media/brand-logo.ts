import { z } from 'zod';

// The one way the app sets a brand's logo. The Backend writes brand_profiles.logo_path AND
// brand_report_composites.brand_tokens.logo together; generation reads the tokens first, so a
// writer that touched only logo_path left brands generating with an older (or invented) logo.
export const BRAND_LOGO_ROUTE = '/api/media/brand-logo';

/** Matches the Settings uploader's limit; a logo larger than this is a banner, not a mark. */
export const BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const brandLogoUploadContentTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
]);

const brandId = z.string().uuid();

export const setBrandLogoRequestSchema = z.discriminatedUnion('source', [
  /** A Library image becomes the logo (copied, so deleting the asset later keeps the logo). */
  z.object({ source: z.literal('library'), brandId, assetId: z.string().uuid() }).strict(),
  /** A file picked in Settings, base64 without the data: prefix. */
  z
    .object({
      source: z.literal('upload'),
      brandId,
      contentType: brandLogoUploadContentTypeSchema,
      dataBase64: z
        .string()
        .min(1)
        .max(Math.ceil(BRAND_LOGO_MAX_BYTES / 3) * 4),
    })
    .strict(),
  /** The brand has no logo: both stores are cleared. */
  z.object({ source: z.literal('none'), brandId }).strict(),
]);
export type SetBrandLogoRequest = z.infer<typeof setBrandLogoRequestSchema>;

export const setBrandLogoResponseSchema = z.object({ logoPath: z.string().nullable() }).strict();
export type SetBrandLogoResponse = z.infer<typeof setBrandLogoResponseSchema>;

export const setBrandLogoErrorCodeSchema = z.enum([
  'invalid_payload',
  'forbidden',
  'asset_not_found',
  'not_an_image',
  'logo_too_large',
  'logo_save_failed',
]);
export type SetBrandLogoErrorCode = z.infer<typeof setBrandLogoErrorCodeSchema>;
