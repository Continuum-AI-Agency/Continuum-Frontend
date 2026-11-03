// The shape every Home read answers with. A Home module is never left loading: a read either
// carries its data (`ready`) or says, in one sentence, what is missing (`missing`) so the tile
// can show that sentence instead of a spinner.
//
// Served by the Backend at HOME_READ_PATHS (GET, `?brandId=`), authorised by brand membership.

import { z } from 'zod';

export const HOME_READ_PATHS = {
  opportunities: '/api/home/reads/opportunities',
  overnightLog: '/api/home/reads/overnight-log',
  creativeSpotlight: '/api/home/reads/creative-spotlight',
  organicWeek: '/api/home/reads/organic-week',
  accountHygiene: '/api/home/reads/account-hygiene',
  brief: '/api/home/reads/brief',
  goalTargets: '/api/home/goal-targets',
} as const;
export type HomeReadName = keyof typeof HOME_READ_PATHS;

/**
 * Why a read has nothing to show. The Frontend picks its copy from the code; `detail` is the
 * Backend's sentence for logs and tooltips.
 */
export const homeReadMissingReasonSchema = z.enum([
  /** The brand has no ad account connected for the platform this read needs. */
  'no_ad_account',
  /** The brand has no organic (Instagram/Facebook/TikTok) account connected. */
  'no_organic_account',
  /** The read needs an Optimizer portfolio and the brand has none enrolled. */
  'no_portfolio',
  /** The sources are connected but hold nothing for the window asked. */
  'no_data',
  /** The read depends on a migration or edge function that is not deployed yet. */
  'not_deployed',
  /** The read needs a goal target the team has not set. */
  'no_goal_target',
]);
export type HomeReadMissingReason = z.infer<typeof homeReadMissingReasonSchema>;

export const homeReadMissingSchema = z.object({
  reason: homeReadMissingReasonSchema,
  detail: z.string().min(1),
});
export type HomeReadMissing = z.infer<typeof homeReadMissingSchema>;

/** Where a figure on the Home came from, so a tap can open the source it was read from. */
export const homeReadSourceSchema = z.object({
  /** The table, view, RPC or edge the figure was read from, e.g. `paid_media.ads`. */
  kind: z.string().min(1),
  /** The row or entity the figure belongs to, when there is one. */
  ref: z.string().nullable(),
  /** ISO date range the figure covers, inclusive. */
  since: z.string().nullable(),
  until: z.string().nullable(),
});
export type HomeReadSource = z.infer<typeof homeReadSourceSchema>;

export function homeReadEnvelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion('state', [
    z.object({
      state: z.literal('ready'),
      brandId: z.string().uuid(),
      generatedAt: z.string(),
      data,
    }),
    z.object({
      state: z.literal('missing'),
      brandId: z.string().uuid(),
      generatedAt: z.string(),
      missing: homeReadMissingSchema,
    }),
  ]);
}

export type HomeReadEnvelope<T> =
  | { state: 'ready'; brandId: string; generatedAt: string; data: T }
  | { state: 'missing'; brandId: string; generatedAt: string; missing: HomeReadMissing };

export function homeReadReady<T>(
  brandId: string,
  data: T,
  now: Date = new Date(),
): HomeReadEnvelope<T> {
  return { state: 'ready', brandId, generatedAt: now.toISOString(), data };
}

export function homeReadMissing<T = never>(
  brandId: string,
  reason: HomeReadMissingReason,
  detail: string,
  now: Date = new Date(),
): HomeReadEnvelope<T> {
  return { state: 'missing', brandId, generatedAt: now.toISOString(), missing: { reason, detail } };
}
