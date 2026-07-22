import { z } from 'zod';

/**
 * Drag-to-reschedule a persisted calendar draft. The only field that crosses the
 * boundary is the new scheduled timestamp — an absolute, offset-bearing ISO string
 * so the Backend writes it verbatim without re-deriving a day from a bare date.
 *
 * The Backend's reschedule route writes `scheduled_date` as-is (no server-side
 * `normalizeScheduledAt`), so a date-only string would land at midnight UTC and a
 * past value would make the scheduled-publish poller fire immediately — the caller
 * is responsible for supplying a future, offset-qualified instant.
 */
export const organicRescheduleDraftRequestSchema = z.object({
  scheduled_date: z.string().datetime({ offset: true }),
});
export type OrganicRescheduleDraftRequest = z.infer<typeof organicRescheduleDraftRequestSchema>;
