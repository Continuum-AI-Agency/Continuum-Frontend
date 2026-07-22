import { z } from 'zod';

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

export type InsightCategory = 'formats' | 'placements' | 'audiences' | 'creative' | 'budget';

export type InsightSeverity = 'positive' | 'negative' | 'neutral';

export type InsightSource = 'computed' | 'llm';

export type ComputedInsight = {
  category: InsightCategory;
  text: string;
  severity: InsightSeverity;
  source: InsightSource;
  metric?: string;
  value?: number;
  delta?: number;
  recommendation?: string;
  estimated_impact?: string;
  campaign_id?: string;
  adset_id?: string;
};

export const ComputedInsightSchema = z.object({
  category: z.enum(['formats', 'placements', 'audiences', 'creative', 'budget']),
  text: z.string(),
  severity: z.enum(['positive', 'negative', 'neutral']),
  source: z.enum(['computed', 'llm']),
  metric: z.string().optional(),
  value: z.number().optional(),
  delta: z.number().optional(),
  recommendation: z.string().optional(),
  estimated_impact: z.string().optional(),
  campaign_id: z.string().optional(),
  adset_id: z.string().optional(),
});

export const DailyDataPointSchema = z.object({
  date: z.string(),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number(),
  conversions: z.number(),
  conversion_value: z.number(),
  roas: z.number(),
});

export type DailyDataPoint = z.infer<typeof DailyDataPointSchema>;

export const PeriodComparisonSchema = z.object({
  spend_delta_pct: z.number(),
  roas_delta_pct: z.number(),
  ctr_delta_pct: z.number(),
  conversions_delta_pct: z.number(),
});

export type PeriodComparison = z.infer<typeof PeriodComparisonSchema>;

export const AccountInsightsResponseSchema = z.object({
  insights: z.array(ComputedInsightSchema),
  generated_at: z.string(),
  expires_at: z.string().optional(),
  range: z.object({
    since: z.string(),
    until: z.string(),
    preset: z.string(),
  }),
  time_series: z.array(DailyDataPointSchema).optional(),
  period_comparison: PeriodComparisonSchema.optional(),
});

export type AccountInsightsResponse = z.infer<typeof AccountInsightsResponseSchema>;

export const CampaignInsightsResponseSchema = AccountInsightsResponseSchema.extend({
  campaign_id: z.string(),
  campaign_name: z.string().optional(),
  campaign_objective: z.string().optional(),
});

export type CampaignInsightsResponse = z.infer<typeof CampaignInsightsResponseSchema>;
