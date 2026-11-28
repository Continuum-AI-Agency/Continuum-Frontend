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
  /** An SVG with scripts, embedded HTML or references outside the file. */
  'unsafe_svg',
  'logo_save_failed',
]);
export type SetBrandLogoErrorCode = z.infer<typeof setBrandLogoErrorCodeSchema>;

/** Every logo the brand hands over is a Library image tagged `logo`. */
export const LOGO_TAG = 'logo';
/** A Library image the brand wants generation to draw on for look and feel. */
export const REFERENCE_TAG = 'reference';
/**
 * Which version of the logo a Library image is. Generation still uses only the brand logo
 * (`logo_path`); these let a person, and an agent, find the white or icon version.
 */
export const LOGO_VARIANT_TAGS = [
  'logo:primary',
  'logo:white',
  'logo:dark',
  'logo:icon',
  'logo:horizontal',
] as const;
export type LogoVariantTag = (typeof LOGO_VARIANT_TAGS)[number];
/** An SVG set as the brand logo is stored as a PNG; the SVG stays in the Library with this tag. */
export const LOGO_SOURCE_SVG_TAG = 'logo:source-svg';
/** The tags a brand-identity editor (onboarding, Library, MCP) may add or remove. */
export const BRAND_IDENTITY_TAGS = [LOGO_TAG, REFERENCE_TAG, ...LOGO_VARIANT_TAGS] as const;
