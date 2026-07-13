import { z } from 'zod';

/** Server-owned labels for immutable attempts within a calendar-week collection. */
export const trendsGenerationKindSchema = z.enum(['initial', 'regeneration']);
export type TrendsGenerationKind = z.infer<typeof trendsGenerationKindSchema>;

/** Compact browse metadata; individual insight rows remain generation-scoped. */
export const trendsWeekSummarySchema = z.object({
  weekStartDate: z.string().date(),
  generationCount: z.number().int().positive(),
  regenerationCount: z.number().int().nonnegative(),
  latestGenerationId: z.string().uuid(),
  latestCompletedAt: z.string().datetime().nullable(),
});
export type TrendsWeekSummary = z.infer<typeof trendsWeekSummarySchema>;
