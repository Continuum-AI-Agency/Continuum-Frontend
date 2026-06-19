// The pure paid-insight model now lives in @continuum/contracts so the Frontend
// (browser) and the Backend (server-side generation) share one implementation.
// This module re-exports it to keep existing Frontend import paths stable. The
// Frontend's CampaignPerformanceRow / BudgetPacingResponse are structurally
// assignable to the model's input types, so call sites pass them unchanged.

export {
  buildCampaignInsightDataPoints,
  buildGeneratedCampaignInsights,
  primaryMetricFor,
  primaryStatusFor,
  computeInsightFingerprint,
  type CampaignInsightMetric,
  type CampaignInsightStatus,
  type CampaignInsightDataPoint,
  type GeneratedCampaignInsight,
} from "@continuum/contracts";
