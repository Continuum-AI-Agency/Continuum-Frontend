import { z } from 'zod';
import { easyfitPilotConfigSchema } from '../easyfit/config';
import { easyfitDashboardPayloadSchema, easyfitSourceSchema } from '../easyfit/dashboard-payload';

/**
 * HTTP envelopes of the Easy Fit "Dashboard" tab (Backend `/easyfit/*`).
 * The payload and the config are the engine's own schemas; this file only adds what the
 * HTTP layer knows and the engine does not: where each source's data ends and which are late.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** GET /easyfit/dashboard. `payload: null` means no run has published yet (empty state). */
export const easyfitDashboardResponseSchema = z
  .object({
    payload: easyfitDashboardPayloadSchema.nullable(),
    meta: z
      .object({
        generated_at: z.string().datetime({ offset: true }),
        /** Last day of data each source contributed to this payload; empty while payload is null. */
        fuentes: z.partialRecord(easyfitSourceSchema, isoDateSchema),
        /** Sources whose latest run failed, so the payload carries their previous data. */
        atrasadas: z.array(easyfitSourceSchema),
      })
      .strict(),
  })
  .strict();
export type EasyfitDashboardResponse = z.infer<typeof easyfitDashboardResponseSchema>;

/** GET /easyfit/config response and PUT /easyfit/config body. */
export const easyfitConfigResponseSchema = easyfitPilotConfigSchema;
export type EasyfitConfigResponse = z.infer<typeof easyfitConfigResponseSchema>;
export const easyfitConfigRequestSchema = easyfitPilotConfigSchema;

export const easyfitJobNameSchema = z.enum([
  'ingest_meta',
  'ingest_google',
  'ingest_peaking',
  'ingest_poliwin',
  'attribution',
  'aggregates',
  'insights',
  'notify',
]);
export type EasyfitJobName = z.infer<typeof easyfitJobNameSchema>;

/** POST /easyfit/refresh: runs the whole nightly pipeline now. Answers when it has finished. */
export const easyfitRefreshResponseSchema = z
  .object({
    status: z.enum(['ok', 'partial', 'failed']),
    jobs: z.array(
      z
        .object({
          job: easyfitJobNameSchema,
          status: z.enum(['ok', 'failed', 'skipped']),
          detail: z.string().nullable(),
        })
        .strict(),
    ),
    atrasadas: z.array(easyfitSourceSchema),
  })
  .strict();
export type EasyfitRefreshResponse = z.infer<typeof easyfitRefreshResponseSchema>;

/** The real Poliwin export is ~1 MB as base64; 25 MB leaves generous room without being a free-for-all. */
const MAX_UPLOAD_BASE64_CHARS = 25_000_000;

/**
 * POST /easyfit/upload (the manual fallback): the Poliwin export as base64 and/or the Peaking
 * JSON the reference `peaking_fetch.js` downloads (`{ contacts, threads, opps, dp, ta }`).
 * At least one is required; the same pipeline then runs over what was sent.
 */
export const easyfitUploadRequestSchema = z
  .object({
    poliwinXlsxBase64: z.string().min(1).max(MAX_UPLOAD_BASE64_CHARS).optional(),
    peakingExport: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((body) => body.poliwinXlsxBase64 !== undefined || body.peakingExport !== undefined, {
    message: 'Send poliwinXlsxBase64, peakingExport or both',
  });
export type EasyfitUploadRequest = z.infer<typeof easyfitUploadRequestSchema>;

export const easyfitUploadResponseSchema = easyfitRefreshResponseSchema;
export type EasyfitUploadResponse = z.infer<typeof easyfitUploadResponseSchema>;

/** Every non-2xx answer of the module. */
export const easyfitErrorResponseSchema = z
  .object({
    error: z.enum(['unauthorized', 'forbidden', 'invalid_request', 'not_configured', 'failed']),
    message: z.string(),
  })
  .strict();
export type EasyfitErrorResponse = z.infer<typeof easyfitErrorResponseSchema>;
