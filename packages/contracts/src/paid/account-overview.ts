// What the paid-media-metrics edge answers for the `account_overview` scope on every platform that
// serves it: one ad account's totals over a window, the same window before it, and the window day
// by day. Both producers (meta/handler.ts and google/handler.ts) are Deno and cannot import this
// package; the Frontend's Home, Dashboard and Organic compare parse with it.
//
// The platforms count results in different words. Meta names each result: purchases (and their
// value), leads, conversations. Google counts ONE business result per read, the read's
// `resultBucket` (leads | purchases | signups), as `conversions`; `result_basis` says which one,
// and on an ambiguous basis Google nulls every count and CPA rather than add unlike things
// (google-tab.ts GoogleResultBasisSchema). Lenient on purpose: the edge emits more keys than any
// reader needs, and a metric a platform does not report is absent, never zero.

import { z } from 'zod';
import { GoogleResultBasisSchema } from './google-tab';

const accountComparisonSchema = z.object({
  current: z.number().nullable().optional(),
  previous: z.number().nullable().optional(),
  percentageChange: z.number().nullable().optional(),
});

export const paidAccountOverviewSchema = z.object({
  /** The account's own currency and timezone, labelled by the edge. Null when it could not read
   *  them: a null currency never prints as a label. */
  currency: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  metrics: z.object({
    spend: z.number(),
    roas: z.number(),
    ctr: z.number(),
    impressions: z.number().optional(),
    clicks: z.number().optional(),
    cpc: z.number().optional(),
    /** Google: spend per counted result, 0 when none was counted, null on an ambiguous basis. */
    cpa: z.number().nullable().optional(),
    purchases: z.number().optional(),
    purchase_value: z.number().optional(),
    conversations: z.number().optional(),
    leads: z.number().optional(),
    cost_per_conversation: z.number().optional(),
    cost_per_lead: z.number().optional(),
  }),
  /** The window against the one before, per metric. Google nulls `cpa` on an ambiguous basis. */
  comparison: z.record(z.string(), accountComparisonSchema.nullable()).optional(),
  trends: z
    .array(
      z.object({
        date: z.string().optional(),
        spend: z.number().optional(),
        roas: z.number().optional(),
        ctr: z.number().optional(),
        clicks: z.number().optional(),
        impressions: z.number().optional(),
        purchases: z.number().optional(),
        conversations: z.number().optional(),
        leads: z.number().optional(),
        /** Google: the day's count of the read's business result; null on an ambiguous basis. */
        conversions: z.number().nullable().optional(),
        cpa: z.number().nullable().optional(),
      }),
    )
    .optional(),
  /** Google: which business result `conversions` and `cpa` count. Absent on Meta. */
  result_basis: GoogleResultBasisSchema.optional(),
});
export type PaidAccountOverview = z.infer<typeof paidAccountOverviewSchema>;
