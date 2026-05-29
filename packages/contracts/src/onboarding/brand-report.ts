import type { BrandProfile } from "./brand-profile";
import type { TargetAudience } from "./target-audience";
import type { WebsiteSummary } from "./website-summary";
import type { BusinessSummary } from "./business-summary";
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

export type OnboardingReportStructured = {
  connected_accounts: Array<{
    platform: string;
    primary_url?: string | null;
    notes: string;
  }>;
  website: WebsiteSummary;
  documents: {
    primary_topics: string[];
    secondary_topics: string[];
    notes: string;
  };
  target_audience: TargetAudience;
  business?: BusinessSummary | null;
};

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
