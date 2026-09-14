import { z } from 'zod';
import { conversationDataPlatformSchema } from '../agents/conversation-data-scope';

export const paidCurrencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((currency) => currency.toUpperCase());

export const paidCreativeAudienceSegmentSchema = z.object({
  audienceCellId: z.string().min(1),
  observedAt: z.string().min(1),
  source: z.enum(['meta_graph', 'audience_group_publish']),
  adsetCount: z.number().int().nonnegative(),
  eligibleAds: z.number().int().nonnegative(),
  spend: z.number().nonnegative(),
  spendShare: z.number().min(0).max(1).nullable().default(null),
  targetingBasis: z.enum(['as_of_performance_day', 'current', 'unknown']).default('unknown'),
  ageMin: z.number().int().nonnegative().nullable().default(null),
  ageMax: z.number().int().nonnegative().nullable().default(null),
  genders: z.array(z.number().int()).max(3).default([]),
  geoCount: z.number().int().nonnegative().default(0),
  customAudienceCount: z.number().int().nonnegative().default(0),
  excludedCustomAudienceCount: z.number().int().nonnegative().default(0),
  geoNodeIds: z.array(z.string().min(1)).max(20).default([]),
  customAudienceIds: z.array(z.string().min(1)).max(20).default([]),
  excludedCustomAudienceIds: z.array(z.string().min(1)).max(20).default([]),
  publisherPlatforms: z.array(z.string()).max(20).default([]),
  placements: z.array(z.string()).max(50).default([]),
  devicePlatforms: z.array(z.string()).max(20).default([]),
});
export type PaidCreativeAudienceSegment = z.infer<typeof paidCreativeAudienceSegmentSchema>;

export const paidCreativeAudienceEvidenceSchema = z
  .object({
    label: z.string().min(1).nullable().default(null),
    source: z.string().min(1).nullable().default(null),
    coverage: z.enum(['known', 'partial', 'unknown']).default('unknown'),
    temporalBasis: z
      .enum(['as_of_performance_day', 'current', 'mixed', 'unknown'])
      .default('unknown'),
    coveredAds: z.number().int().nonnegative().default(0),
    eligibleAds: z.number().int().nonnegative().default(0),
    coveredSpend: z.number().nonnegative().default(0),
    spendCoverage: z.number().min(0).max(1).nullable().default(null),
    segments: z.array(paidCreativeAudienceSegmentSchema).max(8).default([]),
  })
  .superRefine((audience, ctx) => {
    if (audience.coverage !== 'unknown' && audience.source === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source'],
        message: 'known or partial audience coverage requires a source',
      });
    }
  });
export type PaidCreativeAudienceEvidence = z.infer<typeof paidCreativeAudienceEvidenceSchema>;

export const paidCreativeEvidenceMetricsSchema = z.object({
  spend: z.number().nonnegative().nullable(),
  impressions: z.number().nonnegative().nullable(),
  reach: z.number().nonnegative().nullable(),
  clicks: z.number().nonnegative().nullable(),
  conversions: z.number().nonnegative().nullable(),
  ctr: z.number().nonnegative().nullable(),
  cpm: z.number().nonnegative().nullable(),
  cpc: z.number().nonnegative().nullable(),
  cpa: z.number().nonnegative().nullable(),
  roas: z.number().nonnegative().nullable(),
});
export type PaidCreativeEvidenceMetrics = z.infer<typeof paidCreativeEvidenceMetricsSchema>;

export const paidCreativeAngleEvidenceV1Schema = z.object({
  schemaVersion: z.literal(1),
  creativeId: z.string().min(1),
  assetId: z.string().min(1),
  platform: conversationDataPlatformSchema,
  accountId: z.string().min(1),
  currency: paidCurrencyCodeSchema.nullable().default(null),
  campaignId: z.string().min(1).nullable().default(null),
  groupId: z.string().min(1).nullable().default(null),
  angle: z.string().min(1),
  hook: z.string().min(1),
  format: z.string().min(1),
  /** Omission is explicit unknown coverage; it never implies a measured audience. */
  audience: paidCreativeAudienceEvidenceSchema.default({
    label: null,
    source: null,
    coverage: 'unknown',
    coveredAds: 0,
    eligibleAds: 0,
    coveredSpend: 0,
    spendCoverage: null,
    temporalBasis: 'unknown',
    segments: [],
  }),
  reportingWindow: z.object({
    since: z.string().min(1),
    until: z.string().min(1),
  }),
  objectiveName: z.string().min(1),
  kpiName: z.string().min(1),
  metrics: paidCreativeEvidenceMetricsSchema,
  sampleSize: z.number().int().nonnegative().nullable(),
  verdict: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  provenance: z.object({
    source: z.string().min(1),
    capturedAt: z.string().min(1),
  }),
});
export type PaidCreativeAngleEvidenceV1 = z.infer<typeof paidCreativeAngleEvidenceV1Schema>;
