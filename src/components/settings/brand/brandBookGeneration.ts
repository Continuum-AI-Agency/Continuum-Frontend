import type {
  AgentRequestPayload,
  OnboardingPreviewEvent,
  PreviewSection,
} from "@/lib/onboarding/agentClient";

// The Brand Book empty state can kick off a first-time brand-report generation
// (the same durable `preview` run onboarding uses). These pure helpers drive the
// generation panel's progress line and decide whether we have enough of a brand
// profile to run at all — kept out of the client component so they're unit-tested
// without a DOM.

export type BrandBookGenerationPayload = AgentRequestPayload;

const SECTION_LABELS: Record<PreviewSection, string> = {
  brand_profile: "brand profile",
  voice: "brand voice",
  audience: "audience",
  website: "website",
  business: "business model",
  strategy: "strategy",
  guidelines: "guidelines",
  readiness: "readiness",
  first_impression: "first impression",
};

export function brandBookSectionLabel(section: PreviewSection): string {
  return SECTION_LABELS[section] ?? section;
}

// Maps a preview stream event to a short, human progress line for the panel.
// Returns null for events that don't warrant a visible status change (deltas,
// pings, per-section payloads, errors surfaced via toast instead).
export function brandBookGenerationStatus(event: OnboardingPreviewEvent): string | null {
  switch (event.type) {
    case "run":
      return "Starting analysis…";
    case "status":
      return event.status === "running"
        ? `Analyzing ${brandBookSectionLabel(event.section)}…`
        : null;
    case "complete":
      return event.status === "error" ? null : "Finalizing your Brand Book…";
    default:
      return null;
  }
}

// A run needs an existing brand_profile id plus a user and brand name for the
// run context — otherwise the preview endpoint 400s. Narrows null away on success.
export function canGenerateBrandBook(
  payload: BrandBookGenerationPayload | null | undefined,
): payload is BrandBookGenerationPayload {
  if (!payload) return false;
  const hasBrand =
    typeof payload.brandProfile?.id === "string" &&
    payload.brandProfile.id.length > 0 &&
    typeof payload.brandProfile?.brand_name === "string" &&
    payload.brandProfile.brand_name.length > 0;
  const hasContext =
    typeof payload.runContext?.user_id === "string" &&
    payload.runContext.user_id.length > 0 &&
    typeof payload.runContext?.brand_name === "string" &&
    payload.runContext.brand_name.length > 0;
  return hasBrand && hasContext;
}
