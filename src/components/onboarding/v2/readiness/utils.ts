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

// Display order — brand identity/positioning surface first, then value/ICP/business signals.
// Diverges intentionally from the backend READINESS_DIMENSIONS canonical order.
// _exhaustive below forces tsc to fail if the union of ReadinessDimension changes
// without this array being updated.
export const DIMENSION_DISPLAY_ORDER = [
  "brand_identity",
  "positioning",
  "messaging_coherence",
  "value_proposition",
  "icp_clarity",
  "customer_pains",
  "success_metrics",
] as const satisfies readonly ReadinessDimension[];
type _ExhaustiveDimensions = Exclude<ReadinessDimension, (typeof DIMENSION_DISPLAY_ORDER)[number]>;
const _exhaustive: [_ExhaustiveDimensions] extends [never] ? true : false = true;
void _exhaustive;
