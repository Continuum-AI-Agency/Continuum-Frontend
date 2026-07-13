import { z } from 'zod';

/**
 * Contracts for the `library-upload` edge function. A locally selected/dropped
 * image or video is uploaded straight from the browser to the `media-library`
 * bucket via a service-role signed upload URL minted by the edge fn (no bytes
 * proxied through Next/Vercel), then registered as a `source:"upload"` media
 * asset. Mirrors the clip pipeline (`clip.ts`); the edge fn re-validates with a
 * Deno-local `lib.ts` since it cannot import this workspace package.
 */

/** Ask the edge fn to mint a signed upload URL for one image/video file. The
 *  `assetId` it returns becomes the eventual `media.assets` row id, so the path
 *  and the row stay in lockstep. */
export const librarySignUploadRequestSchema = z
  .object({
    brandId: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
  })
  .strict();

/** What a sign request returns: feed `path` + `token` to `uploadToSignedUrl`,
 *  then echo `assetId` back on the register call. */
export const libraryUploadTicketSchema = z
  .object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    token: z.string().min(1),
    assetId: z.string().min(1),
  })
  .strict();

/** Register an already-uploaded object as a `source:"upload"` media asset.
 *  Idempotent on (bucket, storage_path). `kind` is derived from `mimeType` by
 *  the edge fn, so it is not part of the request. */
export const registerMediaRequestSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    // sha256 hex of the uploaded bytes, computed in-browser. Seeds the future
    // creative-DNA join against paid_media content hashes. Optional: digest
    // failures must never block an upload.
    checksum: z.string().min(1).optional(),
  })
  .strict();

/** Register success: carries a fresh signed download URL so the caller can show
 *  the asset immediately without a separate sign round-trip. */
export const registerMediaResponseSchema = z
  .object({
    ok: z.literal(true),
    status: z.enum(['ready', 'exists']),
    assetId: z.string(),
    storagePath: z.string(),
    signedUrl: z.string().min(1),
  })
  .strict();

export const registerMediaErrorSchema = z
  .object({
    ok: z.literal(false),
    status: z.literal('error'),
    message: z.string(),
  })
  .strict();

export type LibrarySignUploadRequest = z.infer<typeof librarySignUploadRequestSchema>;
export type LibraryUploadTicket = z.infer<typeof libraryUploadTicketSchema>;
export type RegisterMediaRequest = z.infer<typeof registerMediaRequestSchema>;
export type RegisterMediaResponse = z.infer<typeof registerMediaResponseSchema>;
export type RegisterMediaError = z.infer<typeof registerMediaErrorSchema>;
