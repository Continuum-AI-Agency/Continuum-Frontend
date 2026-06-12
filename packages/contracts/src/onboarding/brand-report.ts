import { z } from "zod";
import { httpUrlSchema, integrationProviderEnum } from "./_shared";
import { targetAudienceSchema } from "./target-audience";
import { websiteSummarySchema } from "./website-summary";
import { businessSummarySchema } from "./business-summary";
import type { BrandProfile } from "./brand-profile";
import type { ReadinessAnalysis } from "./readiness";
import type { FirstImpression } from "./first-impression";

export type BrandReportSection =
  | "brand_profile"
  | "voice"
  | "audience"
  | "website"
  | "business"
  | "readiness"
  | "first_impression";

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
export type BackendSectionStatus = "running" | "done" | "skipped" | "error";

export type BrandReportEnrichSection =
  | BrandReportSection
  | `audit.${BrandReportSection}`
  | "first_impression";

export type SectionAudit = {
  score: number;
  severity: "low" | "medium" | "high";
  findings: Array<{
    headline: string;
    detail: string;
    recommendation: string;
  }>;
};

export type BrandReportSectionAudits = {
  voice?: SectionAudit;
  audience?: SectionAudit;
  website?: SectionAudit;
  business?: SectionAudit;
};

export type BrandUnderstanding = {
  positioning_thesis: string;
  hypothesis_icp: string;
  brand_pillars: string[];
  tonal_signal: string;
  notable_evidence: string[];
  content_pillars?: string[] | null;
};

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
  notes: z.string().max(600).default(""),
});
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;

export const documentsSummarySchema = z.object({
  primary_topics: z.array(z.string().min(1).max(120)).max(15).default([]),
  secondary_topics: z.array(z.string().min(1).max(120)).max(15).default([]),
  notes: z.string().max(600).default(""),
});
export type DocumentsSummary = z.infer<typeof documentsSummarySchema>;

export const competitorSnapshotSchema = z.object({
  name: z.string().min(1).max(120),
  reason: z.string().max(300).nullable().optional(),
  source: z.enum(["generated", "retrieval", "scrape", "manual"]).default("generated"),
});
export type CompetitorSnapshot = z.infer<typeof competitorSnapshotSchema>;

export const onboardingReportStructuredSchema = z.object({
  connected_accounts: z.array(connectedAccountSchema).default([]),
  website: websiteSummarySchema,
  documents: documentsSummarySchema,
  target_audience: targetAudienceSchema.default({}),
  competitors: z.array(competitorSnapshotSchema).max(8).default([]),
  business: businessSummarySchema.nullable().optional(),
});
export type OnboardingReportStructured = z.infer<typeof onboardingReportStructuredSchema>;

export type BrandReportResult = {
  brand_profile: BrandProfile;
  structured: OnboardingReportStructured;
  understanding: BrandUnderstanding;
  audits: BrandReportSectionAudits;
  readiness: ReadinessAnalysis | null;
  first_impression: FirstImpression | null;
  prompt_version: number;
  citations: GroundingCitations;
};

export type BrandReportStatus = "ok" | "partial" | "error";
