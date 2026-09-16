import { z } from 'zod';

export const liveCreativeAudienceSourceSchema = z.object({
  evidenceRef: z.string().min(1),
  kind: z.enum([
    'meta_ads',
    'meta_adsets',
    'meta_insights_unbroken',
    'meta_insights_breakdown',
    'targeting_snapshot',
    'creative_classifier',
  ]),
  fetchedAt: z.string().min(1),
  cacheSource: z.enum(['fresh', 'memory', 'redis', 'database']),
  params: z.record(z.string(), z.unknown()),
});
export type LiveCreativeAudienceSource = z.infer<typeof liveCreativeAudienceSourceSchema>;

export const liveCreativeAudienceMetricsSchema = z.object({
  spend: z.number().nullable(),
  impressions: z.number().nullable(),
  clicks: z.number().nullable(),
  actions: z.record(z.string(), z.number()),
  actionValues: z.record(z.string(), z.number()),
  ctr: z.number().nullable(),
  cpc: z.number().nullable(),
  cpm: z.number().nullable(),
  primaryKpi: z.string().nullable(),
  primaryKpiCount: z.number().nullable(),
  primaryKpiCost: z.number().nullable(),
  conversionRate: z.number().nullable(),
  roas: z.number().nullable(),
});
export type LiveCreativeAudienceMetrics = z.infer<typeof liveCreativeAudienceMetricsSchema>;

export const liveCreativeAudienceRowSchema = z.object({
  rowId: z.string().min(1),
  account: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    currency: z.string().nullable(),
  }),
  campaignId: z.string().nullable(),
  adSetId: z.string().nullable(),
  ad: z.object({ id: z.string().min(1), name: z.string().nullable() }),
  creative: z.object({
    id: z.string().min(1),
    title: z.string().nullable(),
    previewUrl: z.string().nullable(),
    identityStatus: z.enum(['resolved', 'ambiguous_multi_asset']),
  }),
  creativeFingerprint: z.string().min(1),
  communicationAngle: z.object({
    label: z.string().nullable(),
    taxonomyVersion: z.number().int().positive(),
    classifierVersion: z.string().min(1),
    source: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    analyzedAt: z.string().nullable(),
  }),
  audience: z.object({
    evidenceKind: z.enum(['measured_delivery', 'configured_targeting']),
    dimensions: z.record(z.string(), z.string()),
    segmentKey: z.string().min(1),
    status: z.enum(['measured', 'unknown', 'suppressed', 'overlapping_snapshot', 'current_only']),
    effectiveFrom: z.string().nullable().default(null),
    effectiveUntil: z.string().nullable().default(null),
  }),
  metrics: liveCreativeAudienceMetricsSchema,
  evidenceRefs: z.array(z.string().min(1)).min(1),
});
export type LiveCreativeAudienceRow = z.infer<typeof liveCreativeAudienceRowSchema>;

export const liveCreativeAudienceRecommendationSchema = z.object({
  action: z.enum(['scale', 'iterate', 'stop']),
  rowId: z.string().min(1),
  creativeTitle: z.string().min(1),
  communicationAngle: z.string().min(1),
  audienceSegment: z.string().min(1),
  accountName: z.string().min(1),
  currency: z.string().nullable(),
  summary: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
});
export type LiveCreativeAudienceRecommendation = z.infer<
  typeof liveCreativeAudienceRecommendationSchema
>;

export const liveCreativeAudienceMatrixV1Schema = z.object({
  version: z.literal(1),
  datasetId: z.string().min(1),
  brandId: z.string().min(1),
  status: z.enum(['complete', 'partial', 'empty', 'too_large_get_only']),
  scope: z.array(z.object({ id: z.string(), name: z.string(), currency: z.string().nullable() })),
  window: z.object({
    since: z.string(),
    until: z.string(),
    requested_label: z.string().nullable(),
  }),
  attributionWindows: z.array(z.string()),
  breakdowns: z.array(z.enum(['age', 'gender'])).min(1),
  currencySlices: z.array(
    z.object({
      accountId: z.string(),
      currency: z.string().nullable(),
      deliveredSpend: z.number().nullable(),
      brokenDownSpend: z.number().nullable(),
      eligibleSpend: z.number().nullable(),
      spendRatio: z.number().nullable(),
      unreconciledSpend: z.number().nullable(),
      status: z.enum(['complete', 'partial', 'unknown']),
    }),
  ),
  sources: z.array(liveCreativeAudienceSourceSchema),
  coverage: z.object({
    deliveredSpend: z.number().nullable(),
    brokenDownSpend: z.number().nullable(),
    spendRatio: z.number().nullable(),
    unreconciledSpend: z.number().nullable(),
    status: z.enum(['complete', 'partial', 'unknown']),
  }),
  limitations: z.array(z.string()),
  rows: z.array(liveCreativeAudienceRowSchema),
  recommendations: z.array(liveCreativeAudienceRecommendationSchema),
  generatedAt: z.string(),
});
export type LiveCreativeAudienceMatrixV1 = z.infer<typeof liveCreativeAudienceMatrixV1Schema>;
