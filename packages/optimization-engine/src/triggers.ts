// ---------------------------------------------------------------------------
// Stage B — pause TRIGGERS. These never pause automatically: they produce
// recommendations (always needs user approval) and mark the ad set 'starved'
// so the solver drives its budget down to the floor in the meantime.
//   P1 — zero upper funnel (fast, 3d)
//   P2 — sustained poor vs a ROBUST reference (P25 of CPP_14d), 14d
//   P3 — low significance / dead weight (spent enough, ~zero results), 14d
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import { cpp } from './scoring';
import { scoreAdSet } from './scoring';
import type { AdSetSnapshot, Recommendation } from './types';

const isEvaluable = (s: AdSetSnapshot): boolean =>
  s.status !== 'frozen' && s.status !== 'flagged';

/** Lower-percentile ("robust best") of a sorted-ascending numeric array. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  const idx = Math.min(v.length - 1, Math.max(0, Math.round((p / 100) * (v.length - 1))));
  return v[idx];
}

export type TriggerOutput = {
  recommendations: Recommendation[];
  starveIds: Set<string>;
};

export function evaluateTriggers(
  snapshots: AdSetSnapshot[],
  cfg: EngineConfig,
): TriggerOutput {
  const recs: Recommendation[] = [];
  const starve = new Set<string>();

  // Robust reference CPP: P25 of CPP_14d over evaluable items with purchase data.
  const cpp14s = snapshots
    .filter((s) => isEvaluable(s) && s.windows.d14.purchases > 0)
    .map((s) => cpp(s.windows.d14));
  const robustBestCpp = percentile(cpp14s, 25);

  // Portfolio average ATC cost (for P1 relative comparison).
  const atcCosts = snapshots
    .filter((s) => isEvaluable(s) && s.windows.d3.addToCarts > 0)
    .map((s) => s.windows.d3.spend / s.windows.d3.addToCarts);
  const avgAtcCost = atcCosts.length ? atcCosts.reduce((a, b) => a + b, 0) / atcCosts.length : 0;

  const floor = Math.max(
    (cfg.cpaTarget * cfg.floorMinSignals) / cfg.floorWindowDays,
    0,
  );

  for (const s of snapshots) {
    if (!isEvaluable(s)) continue;
    if (s.ageDays <= cfg.newItemProtectDays) continue; // grace blocks P1/P3
    const d3 = s.windows.d3;
    const d14 = s.windows.d14;
    const traj = scoreAdSet(s, cfg).trajectoryState;

    // P1 — zero upper funnel (fast)
    const atcCost3d = d3.addToCarts > 0 ? d3.spend / d3.addToCarts : Infinity;
    const p1 =
      d3.spend > floor &&
      d3.purchases === 0 &&
      (d3.addToCarts === 0 ||
        (avgAtcCost > 0 && atcCost3d > cfg.upperFunnelOverrideMult * avgAtcCost));
    if (p1) {
      recs.push({
        adSetId: s.id, kind: 'pause', trigger: 'P1_zero_upper_funnel', severity: 'high',
        reason: `Spent ${d3.spend.toFixed(0)} over 3d with 0 conversions and null / ${cfg.upperFunnelOverrideMult}× upper-funnel cost vs portfolio average.`,
        needsApproval: true,
      });
      starve.add(s.id);
      continue;
    }

    // P2 — sustained poor vs robust reference (skip if recovering)
    if (d14.purchases > 0 && robustBestCpp > 0 && traj !== 'positive') {
      const cpp14 = cpp(d14);
      if (cpp14 > cfg.sustainedPoorMultiplier * robustBestCpp) {
        recs.push({
          adSetId: s.id, kind: 'pause', trigger: 'P2_sustained_poor', severity: 'medium',
          reason: `CPP 14d $${cpp14.toFixed(0)} > ${cfg.sustainedPoorMultiplier}× the robust reference ($${robustBestCpp.toFixed(0)}), with no recent improvement.`,
          needsApproval: true,
        });
        starve.add(s.id);
        continue;
      }
    }

    // P3 — low significance / dead weight (spent enough, ~zero results)
    if (d14.purchases === 0 && s.windows.d7.purchases === 0 && d14.spend > cfg.cpaTarget) {
      recs.push({
        adSetId: s.id, kind: 'pause', trigger: 'P3_low_significance', severity: 'low',
        reason: `Spent $${d14.spend.toFixed(0)} over 14d (> 1 target CPA) with 0 conversions: dead weight.`,
        needsApproval: true,
      });
      starve.add(s.id);
    }
  }

  return { recommendations: recs, starveIds: starve };
}
