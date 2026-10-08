// Library Drive — the HTTP envelopes between the Backend's /drive/v1 routes and their two
// callers: the `continuum` CLI (app-token auth) and the Library's storage meter (user JWT).
// The WebDAV surface at /dav speaks RFC 4918 XML, not these shapes.

import { z } from 'zod';

/** One brand's allowance — the same numbers the mount reports as RFC 4331 quota props. */
export const driveQuotaSchema = z
  .object({
    brandId: z.string().uuid(),
    usedBytes: z.number().int().nonnegative(),
    reservedBytes: z.number().int().nonnegative(),
    capacityBytes: z.number().int().nonnegative(),
    availableBytes: z.number().int().nonnegative(),
  })
  .strict();
export type DriveQuota = z.infer<typeof driveQuotaSchema>;

export const STORAGE_QUOTA_WARN_RATIO = 0.8;
export type StorageQuotaLevel = 'ok' | 'warn' | 'full';

/** In-flight uploads hold capacity too, so reserved bytes count toward the ceiling. */
export function storageQuotaLevel(
  quota: Pick<DriveQuota, 'usedBytes' | 'reservedBytes' | 'capacityBytes'>,
): {
  level: StorageQuotaLevel;
  ratio: number;
} {
  const held = quota.usedBytes + quota.reservedBytes;
  const ratio = quota.capacityBytes > 0 ? held / quota.capacityBytes : 1;
  const level = ratio >= 1 ? 'full' : ratio >= STORAGE_QUOTA_WARN_RATIO ? 'warn' : 'ok';
  return { level, ratio };
}

export const driveWhoamiSchema = z
  .object({
    userId: z.string().uuid(),
    brands: z.array(
      z
        .object({
          brandId: z.string().uuid(),
          name: z.string(),
          folder: z.string(),
          role: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type DriveWhoami = z.infer<typeof driveWhoamiSchema>;

/** `path` is a mount path below /dav, e.g. "/Acme/Library/cut.mp4". */
export const driveUploadRequestSchema = z
  .object({
    path: z.string().min(2),
    sizeBytes: z.number().int().nonnegative(),
    mimeType: z.string().optional(),
  })
  .strict();
export type DriveUploadRequest = z.infer<typeof driveUploadRequestSchema>;

/**
 * Everything the client needs to TUS the bytes straight to Storage and then complete.
 * `mode: 'version'` means the name already exists in that folder: the bytes become the
 * next version of `assetId`, so its comments, approvals and history stay attached.
 */
export const driveUploadTicketSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    reservationId: z.string().uuid(),
    mode: z.enum(['asset', 'version']),
    bucket: z.string(),
    objectPath: z.string(),
    signature: z.string(),
    supabaseUrl: z.string().url(),
    anonKey: z.string(),
    mimeType: z.string(),
  })
  .strict();
export type DriveUploadTicket = z.infer<typeof driveUploadTicketSchema>;

export const driveUploadCompleteRequestSchema = z
  .object({
    path: z.string().min(2),
    ticket: driveUploadTicketSchema,
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type DriveUploadCompleteRequest = z.infer<typeof driveUploadCompleteRequestSchema>;

export const driveUploadResultSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    mode: z.enum(['asset', 'version']),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();
export type DriveUploadResult = z.infer<typeof driveUploadResultSchema>;

export const driveDownloadTicketSchema = z
  .object({
    assetId: z.string().uuid(),
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    signedUrl: z.string().url(),
    /** The head file's sha256 when the Library recorded one; the client verifies against it. */
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
  })
  .strict();
export type DriveDownloadTicket = z.infer<typeof driveDownloadTicketSchema>;
