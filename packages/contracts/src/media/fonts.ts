// The shared font repository — one index of every typeface we hold.
//
// Why this exists: font bytes were stored per brand as Supabase Storage objects with a
// `manifest.json` sidecar and no database row, so "do we hold Gotham-Bold?" had no answer
// short of listing every brand's prefix. On 2026-09-15 that cost an 18-variation Inyogo
// batch ~12 GiB of masters rendered in substituted typefaces: the two required faces were
// installed on exactly one EC2 render worker and recorded nowhere.
//
// THE RULE THIS FILE INHERITS: a storage path or URL for a font NEVER reaches a browser.
// `brand-knowledge/fonts/store.ts` explains why — brand faces are commercially licensed and
// a key in the client is one signed-URL call from redistributing one. So the inventory shape
// below carries identity (family, owner, digest, size) and deliberately NOT `storage_path`.
// `renderFontRefSchema` is the single exception and it is server-to-render-fleet only; it is
// never returned from a route the Frontend calls.

import { z } from 'zod';

/**
 * Who a face is licensed to.
 *
 * `brand` — uploaded by and licensed to one brand; resolves only for that brand, because
 * serving it to another tenant is redistribution.
 * `house` — a vendor face we license fleet-wide (Gotham, Urbanchrome) or an open-licence
 * face (the SIL OFL caption fonts). Resolves for anyone. These have no `brandId` at all,
 * which is the reason the repository could not live under `brand-docs/<brandId>/fonts/`.
 */
export const fontLicenceScopeSchema = z.enum(['brand', 'house']);
export type FontLicenceScope = z.infer<typeof fontLicenceScopeSchema>;

/** The four single-face formats the store accepts. `ttcf` collections are rejected upstream. */
export const fontFormatSchema = z.enum(['otf', 'ttf', 'woff', 'woff2']);
export type FontFormat = z.infer<typeof fontFormatSchema>;

export const fontStyleSchema = z.enum(['normal', 'italic']);

/** How a face got into the repository — upload, harvested off a worker, or backfilled. */
export const fontSourceSchema = z.enum([
  'upload',
  'worker-harvest',
  'backfill',
  // Shipped inside the After Effects package the brand uploaded — brand-scoped, like an upload.
  'template_package',
  // An SIL OFL face fetched from Google Fonts because a template asked for it — house-scoped.
  'google_fonts',
]);
export type FontSource = z.infer<typeof fontSourceSchema>;

/**
 * One row of the inventory — the answer to "all the fonts we have".
 *
 * No `storagePath`. An operator identifies a face by family + owner + digest; the bytes are
 * fetched server-side by id. `brandName` is denormalised so the ops view does not need a
 * second round trip to say who uploaded it.
 */
export const fontInventoryRowSchema = z
  .object({
    id: z.string().uuid(),
    family: z.string().min(1),
    familyKey: z.string().min(1),
    licenceScope: fontLicenceScopeSchema,
    brandId: z.string().uuid().nullable(),
    brandName: z.string().nullable(),
    postScriptName: z.string().nullable(),
    /** Windows font-registry display name, e.g. "Gotham-Bold (TrueType)". */
    winRegistryName: z.string().nullable(),
    weight: z.number().int().nullable(),
    style: fontStyleSchema,
    format: fontFormatSchema,
    bytes: z.number().int().nonnegative(),
    sha256: z.string().min(1),
    source: fontSourceSchema,
    createdAt: z.string(),
  })
  .strict();
export type FontInventoryRow = z.infer<typeof fontInventoryRowSchema>;

export const fontInventoryResponseSchema = z
  .object({
    fonts: z.array(fontInventoryRowSchema),
    /** Distinct `familyKey` count — how many typefaces we hold, not how many files. */
    families: z.number().int().nonnegative(),
  })
  .strict();
export type FontInventoryResponse = z.infer<typeof fontInventoryResponseSchema>;

/**
 * One face handed to a render worker so it can install it before After Effects launches.
 *
 * `url` is a short-TTL signed URL minted server-side, exactly the way `resolveVariables`
 * already mints media URLs for the same fleet. SERVER-TO-FLEET ONLY — never serialise this
 * into a response the browser receives.
 *
 * Both name fields travel because they are different namespaces and a preflight that
 * conflates them silently passes: `postScriptName` is what the AEP parse emits
 * ("Poppins-Bold"), `winRegistryName` is what the Windows font registry is keyed by
 * ("Gotham-Bold (TrueType)"). The worker registers under the latter and the guard greps for
 * it; matching on the former finds nothing and reports a font it just installed as missing.
 */
/* -------------------------------------------------------------------------- */
/*  The worker agent's two calls                                               */
/* -------------------------------------------------------------------------- */

/**
 * One face as the worker-resident font agent sees it, and deliberately WITHOUT a url.
 *
 * Every worker polls this on a short interval. Minting a signed URL per face per poll would
 * be hundreds of storage round trips to tell a healthy fleet it has nothing to do, so the
 * manifest is identity only and the worker asks for URLs separately, for what it lacks.
 */
export const fleetFontManifestEntrySchema = z
  .object({
    family: z.string().min(1),
    /** What the Windows font registry is keyed by — what the agent compares against. */
    registryName: z.string().min(1),
    postScriptName: z.string().nullable(),
    format: fontFormatSchema,
    filename: z.string().min(1),
    sha256: z.string().min(1),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type FleetFontManifestEntry = z.infer<typeof fleetFontManifestEntrySchema>;

export const fleetFontManifestResponseSchema = z
  .object({ fonts: z.array(fleetFontManifestEntrySchema) })
  .strict();
export type FleetFontManifestResponse = z.infer<typeof fleetFontManifestResponseSchema>;

/**
 * "Here is what I am missing." Digests, never family names.
 *
 * The digest is the thing the worker re-verifies after downloading, so asking by digest
 * means a caller cannot be handed a different face under a name it recognises.
 */
export const fleetFontFetchRequestSchema = z
  .object({ sha256: z.array(z.string().min(1)).min(1).max(500) })
  .strict();
export type FleetFontFetchRequest = z.infer<typeof fleetFontFetchRequestSchema>;

export const fleetFontFetchResponseSchema = z
  .object({
    fonts: z.array(
      z
        .object({
          family: z.string().min(1),
          registryName: z.string().min(1),
          filename: z.string().min(1),
          sha256: z.string().min(1),
          /** Short-TTL signed URL. Server-to-worker only; never returned to a browser. */
          url: z.string().url(),
        })
        .strict(),
    ),
  })
  .strict();
export type FleetFontFetchResponse = z.infer<typeof fleetFontFetchResponseSchema>;

export const renderFontRefSchema = z
  .object({
    family: z.string().min(1),
    postScriptName: z.string().nullable(),
    winRegistryName: z.string().nullable(),
    format: fontFormatSchema,
    /** Lets a worker skip a face it already has, and prove the bytes it got are the bytes we sent. */
    sha256: z.string().min(1),
    url: z.string().url(),
  })
  .strict();
export type RenderFontRef = z.infer<typeof renderFontRefSchema>;
