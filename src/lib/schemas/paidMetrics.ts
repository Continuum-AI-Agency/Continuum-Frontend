import { z } from "zod";

export const PaidMetricsResponseSchema = z.object({
  metrics: z.object({
    spend: z.number(),
    roas: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number(),
    cpc: z.number(),
  }),
  comparison: z.record(
    z.string(),
    z.object({
      current: z.number(),
      previous: z.number(),
      percentageChange: z.number(),
    })
  ).optional(),
  trends: z.array(
    z.object({
      date: z.string(),
      spend: z.number(),
      roas: z.number(),
      impressions: z.number().optional(),
      clicks: z.number().optional(),
    })
  ),
  range: z.object({
      since: z.string(),
      until: z.string(),
      preset: z.string()
  })
});

export type PaidMetricsResponse = z.infer<typeof PaidMetricsResponseSchema>;

export type PaidMetricsRequest = {
    brandId: string;
    adAccountId?: string;
    range: {
        preset: string; // e.g., "last_7d"
        since?: string;
        until?: string;
    };
    forceRefresh?: boolean;
};
