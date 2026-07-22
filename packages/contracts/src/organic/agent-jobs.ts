import { z } from 'zod';
import { organicGenerationStatusEnum } from '../streaming/organic';

/**
 * Retry a FAILED organic post-generation job. The request only carries the brand
 * so the Backend can enforce brand ownership before resetting the row; the job id
 * is a path parameter. The reset is a deterministic in-place requeue of the row's
 * already-persisted context — no model call, no free-text parsing.
 */
export const organicJobRetryRequestSchema = z.object({
  brandId: z.string().min(1),
});
export type OrganicJobRetryRequest = z.infer<typeof organicJobRetryRequestSchema>;

/**
 * The job the Backend returns after a successful retry: the row it re-queued, in
 * the same canonical lifecycle vocabulary every organic surface reads. `draftId`
 * is the already-persisted draft the worker will re-run against; `error` is the
 * prior failure, cleared to null by the requeue.
 */
export const organicJobRetryResponseSchema = z.object({
  job: z.object({
    jobId: z.string().min(1),
    status: organicGenerationStatusEnum,
    draftId: z.string().nullable().optional(),
    error: z
      .object({
        code: z.string().optional(),
        message: z.string(),
      })
      .nullable()
      .optional(),
  }),
});
export type OrganicJobRetryResponse = z.infer<typeof organicJobRetryResponseSchema>;
