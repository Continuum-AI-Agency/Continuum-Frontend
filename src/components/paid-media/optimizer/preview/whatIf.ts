// Read-only account baseline for portfolio onboarding. Optimizer execution is
// backend-owned; the browser never imports or runs the allocation engine.

import type { AdSetSnapshot, OptimizationObjective } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';

export type CampaignRow = {
  adsetId: string;
  name: string;
  currentBudget: number;
  spend14: number;
  conv14: number;
};

/** The account's ad sets "today" — current budget + trailing-14d spend/conversions,
 *  before any optimization. */
export function campaignRows(
  snapshots: AdSetSnapshot[],
  objective: OptimizationObjective,
): CampaignRow[] {
  // Derived, not restated. A local copy of the objective -> KPI-field map is a fourth
  // place for it to drift from the engine, the SQL and the verdicts — and a preview that
  // counts a different event than the cycle it is previewing is worse than no preview.
  const kpi = getOptimizationMetricDefinition(objective).kpiField;
  return snapshots
    .map((snapshot) => {
      const d14 = snapshot.windows?.d14 as Record<string, number> | undefined;
      return {
        adsetId: snapshot.id,
        name: snapshot.name ?? snapshot.id,
        currentBudget: snapshot.currentBudget ?? 0,
        spend14: typeof d14?.spend === 'number' ? d14.spend : 0,
        conv14: typeof d14?.[kpi] === 'number' ? d14[kpi] : 0,
      };
    })
    .sort((a, b) => b.spend14 - a.spend14);
}
