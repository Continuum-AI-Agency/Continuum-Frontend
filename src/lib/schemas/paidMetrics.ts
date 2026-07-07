import { z } from "zod";

const nullableComparisonValueSchema = z.object({
  current: z.number(),
  previous: z.number().nullable(),
  percentageChange: z.number().nullable(),
});

const comparisonRecordSchema = z
  .record(z.string(), nullableComparisonValueSchema)
  .optional()
  .transform((comparison) => {
    if (!comparison) return undefined;

    const normalized = Object.fromEntries(
      Object.entries(comparison)
        .filter(([, value]) => typeof value.previous === "number" && typeof value.percentageChange === "number")
        .map(([key, value]) => [
          key,
          {
            current: value.current,
            previous: value.previous as number,
            percentageChange: value.percentageChange as number,
          },
        ])
    );

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  });

export const PaidMetricsResponseSchema = z.object({
  metrics: z.object({
    spend: z.number(),
    roas: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number(),
    cpc: z.number(),
    cpa: z.number().default(0),
    // GA4 sessions/conversions merged in by date (Phase 5 dashboard trend
    // line) — brand/property-level, not tied to the selected campaign.
    // Optional + defaulted so payloads from brands without GA4 still validate.
    gaSessions: z.number().default(0),
    gaConversions: z.number().default(0),
  }),
  comparison: comparisonRecordSchema,
  trends: z.array(
    z.object({
      date: z.string(),
      spend: z.number(),
      roas: z.number(),
      impressions: z.number().optional(),
      clicks: z.number().optional(),
      ctr: z.number().optional(),
      cpc: z.number().optional(),
      cpa: z.number().optional(),
      gaSessions: z.number().default(0),
      gaConversions: z.number().default(0),
    })
  ),
  range: z.object({
      since: z.string(),
      until: z.string(),
      preset: z.string()
  }),
  previous_range: z
    .object({
      since: z.string(),
      until: z.string(),
    })
    .optional(),
  insights: z
    .array(
      z.object({
        date_start: z.string().optional(),
        date_stop: z.string().optional(),
        spend: z.number().optional(),
        impressions: z.number().optional(),
        clicks: z.number().optional(),
        cpc: z.number().optional(),
        ctr: z.number().optional(),
        roas: z.number().optional(),
        cpa: z.number().optional(),
        purchase_value: z.number().optional(),
        purchases: z.number().optional(),
        actions: z.array(z.unknown()).optional(),
        action_values: z.array(z.unknown()).optional(),
        cost_per_action_type: z.array(z.unknown()).optional(),
      })
    )
    .optional(),
});

export type PaidMetricsResponse = z.infer<typeof PaidMetricsResponseSchema>;

export type PaidMetricsRange =
  | { preset: "last_7d" | "last_14d" | "last_30d" }
  | { preset: "custom"; since: string; until: string };

export type PaidMetricsRequest = {
    brandId: string;
    platform?: "meta" | "google-ads" | "dv360" | "linkedin";
    accountId?: string;
    campaignId?: string;
    adsetId?: string;
    range: PaidMetricsRange;
    forceRefresh?: boolean;
};
