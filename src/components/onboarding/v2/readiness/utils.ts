import type { ReadinessAnalysis, ReadinessDimension } from "@/lib/onboarding/agentClient";

export const DIMENSION_LABELS: Record<ReadinessDimension, string> = {
  value_proposition: "Value prop",
  icp_clarity: "ICP",
  customer_pains: "Customer pains",
  success_metrics: "Outcomes",
  positioning: "Positioning",
  messaging_coherence: "Messaging",
  brand_identity: "Identity",
};

export function scoreFor(readiness: ReadinessAnalysis | null, dim: ReadinessDimension): number | null {
  return readiness?.dimensions?.[dim]?.score ?? null;
}
