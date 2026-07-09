// Client-side "what-if" dry-run. The optimization engine is pure, dependency-free
// TypeScript, so we run a full reallocation cycle IN THE BROWSER against the
// account's real ad-set snapshots — no optimizer service / edge / VM needed. This
// previews exactly what the optimizer WOULD do if the operator enrolled these ad
// sets, before they commit. Nothing is persisted.

import type {
  AdSetSnapshot,
  CycleItemRow,
  OptimizationModeDto,
  OptimizationObjective,
} from '@continuum/contracts';
import { runCycle } from '@continuum/optimization-engine';

/** The conversion KPI field per objective (mirrors the engine OBJECTIVE_PROFILES). */
const KPI_FIELD: Record<OptimizationObjective, string> = {
  purchase: 'purchases',
  app_install: 'appInstalls',
  signup: 'signups',
  lead: 'leads',
  traffic: 'landingPageViews',
  awareness: 'impressions',
};

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
  const kpi = KPI_FIELD[objective];
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

/** A pause/refresh recommendation the dry-run would raise, flattened to the wire
 *  casing the FE renders (engine emits camelCase `adSetId`). Client-side what-if
 *  recs have no DB id, so the insight anchor keys them by content hash. */
export type WhatIfRecommendation = {
  adsetId: string;
  kind: string;
  trigger: string;
  severity: string;
  reason: string;
};

export type WhatIfResult = {
  /** Per-ad-set proposal in the shape the ReallocationFlow / CI viz already consume. */
  items: CycleItemRow[];
  recommendations: WhatIfRecommendation[];
  confidenceScore: number | null;
  confidenceBand: string | null;
  allocatedTotal: number;
  conserved: boolean;
};

/** Run the engine on the group's snapshots and map its per-item diagnostics into
 *  the CycleItemRow shape the existing optimizer visualizations render. */
export function runWhatIf(
  snapshots: AdSetSnapshot[],
  options: { objective: OptimizationObjective; mode: OptimizationModeDto; total: number },
): WhatIfResult | null {
  if (snapshots.length === 0) return null;

  const result = runCycle(snapshots, {
    objective: options.objective,
    mode: options.mode,
    total: options.total,
  });

  const items: CycleItemRow[] = result.reallocation.items.map((diag) => ({
    adset_id: diag.id,
    current_budget: diag.currentBudget,
    final_budget: diag.finalBudget,
    change_abs: diag.changeAbs,
    change_pct: diag.changePct,
    diagnostics: {
      ...(diag.ci ? { ci: diag.ci } : {}),
      ...(diag.freezeReason ? { freezeReason: diag.freezeReason } : {}),
    },
  }));

  const recommendations: WhatIfRecommendation[] = result.recommendations.map((rec) => ({
    adsetId: rec.adSetId,
    kind: rec.kind,
    trigger: rec.trigger,
    severity: rec.severity,
    reason: rec.reason,
  }));

  const confidence = result.confidence as { score?: number; band?: string };
  return {
    items,
    recommendations,
    confidenceScore: typeof confidence.score === 'number' ? confidence.score : null,
    confidenceBand: typeof confidence.band === 'string' ? confidence.band : null,
    allocatedTotal: result.reallocation.allocatedTotal,
    conserved: result.reallocation.conserved,
  };
}
