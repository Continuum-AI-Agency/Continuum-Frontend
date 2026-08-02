import { z } from 'zod';

/**
 * Provider-neutral wire contract for the MediaStream byte plane.
 *
 * **These schemas are canonical.** The Rust structs in
 * `Continuum-MediaStream/src/models.rs` are the other half of the same
 * contract, and both sides are validated against the SAME checked-in fixture
 * corpus (`./fixtures/`) — a Bun test here, a `#[test]` there. Change one shape
 * without the other and one of those two goes red.
 *
 * Three jobs, one envelope:
 *
 * | route | what it does | bytes through the container |
 * |---|---|---|
 * | `POST /v1/jobs/passthrough` | URL → object store | streamed, bounded |
 * | `POST /v1/jobs/transfer`    | storage → storage      | **zero** (server-side copy) |
 * | `POST /v1/jobs/zip`         | many assets → one ZIP  | streamed, bounded |
 *
 * Every request carries a tenant scope. The server resolves opaque `storeId`
 * values through its operator-managed registry and applies that store's access
 * policy before any network call. Endpoints and credentials never cross this
 * interface.
 */

export const mediaStreamStoreIdSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

export type MediaStreamStoreId = z.infer<typeof mediaStreamStoreIdSchema>;

export const mediaStreamBucketSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((bucket) => !bucket.includes('/') && !bucket.includes('\0'), {
    message: 'bucket must be a single non-NUL segment',
  });

export type MediaStreamBucket = z.infer<typeof mediaStreamBucketSchema>;

export const mediaStreamScopeSchema = z
  .object({
    tenantId: z.string().min(1).max(128),
  })
  .strict();

export type MediaStreamScope = z.infer<typeof mediaStreamScopeSchema>;

export const mediaStreamStorageKeySchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((key) => !key.startsWith('/'), { message: 'storage key must be relative' })
  .refine((key) => !key.includes('\0') && !key.split('/').includes('..'), {
    message: "storage key must not contain NUL or '..'",
  })
  .refine((key) => key.split('/').every((segment) => segment !== '' && segment !== '.'), {
    message: 'storage key must contain only safe non-empty segments',
  });

export const mediaStreamStorageRefSchema = z
  .object({
    storeId: mediaStreamStoreIdSchema,
    bucket: mediaStreamBucketSchema,
    key: mediaStreamStorageKeySchema,
  })
  .strict();

export type MediaStreamStorageRef = z.infer<typeof mediaStreamStorageRefSchema>;

export const mediaStreamDestinationSchema = z
  .object({
    storeId: mediaStreamStoreIdSchema,
    bucket: mediaStreamBucketSchema,
    key: mediaStreamStorageKeySchema,
    /**
     * Stored as the object's `Content-Type`. Omit to inherit the source's.
     * (The forked tool hardcoded `application/zip` on every object it wrote.)
     */
    contentType: z.string().min(1).optional(),
    cacheControl: z.string().min(1).optional(),
  })
  .strict();

export type MediaStreamDestination = z.infer<typeof mediaStreamDestinationSchema>;

/** What a job cost. */
export const mediaStreamJobMetricsSchema = z
  .object({
    durationMs: z.number().int().nonnegative(),
    /**
     * Bytes read INTO the container. `0` on a transfer proves the server-side
     * copy path ran — `mediastream:transfer:e2e:bench` asserts exactly that, so
     * a download-then-upload regression cannot land quietly.
     */
    bytesIn: z.number().int().nonnegative(),
    bytesOut: z.number().int().nonnegative(),
    /**
     * Peak RSS during this job, sampled from `/proc/self/statm`.
     *
     * `0` means "not measurable on this platform" (developer macOS), NOT "used
     * no memory" — benches must treat 0 as un-asserted rather than as a pass.
     */
    peakRssBytes: z.number().int().nonnegative(),
    /**
     * The arithmetic ceiling the uploader is designed to respect,
     * `partSize * (concurrency + 1)`. Reported so a bench can compare the
     * observed peak against the service's own claim.
     */
    uploadMemoryCeilingBytes: z.number().int().nonnegative(),
  })
  .strict();

export type MediaStreamJobMetrics = z.infer<typeof mediaStreamJobMetricsSchema>;

/** Success envelope. Identical shape for all three jobs. */
const jobEnvelope = <T extends z.ZodTypeAny>(result: T) =>
  z
    .object({
      ok: z.literal(true),
      jobId: z.string().min(1),
      result,
      metrics: mediaStreamJobMetricsSchema,
    })
    .strict();

const storedObjectSchema = z
  .object({
    storeId: mediaStreamStoreIdSchema,
    bucket: mediaStreamBucketSchema,
    key: mediaStreamStorageKeySchema,
    bytes: z.number().int().nonnegative(),
    /** Hex sha256, computed as the bytes streamed past. Present iff requested. */
    sha256: z.string().length(64).optional(),
    contentType: z.string().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// passthrough
// ---------------------------------------------------------------------------

export const mediaStreamPassthroughRequestSchema = z
  .object({
    jobId: z.string().min(1),
    scope: mediaStreamScopeSchema,
    source: z.object({ url: z.url() }).strict(),
    destination: mediaStreamDestinationSchema,
    /** Reject rather than truncate if the source exceeds this. */
    maxBytes: z.number().int().positive().optional(),
    /** Compute a sha256 in-stream. Costs CPU, never memory. */
    checksum: z.boolean().default(false),
  })
  .strict();

export const mediaStreamPassthroughResponseSchema = jobEnvelope(storedObjectSchema);

export type MediaStreamPassthroughRequest = z.infer<typeof mediaStreamPassthroughRequestSchema>;
export type MediaStreamPassthroughResponse = z.infer<typeof mediaStreamPassthroughResponseSchema>;

// ---------------------------------------------------------------------------
// transfer
// ---------------------------------------------------------------------------

export const mediaStreamTransferModeSchema = z.enum(['copy', 'move']);
export type MediaStreamTransferMode = z.infer<typeof mediaStreamTransferModeSchema>;

export const mediaStreamTransferStrategySchema = z.enum([
  'server_side_copy',
  'multipart_copy',
  'stream_relay',
]);
export type MediaStreamTransferStrategy = z.infer<typeof mediaStreamTransferStrategySchema>;

export const mediaStreamTransferRequestSchema = z
  .object({
    jobId: z.string().min(1),
    scope: mediaStreamScopeSchema,
    source: mediaStreamStorageRefSchema,
    destination: mediaStreamDestinationSchema,
    mode: mediaStreamTransferModeSchema,
  })
  .strict();

export const mediaStreamTransferResponseSchema = jobEnvelope(
  z
    .object({
      storeId: mediaStreamStoreIdSchema,
      bucket: mediaStreamBucketSchema,
      key: mediaStreamStorageKeySchema,
      bytes: z.number().int().nonnegative(),
      mode: mediaStreamTransferModeSchema,
      strategy: mediaStreamTransferStrategySchema,
      /**
       * `false` on a `move` means the copy landed but the delete failed, so a
       * duplicate remains. Deliberately not an error: the object exists where
       * it was asked to be, and reporting failure would invite a re-copy.
       */
      sourceDeleted: z.boolean(),
    })
    .strict(),
);

export type MediaStreamTransferRequest = z.infer<typeof mediaStreamTransferRequestSchema>;
export type MediaStreamTransferResponse = z.infer<typeof mediaStreamTransferResponseSchema>;

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------

/** `store` or streaming `deflate`. Both are constant-memory. */
export const mediaStreamZipCompressionSchema = z.enum(['store', 'deflate']);
export type MediaStreamZipCompression = z.infer<typeof mediaStreamZipCompressionSchema>;

/**
 * A path inside the archive.
 *
 * Rejects `..` in either separator: a ZIP entry named `../../etc/x` is a
 * zip-slip attack against whoever extracts the archive, not against us.
 */
export const mediaStreamArchiveEntryPathSchema = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith('/') && !path.startsWith('\\'), {
    message: 'archive entry path must be relative',
  })
  .refine((path) => !path.split(/[/\\]/).includes('..'), {
    message: 'archive entry path must not escape the archive root',
  });

export const mediaStreamZipEntrySchema = z
  .object({
    path: mediaStreamArchiveEntryPathSchema,
    /** Exactly one of `storage` / `url`. */
    source: z
      .object({
        storage: mediaStreamStorageRefSchema.optional(),
        url: z.url().optional(),
      })
      .strict()
      .refine((source) => Boolean(source.storage) !== Boolean(source.url), {
        message: 'entry source must carry exactly one of `storage` or `url`',
      }),
  })
  .strict();

export type MediaStreamZipEntry = z.infer<typeof mediaStreamZipEntrySchema>;

export const mediaStreamZipRequestSchema = z
  .object({
    jobId: z.string().min(1),
    scope: mediaStreamScopeSchema,
    entries: z.array(mediaStreamZipEntrySchema).min(1),
    destination: mediaStreamDestinationSchema,
    /** Media is already compressed; `store` is the honest default. */
    compression: mediaStreamZipCompressionSchema.default('store'),
    compressionLevel: z.number().int().min(1).max(9).optional(),
  })
  .strict();

export const mediaStreamZipResponseSchema = jobEnvelope(
  z
    .object({
      storeId: mediaStreamStoreIdSchema,
      bucket: mediaStreamBucketSchema,
      key: mediaStreamStorageKeySchema,
      bytes: z.number().int().nonnegative(),
      entryCount: z.number().int().nonnegative(),
      /**
       * Whether any value actually overflowed a 32/16-bit ZIP field, i.e. the
       * archive requires a ZIP64-capable reader. The forked tool had no ZIP64
       * at all and wrapped these silently.
       */
      zip64: z.boolean(),
      entries: z.array(
        z
          .object({
            path: z.string().min(1),
            uncompressedSize: z.number().int().nonnegative(),
            compressedSize: z.number().int().nonnegative(),
            crc32: z.number().int().nonnegative(),
          })
          .strict(),
      ),
    })
    .strict(),
);

export type MediaStreamZipRequest = z.infer<typeof mediaStreamZipRequestSchema>;
export type MediaStreamZipResponse = z.infer<typeof mediaStreamZipResponseSchema>;

// ---------------------------------------------------------------------------
// Request signing
// ---------------------------------------------------------------------------

/**
 * Headers every job request must carry.
 *
 * `x-mediastream-signature` is `HMAC-SHA256(secret, "{timestamp}.{rawBody}")`,
 * hex-encoded. The timestamp is INSIDE the MAC and is rejected outside a
 * ±300s window — the pattern this is derived from
 * (`Continuum-Backend/App/mcp/shared/agentWebhook.ts`) signs only the body and
 * is therefore replayable forever.
 */
export const MEDIA_STREAM_SIGNATURE_HEADER = 'x-mediastream-signature';
export const MEDIA_STREAM_TIMESTAMP_HEADER = 'x-mediastream-timestamp';
export const MEDIA_STREAM_MAX_CLOCK_SKEW_SECONDS = 300;
