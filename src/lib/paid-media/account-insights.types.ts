import { z } from "zod";

export const PlacementBreakdownSchema = z.object({
  publisher_platform: z.string(),
  platform_position: z.string(),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  cpc: z.number(),
  conversions: z.number(),
  conversion_value: z.number(),
  roas: z.number(),
});

export const DemographicBreakdownSchema = z.object({
  age: z.string(),
  gender: z.string(),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  conversion_value: z.number(),
});

export const FormatBreakdownSchema = z.object({
  format: z.string(),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  cpc: z.number(),
  conversions: z.number(),
  conversion_value: z.number(),
  roas: z.number(),
});

export const DeviceBreakdownSchema = z.object({
  device_platform: z.string(),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
});

export const AccountBreakdownsResponseSchema = z.object({
  placements: z.array(PlacementBreakdownSchema),
  demographics: z.array(DemographicBreakdownSchema),
  formats: z.array(FormatBreakdownSchema),
  devices: z.array(DeviceBreakdownSchema),
  range: z.object({
    since: z.string(),
    until: z.string(),
    preset: z.string(),
  }),
});

export type PlacementBreakdown = z.infer<typeof PlacementBreakdownSchema>;
export type DemographicBreakdown = z.infer<typeof DemographicBreakdownSchema>;
export type FormatBreakdown = z.infer<typeof FormatBreakdownSchema>;
export type DeviceBreakdown = z.infer<typeof DeviceBreakdownSchema>;
export type AccountBreakdownsResponse = z.infer<typeof AccountBreakdownsResponseSchema>;

export type InsightCategory = "formats" | "placements" | "audiences" | "creative";

export type InsightSeverity = "positive" | "negative" | "neutral";

export type InsightSource = "computed" | "llm";

export type ComputedInsight = {
  category: InsightCategory;
  text: string;
  severity: InsightSeverity;
  source: InsightSource;
  metric?: string;
  value?: number;
  delta?: number;
};

export const ComputedInsightSchema = z.object({
  category: z.enum(["formats", "placements", "audiences", "creative"]),
  text: z.string(),
  severity: z.enum(["positive", "negative", "neutral"]),
  source: z.enum(["computed", "llm"]),
  metric: z.string().optional(),
  value: z.number().optional(),
  delta: z.number().optional(),
});

export const AccountInsightsResponseSchema = z.object({
  insights: z.array(ComputedInsightSchema),
  generated_at: z.string(),
  range: z.object({
    since: z.string(),
    until: z.string(),
    preset: z.string(),
  }),
});

export type AccountInsightsResponse = z.infer<typeof AccountInsightsResponseSchema>;
