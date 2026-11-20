import { z } from 'zod';

/** Stable action refusals retain the legacy HTTP `error` field. */
export const COMPETITOR_INSPIRATION_ERROR_CODES = {
  notAnalysed: 'not_analysed',
  seedUnresolved: 'inspiration_seed_unresolved',
} as const;

export const competitorInspirationErrorCodeSchema = z.enum([
  COMPETITOR_INSPIRATION_ERROR_CODES.notAnalysed,
  COMPETITOR_INSPIRATION_ERROR_CODES.seedUnresolved,
]);
export type CompetitorInspirationErrorCode = z.infer<typeof competitorInspirationErrorCodeSchema>;

export const competitorInspirationErrorResponseSchema = z
  .object({
    error: competitorInspirationErrorCodeSchema,
    message: z.string().optional(),
  })
  .passthrough();
