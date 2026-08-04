import { z } from 'zod';
import { httpUrlSchema, integrationProviderEnum } from './_shared';
import { brandDeepSchema } from './brand-deep';
import { brandGuidelinesSchema } from './brand-guidelines';
import { type BrandProfile, brandProfileSchema } from './brand-profile';
import { brandStrategySchema } from './brand-strategy';
import { businessSummarySchema } from './business-summary';
import { type FirstImpression, firstImpressionSchema } from './first-impression';
import { type ReadinessAnalysis, readinessAnalysisSchema } from './readiness';
import { targetAudienceSchema } from './target-audience';
import { websiteSummarySchema } from './website-summary';

// Single-source section enum — both the Backend (runSection) and the Frontend
// response interpreter derive from this Zod enum (no parallel hand-rolled
// unions). Adding a section here flows to both sides.
export const brandReportSectionSchema = z.enum([
  'brand_profile',
  'voice',
  'audience',
  'website',
  'business',
  'strategy',
  'guidelines',
  'readiness',
  'first_impression',
]);
export type BrandReportSection = z.infer<typeof brandReportSectionSchema>;

// Sections that emit a late enrich event. `audit.<section>` are the per-section
// scores (prose + synthesis sections). `deep.<section>` are the T2 deep-analysis
// lane sub-sections, filled asynchronously by the durable deep job after
// `complete`. brand_profile/readiness/first_impression are never audited.
export const brandReportEnrichSectionSchema = z.union([
  brandReportSectionSchema,
  z.enum([
    'audit.voice',
    'audit.audience',
    'audit.website',
    'audit.business',
    'audit.strategy',
    'audit.guidelines',
    'deep.narrative',
    'deep.messaging',
    'deep.product',
    'deep.personas',
    'deep.competition',
  ]),
]);

/**
 * Per-section lifecycle states emitted by the backend over SSE.
 *
 * - `running`: section runner is in flight.
 * - `done`: section returned a parsed value; payload was emitted as `data`.
 * - `skipped`: section runner exhausted all retries on a soft failure.
 *   The run continues; the section's value is null/absent in the final result.
 *   **Not fatal** — FE should mark the section as unavailable but render the rest.
 * - `error`: section runner failed for a non-recoverable reason (abort,
 *   timeout, infra/auth). Still not run-fatal — `complete` carries the
 *   run-level outcome — but indicates something out-of-band.
 *
 * FE may compose a local superset (e.g. add `"idle"` for a not-yet-started state)
 * but must not relabel any of the four backend states.
 */
export type BackendSectionStatus = 'running' | 'done' | 'skipped' | 'error';

export type BrandReportEnrichSection = z.infer<typeof brandReportEnrichSectionSchema>;

/**
 * Per-section quality observation produced alongside the section payload. The
 * `score` (0-100) is the per-section score the FE renders on each section card.
 * Canonical here so the Backend (emit) and Frontend (render) share one shape.
 */
export const sectionAuditSchema = z.object({
  score: z.number().int().min(0).max(100),
  severity: z.enum(['low', 'medium', 'high']),
  findings: z
    .array(
      z.object({
        // Bounds carry a 50% overflow allowance so a near-miss model output
        // doesn't reject the audit entirely (targets: headline ~160, detail
        // ~240, recommendation ~160 — accepted up to 1.5x each).
        headline: z.string().min(1).max(240),
        detail: z.string().min(1).max(360),
        recommendation: z.string().min(1).max(240),
      }),
    )
    .max(5)
    .default([]),
});
export type SectionAudit = z.infer<typeof sectionAuditSchema>;

export type BrandReportSectionAudits = {
  voice?: SectionAudit;
  audience?: SectionAudit;
  website?: SectionAudit;
  business?: SectionAudit;
  strategy?: SectionAudit;
  guidelines?: SectionAudit;
};

/**
 * Output of the comprehension agent — the shared brief every section agent
 * consumes. Canonical here (runtime Zod, not a TS mirror) so FE + BE share it.
 */
export const brandUnderstandingSchema = z.object({
  positioning_thesis: z.string().min(1).max(900),
  hypothesis_icp: z.string().min(1).max(600),
  brand_pillars: z.array(z.string().min(1).max(180)).min(1).max(9),
  tonal_signal: z.string().min(1).max(420),
  notable_evidence: z.array(z.string().max(420)).max(15).default([]),
  // Editorial anchors the downstream organic content engine uses to seed topic
  // clusters. 3-5 themes the brand can credibly own.
  content_pillars: z.array(z.string().min(2).max(120)).max(8).nullable().optional(),
});
export type BrandUnderstanding = z.infer<typeof brandUnderstandingSchema>;

export type GroundingCitation = {
  url: string;
  title?: string;
};

/** Keyed by the stage that surfaced them (comprehension, audience, business). */
export type GroundingCitations = Record<string, GroundingCitation[]>;

// Canonical structured-report object the Backend assembles and emits and the
// Frontend interpreter parses. Defined here (not hand-rolled per side) so the
// FE↔BE shape can't drift. Defaults mirror the Backend's assembly call.
export const connectedAccountSchema = z.object({
  platform: integrationProviderEnum,
  primary_url: httpUrlSchema.nullable().optional(),
  notes: z.string().max(600).default(''),
});
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;

export const documentsSummarySchema = z.object({
  primary_topics: z.array(z.string().min(1).max(120)).max(15).default([]),
  secondary_topics: z.array(z.string().min(1).max(120)).max(15).default([]),
  notes: z.string().max(600).default(''),
});
export type DocumentsSummary = z.infer<typeof documentsSummarySchema>;

export const competitorSnapshotSchema = z.object({
  name: z.string().min(1).max(120),
  reason: z.string().max(300).nullable().optional(),
  source: z.enum(['generated', 'retrieval', 'scrape', 'manual']).default('generated'),
});
export type CompetitorSnapshot = z.infer<typeof competitorSnapshotSchema>;

export const onboardingReportStructuredSchema = z.object({
  connected_accounts: z.array(connectedAccountSchema).default([]),
  website: websiteSummarySchema,
  documents: documentsSummarySchema,
  target_audience: targetAudienceSchema.default({}),
  competitors: z.array(competitorSnapshotSchema).max(8).default([]),
  business: businessSummarySchema.nullable().optional(),
  // First-class brand strategy + operational guidelines. Nullable + default null
  // so partial/legacy runs (and reports generated before these sections existed)
  // still parse. Populated by the Stage-4 synthesis wave.
  strategy: brandStrategySchema.nullable().default(null),
  guidelines: brandGuidelinesSchema.nullable().default(null),
});
export type OnboardingReportStructured = z.infer<typeof onboardingReportStructuredSchema>;

export const brandReportSectionAuditsSchema = z.object({
  voice: sectionAuditSchema.optional(),
  audience: sectionAuditSchema.optional(),
  website: sectionAuditSchema.optional(),
  business: sectionAuditSchema.optional(),
  strategy: sectionAuditSchema.optional(),
  guidelines: sectionAuditSchema.optional(),
});

export const groundingCitationSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
});

// Canonical, typed validator for the assembled report — the artifact the
// onboarding agent produces and the durable brand_report_composites store
// persists. Replaces the previous `z.object({}).loose()` blob boundary.
// Tolerant by design: audits / readiness / first_impression / citations /
// prompt_version default so it parses BOTH fresh runs and legacy composites
// (which strip `readiness` to its own table and predate `prompt_version`).
export const brandReportResultSchema = z.object({
  brand_profile: brandProfileSchema,
  structured: onboardingReportStructuredSchema,
  understanding: brandUnderstandingSchema,
  audits: brandReportSectionAuditsSchema.default({}),
  readiness: readinessAnalysisSchema.nullable().default(null),
  first_impression: firstImpressionSchema.nullable().default(null),
  // T2 deep-analysis lane (strategic narrative / messaging / product / personas /
  // competitive frame). Null until the durable deep job lands its first pass, so
  // legacy composites that predate the lane parse as `deep: null`.
  deep: brandDeepSchema.nullable().default(null),
  prompt_version: z.number().default(0),
  citations: z.record(z.string(), z.array(groundingCitationSchema)).default({}),
});
export type BrandReportResult = z.infer<typeof brandReportResultSchema>;

export type BrandReportStatus = 'ok' | 'partial' | 'error';
