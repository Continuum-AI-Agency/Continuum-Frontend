// The assembled organic-creative leaderboard row: the join product of a ranked
// organic post (analytics `posts` scope) and its Engine B insight (awareness
// `top_posts` block, else a client-derived hook-rate-vs-average line). Produced
// by the Frontend assembler, consumed by the dashboard creatives leaderboard.

import { z } from "zod";

export const organicCreativeMetricSchema = z.enum(["reach", "views"]);
export type OrganicCreativeMetric = z.infer<typeof organicCreativeMetricSchema>;

export const organicCreativeRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  permalink: z.string().optional(),
  mediaType: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  metricLabel: organicCreativeMetricSchema,
  metricValue: z.number(),
  hookRate: z.number().optional(),
  vsAveragePct: z.number().optional(),
  insightLine: z.string().optional(),
});
export type OrganicCreativeRow = z.infer<typeof organicCreativeRowSchema>;
