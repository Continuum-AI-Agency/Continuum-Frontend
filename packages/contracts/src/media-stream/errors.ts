import { z } from 'zod';

/**
 * Every failure `Continuum-MediaStream` can return.
 *
 * This list is CANONICAL. Its Rust twin is `JobErrorCode::ALL` in
 * `Continuum-MediaStream/src/error.rs`, and the drift guard
 * (`bun run mediastream:contracts:check`) fails if the two disagree — the Rust
 * test `tests/contracts_guard.rs` reads `fixtures/error-codes.json`, which is
 * generated from this enum and checked in.
 *
 * Adding a code here without adding it there (or vice versa) is a red test on
 * one side or the other, never a silent `unknown` on the Frontend.
 */
export const mediaStreamErrorCodeSchema = z.enum([
  /** The request body did not match this contract. */
  'BAD_REQUEST',
  /** HMAC signature or timestamp missing/invalid. */
  'UNAUTHORIZED',
  /** A source or destination key is outside the signed tenant scope. */
  'PATH_TENANCY_VIOLATION',
  /** The bucket is not allowed by the selected store profile. */
  'BUCKET_NOT_ALLOWED',
  /** The opaque store id does not exist in the operator-managed registry. */
  'STORE_NOT_FOUND',
  /** The selected store cannot perform the requested operation safely. */
  'STORE_CAPABILITY_UNAVAILABLE',
  /** A URL source was rejected before connecting by the source policy. */
  'URL_NOT_ALLOWED',
  /** The upstream URL could not be fetched, or returned a short body. */
  'SOURCE_FETCH_FAILED',
  /** The source object does not exist in storage. */
  'SOURCE_NOT_FOUND',
  /** A storage (S3) call failed. */
  'STORAGE_FAILED',
  /**
   * The object or archive would exceed a configured hard ceiling.
   *
   * Always an explicit rejection. The service never truncates to fit.
   */
  'LIMIT_EXCEEDED',
  /** A value would not fit a ZIP field even with ZIP64. */
  'ZIP64_LIMIT_EXCEEDED',
  /** The job exceeded its wall-clock budget. */
  'TIMEOUT',
  /** The service is missing configuration it cannot run without. */
  'CONFIG_INVALID',
  /** A caught panic or an unclassified internal failure. */
  'INTERNAL',
]);

export type MediaStreamErrorCode = z.infer<typeof mediaStreamErrorCodeSchema>;

/** The order the fixture corpus and the Rust guard both compare against. */
export const MEDIA_STREAM_ERROR_CODES = mediaStreamErrorCodeSchema.options;

export const mediaStreamErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    /** Present whenever the body parsed far enough to read `jobId`. */
    jobId: z.string().optional(),
    error: z
      .object({
        code: mediaStreamErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type MediaStreamErrorEnvelope = z.infer<typeof mediaStreamErrorEnvelopeSchema>;
