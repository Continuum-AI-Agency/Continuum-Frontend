import { z } from 'zod';
import { competitiveGapRowSchema } from '../competitor-spy/gapReport';
import { brandDnaSchema } from '../onboarding/brand-dna';
import { readinessAnalysisSchema } from '../onboarding/readiness';
import { aeoSnapshotCardSchema } from '../organic/aeo';

export const brandIntelligenceEvidenceModeSchema = z.enum(['observed', 'inferred', 'simulated']);
export type BrandIntelligenceEvidenceMode = z.infer<typeof brandIntelligenceEvidenceModeSchema>;

export const brandIntelligenceEvidenceSourceSchema = z.enum([
  'brand_book',
  'brand_report',
  'brand_competitor_registry',
  'competitor_spy',
  'aeo_snapshot',
]);
export type BrandIntelligenceEvidenceSource = z.infer<typeof brandIntelligenceEvidenceSourceSchema>;

export const brandIntelligenceEvidenceRefSchema = z
  .object({
    source: brandIntelligenceEvidenceSourceSchema,
    recordId: z.string().nullable(),
    observedAt: z.string().nullable(),
    label: z.string().nullable().default(null),
    url: z.string().url().nullable().default(null),
  })
  .strict();
export type BrandIntelligenceEvidenceRef = z.infer<typeof brandIntelligenceEvidenceRefSchema>;

export const brandIntelligenceSectionSchema = z.enum([
  'identity',
  'competitors',
  'creative_competition',
  'answer_visibility',
]);
export type BrandIntelligenceSection = z.infer<typeof brandIntelligenceSectionSchema>;

export const brandIntelligenceSectionProgressSchema = z.enum([
  'queued',
  'running',
  'ready',
  'missing',
  'error',
]);
export type BrandIntelligenceSectionProgress = z.infer<
  typeof brandIntelligenceSectionProgressSchema
>;

export const brandIntelligenceLifecycleSchema = z
  .object({
    runId: z.string().uuid().nullable(),
    status: z.enum(['idle', 'queued', 'running', 'ready', 'error']),
    trigger: z.enum(['onboarding', 'source_change', 'manual', 'backfill']).nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    heartbeatAt: z.string().nullable(),
    sections: z.record(brandIntelligenceSectionSchema, brandIntelligenceSectionProgressSchema),
    error: z.string().nullable(),
  })
  .strict();
export type BrandIntelligenceLifecycle = z.infer<typeof brandIntelligenceLifecycleSchema>;

export const brandIntelligenceScoreBandSchema = z.enum(['strong', 'developing', 'limited']);
export type BrandIntelligenceScoreBand = z.infer<typeof brandIntelligenceScoreBandSchema>;

export const brandIntelligenceScoreSchema = z
  .object({
    value: z.number().min(0).max(100).nullable(),
    band: brandIntelligenceScoreBandSchema.nullable(),
    label: z.string().min(1),
    explanation: z.string().min(1),
    measured: z.boolean(),
  })
  .strict();
export type BrandIntelligenceScore = z.infer<typeof brandIntelligenceScoreSchema>;

export const brandIntelligenceScorecardSchema = z
  .object({
    identityReadiness: brandIntelligenceScoreSchema,
    evidenceCoverage: brandIntelligenceScoreSchema,
    competitorCoverage: brandIntelligenceScoreSchema,
    observedVisibility: brandIntelligenceScoreSchema,
  })
  .strict();
export type BrandIntelligenceScorecard = z.infer<typeof brandIntelligenceScorecardSchema>;

export const brandIntelligenceCoverageSchema = z
  .object({
    section: brandIntelligenceSectionSchema,
    status: z.enum(['available', 'missing', 'error']),
    mode: brandIntelligenceEvidenceModeSchema,
    observedAt: z.string().nullable(),
    limitations: z.array(z.string()).default([]),
    error: z.string().nullable().default(null),
  })
  .strict();
export type BrandIntelligenceCoverage = z.infer<typeof brandIntelligenceCoverageSchema>;

export const brandIntelligenceIdentitySchema = z
  .object({
    dna: brandDnaSchema.nullable(),
    readiness: readinessAnalysisSchema.nullable(),
    evidenceRefs: z.array(brandIntelligenceEvidenceRefSchema).default([]),
  })
  .strict();
export type BrandIntelligenceIdentity = z.infer<typeof brandIntelligenceIdentitySchema>;

export const brandIntelligenceCompetitorSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    registryId: z.string().nullable(),
    trackedId: z.string().nullable(),
    status: z.enum(['recommended', 'tracked', 'archived']),
    approvalStatus: z.enum(['pending', 'approved', 'not_applicable']),
    source: z.enum(['onboarding', 'user', 'auto', 'deep_analysis']),
    websiteUrl: z.string().url().nullable(),
    instagramUsername: z.string().nullable(),
    identityResolved: z.boolean(),
    insight: z.string().nullable(),
    strategicSummary: z.string().nullable(),
    keyMessaging: z.array(z.string()).default([]),
    evidenceRefs: z.array(brandIntelligenceEvidenceRefSchema).default([]),
  })
  .strict();
export type BrandIntelligenceCompetitor = z.infer<typeof brandIntelligenceCompetitorSchema>;

export const creativeCompetitionSummarySchema = z
  .object({
    status: z.enum(['assembling', 'ready', 'empty', 'error', 'missing']),
    windowDays: z.number().int().positive().nullable(),
    refreshedAt: z.string().nullable(),
    attributionNote: z.string().nullable(),
    sourceCounts: z
      .object({
        competitors: z.number().int().nonnegative(),
        competitorSnapshots: z.number().int().nonnegative(),
        competitorV2Labeled: z.number().int().nonnegative(),
        ownAds: z.number().int().nonnegative(),
        ownLabeled: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    gapCategoryCounts: z
      .object({
        they_scale_you_absent: z.number().int().nonnegative(),
        they_scale_you_losing: z.number().int().nonnegative(),
        you_win_they_ignore: z.number().int().nonnegative(),
        shared_battleground: z.number().int().nonnegative(),
      })
      .strict(),
    topGaps: z.array(competitiveGapRowSchema).max(8),
    evidenceRefs: z.array(brandIntelligenceEvidenceRefSchema).default([]),
  })
  .strict();
export type CreativeCompetitionSummary = z.infer<typeof creativeCompetitionSummarySchema>;

export const answerVisibilitySummarySchema = z
  .object({
    snapshot: aeoSnapshotCardSchema.nullable(),
    methodology: z
      .object({
        mode: z.literal('simulated'),
        engine: z.string().nullable(),
        citationsVerified: z.literal(false),
        limitations: z.array(z.string()).min(1),
      })
      .strict(),
    evidenceRefs: z.array(brandIntelligenceEvidenceRefSchema).default([]),
  })
  .strict();
export type AnswerVisibilitySummary = z.infer<typeof answerVisibilitySummarySchema>;

export const brandIntelligenceOpportunitySchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(['answer_visibility', 'creative_competition']),
    category: z.enum(['answer_visibility', 'positioning', 'messaging', 'creative', 'source_gap']),
    priority: z.enum(['high', 'medium', 'low']),
    title: z.string().min(1),
    rationale: z.string().min(1),
    recommendedAction: z.string().min(1),
    handoffTarget: z
      .enum(['agent_prompt', 'draft_post', 'faq_brief', 'comparison_brief', 'creative_brief'])
      .nullable(),
    evidenceRefs: z.array(brandIntelligenceEvidenceRefSchema).min(1),
  })
  .strict();
export type BrandIntelligenceOpportunity = z.infer<typeof brandIntelligenceOpportunitySchema>;

export const brandIntelligenceOverviewSchema = z
  .object({
    brandId: z.string().uuid(),
    schemaVersion: z.number().int().positive(),
    generatedAt: z.string().min(1),
    refreshedAt: z.string().nullable(),
    sourceVersions: z.record(z.string(), z.string().nullable()),
    status: z.enum(['ready', 'partial', 'empty']),
    enrichment: brandIntelligenceLifecycleSchema,
    scorecard: brandIntelligenceScorecardSchema,
    identity: brandIntelligenceIdentitySchema,
    competitors: z.array(brandIntelligenceCompetitorSchema),
    creativeCompetition: creativeCompetitionSummarySchema,
    answerVisibility: answerVisibilitySummarySchema,
    opportunities: z.array(brandIntelligenceOpportunitySchema),
    coverage: z.array(brandIntelligenceCoverageSchema).length(4),
  })
  .strict();
export type BrandIntelligenceOverview = z.infer<typeof brandIntelligenceOverviewSchema>;

export const brandIntelligenceEnrichResponseSchema = z
  .object({
    runId: z.string().uuid(),
    status: z.enum(['queued', 'running']),
    reused: z.boolean(),
  })
  .strict();
export type BrandIntelligenceEnrichResponse = z.infer<typeof brandIntelligenceEnrichResponseSchema>;
