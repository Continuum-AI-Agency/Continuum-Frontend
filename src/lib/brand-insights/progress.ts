export const BRAND_INSIGHTS_PROGRESS_STAGE_ORDER = [
  "awaiting_strategic_analysis",
  "queued",
  "scraping",
  "raw_search",
  "synthesis",
  "web_enrichment",
  "questions",
  "secondary_platform_eval",
  "persisting",
  "completed",
  "failed",
] as const;

export type BrandInsightsProgressStage = (typeof BRAND_INSIGHTS_PROGRESS_STAGE_ORDER)[number];

export type BrandInsightsProgressStep = {
  id: BrandInsightsProgressStage;
  label: string;
  status: "completed" | "current" | "pending";
};

const STAGE_LABELS: Record<BrandInsightsProgressStage, string> = {
  awaiting_strategic_analysis: "Awaiting Strategic Analysis",
  queued: "Queued",
  scraping: "Scraping",
  raw_search: "Raw Search",
  synthesis: "Synthesis",
  web_enrichment: "Web Enrichment",
  questions: "Questions",
  secondary_platform_eval: "Secondary Platform Eval",
  persisting: "Persisting",
  completed: "Completed",
  failed: "Failed",
};

export function isBrandInsightsProgressStage(value: string): value is BrandInsightsProgressStage {
  return (BRAND_INSIGHTS_PROGRESS_STAGE_ORDER as readonly string[]).includes(value);
}

function resolveCurrentStage(stage?: string | null, status?: string | null): BrandInsightsProgressStage {
  if (stage && isBrandInsightsProgressStage(stage)) {
    return stage;
  }

  if (status === "completed") {
    return "completed";
  }

  if (status === "failed" || status === "error" || status === "not_found") {
    return "failed";
  }

  return "queued";
}

export function buildBrandInsightsProgressSteps(input: {
  stage?: string | null;
  status?: string | null;
}): BrandInsightsProgressStep[] {
  const current = resolveCurrentStage(input.stage, input.status);
  const currentIndex = BRAND_INSIGHTS_PROGRESS_STAGE_ORDER.indexOf(current);

  return BRAND_INSIGHTS_PROGRESS_STAGE_ORDER.map((id, index) => ({
    id,
    label: STAGE_LABELS[id],
    status: index < currentIndex ? "completed" : index === currentIndex ? "current" : "pending",
  }));
}
