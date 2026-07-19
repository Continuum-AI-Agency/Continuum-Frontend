// The CBO->ABO changeover preview: joins a campaign section's ad-set rows (today's
// spend/results context, budget held at the campaign) with the convert edge's dryRun
// per-ad-set budgets (what each would receive after conversion). Pure and read-only —
// the same backend-owned-execution posture as preview/whatIf.ts.

import type { AdSetSnapshot, OptimizationObjective } from '@continuum/contracts';
import { getOptimizationMetricDefinition, metaCurrencyOffset } from '@continuum/contracts';
import type { CampaignSection } from '../picker/campaignGroups';

export type ConvertBudget = {
  adset_id: string;
  adset_name?: string | null;
  daily_major: number;
};

export type ConvertPreviewRow = {
  adsetId: string;
  name: string;
  spend14: number | null;
  cpa: number | null;
  newDailyBudget: number;
};

export type ConvertPreviewTotals = {
  campaignBudgetToday: number;
  newDailyTotal: number;
  adsetCount: number;
};

/** One row per convert budget, enriched with the section's trailing-14d context when
 *  the ad set is known to the picker (a budget can reference an ad set the snapshot
 *  read missed — it still previews, just without spend context). */
export function convertPreviewRows(
  section: CampaignSection,
  budgets: ConvertBudget[],
): ConvertPreviewRow[] {
  const byId = new Map(section.adsets.map((adset) => [adset.id, adset]));
  return budgets.map((budget) => {
    const known = byId.get(budget.adset_id);
    return {
      adsetId: budget.adset_id,
      name: known?.name ?? budget.adset_name?.trim() ?? budget.adset_id,
      spend14: known ? known.spend14 : null,
      cpa: known ? known.cpa : null,
      newDailyBudget: budget.daily_major,
    };
  });
}

/** The headline the dialog leads with: the campaign-held budget today versus the sum
 *  of per-ad-set daily budgets the conversion would establish. */
export function convertPreviewTotals(
  section: CampaignSection,
  rows: ConvertPreviewRow[],
): ConvertPreviewTotals {
  return {
    campaignBudgetToday: section.totalBudget,
    newDailyTotal: rows.reduce((sum, row) => sum + row.newDailyBudget, 0),
    adsetCount: rows.length,
  };
}

// The objective ladder the convert preview scores against — the same declarable
// currencies onboarding offers (the engine-internal `clicks` fallback is never a
// user objective). Order is stable so ties resolve deterministically.
const PREVIEW_OBJECTIVES: OptimizationObjective[] = [
  'purchase',
  'app_install',
  'signup',
  'lead',
  'conversations',
  'traffic',
  'link_clicks',
  'thruplays',
  'post_engagement',
  'awareness',
];

/** The objective to preview the post-convert cycle under: the KPI the plurality of the
 *  campaign's ad sets already DECLARE (Meta optimization_goal → kpiField), reversed to an
 *  objective through the shared metric map. There is no portfolio yet, so the campaign's
 *  own dominant currency is the honest lens — scoring a messaging campaign on a guessed
 *  `purchase` default would freeze every ad set kpi_mismatch. Falls back to `purchase`. */
export function resolvePreviewObjective(snapshots: AdSetSnapshot[]): OptimizationObjective {
  const counts = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (snapshot.kpiField) counts.set(snapshot.kpiField, (counts.get(snapshot.kpiField) ?? 0) + 1);
  }
  let best: OptimizationObjective = 'purchase';
  let bestCount = 0;
  for (const objective of PREVIEW_OBJECTIVES) {
    const kpiField = getOptimizationMetricDefinition(objective).kpiField;
    const count = counts.get(kpiField) ?? 0;
    if (count > bestCount) {
      best = objective;
      bestCount = count;
    }
  }
  return best;
}

/** Project what each ad set's ABO daily budget WOULD be, without asking the convert edge.
 *
 *  This mirrors the split policy in `supabase/functions/optimizer-convert-cbo/compute.ts`
 *  (`buildConvertBudgets`), which is the source of truth for what a real conversion writes:
 *    dailyMajor = spend7 > 0 ? spend7 / 7 : 0
 *    minor      = max(round(dailyMajor * offset), minMinor)   // clamp UP to the account min
 *    daily_major = minor / offset                             // agrees with the minor written
 *
 *  Why mirror instead of import: that module is Deno-side and pulls `../_shared/*`, which the
 *  bundler cannot resolve — the same constraint that made optimizer-cycle-preview duplicate its
 *  request shape. The currency offset itself is NOT re-derived here; it comes from contracts, the
 *  one table both sides already share. `convertProjectionParity` below pins this to the documented
 *  policy so a drift shows up as a failing test rather than a wrong budget on screen.
 *
 *  Analysis only. Projecting a conversion is not performing one: nothing here calls Meta, and a
 *  real convert still goes through the edge's dryRun, which stays authoritative. */
export function projectAboBudgets(
  snapshots: AdSetSnapshot[],
  options: { currency: string | null | undefined; minDailyBudgetMinor: number },
): ConvertBudget[] {
  const offset = metaCurrencyOffset(options.currency);
  return snapshots.map((snapshot) => {
    const spend7 = snapshot.windows?.d7?.spend ?? 0;
    const dailyMajor = spend7 > 0 ? spend7 / 7 : 0;
    const minor = Math.max(Math.round(dailyMajor * offset), options.minDailyBudgetMinor);
    return {
      adset_id: snapshot.id,
      adset_name: snapshot.name ?? null,
      daily_major: minor / offset,
    };
  });
}

/** The ad sets whose projected budget is the assumed account FLOOR rather than their own
 *  trailing spend — the only rows the assumed minimum can move (everything that spent
 *  projects off its own spend7). Kept beside `projectAboBudgets` so the clamp lives in one
 *  file: a UI note that says "these sit on an assumed minimum" must agree with the clamp
 *  that actually put them there. */
export function floorClampedAdsetIds(
  snapshots: AdSetSnapshot[],
  options: { currency: string | null | undefined; minDailyBudgetMinor: number },
): string[] {
  const offset = metaCurrencyOffset(options.currency);
  return snapshots
    .filter((snapshot) => {
      const spend7 = snapshot.windows?.d7?.spend ?? 0;
      const ownMinor = Math.round((spend7 > 0 ? spend7 / 7 : 0) * offset);
      return ownMinor < options.minDailyBudgetMinor;
    })
    .map((snapshot) => snapshot.id);
}

/** The as-if-converted fleet for a set of held CBO ad sets, ready to hand to the engine.
 *  Projects the budgets, then stamps them onto the snapshots — the two steps the convert
 *  dialog performs against a real dryRun, collapsed into one pure call the suggester can
 *  make for a campaign it has only READ. */
export function projectPostConvertSnapshots(
  heldSnapshots: AdSetSnapshot[],
  options: { currency: string | null | undefined; minDailyBudgetMinor: number },
): AdSetSnapshot[] {
  return synthesizePostConvertSnapshots(heldSnapshots, projectAboBudgets(heldSnapshots, options));
}

/** Synthesize the post-convert ad-set fleet the "Preview as converted" expander feeds the
 *  engine: each held CBO ad set given its dryRun ABO budget as its new ad-set daily budget,
 *  freeze cleared and status active — exactly the state the ingest would read AFTER the
 *  convert lands. One snapshot per convert budget (a budget for an ad set the snapshot read
 *  missed is skipped: without its window metrics the engine has nothing to score). Nothing
 *  here writes anything; it is the input to the read-only /cycle/preview run. */
export function synthesizePostConvertSnapshots(
  heldSnapshots: AdSetSnapshot[],
  budgets: ConvertBudget[],
): AdSetSnapshot[] {
  const snapshotById = new Map(heldSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  const postConvert: AdSetSnapshot[] = [];
  for (const budget of budgets) {
    const held = snapshotById.get(budget.adset_id);
    if (!held) continue;
    const { freeze: _freeze, freezeReason: _freezeReason, ...rest } = held;
    postConvert.push({ ...rest, status: 'active', currentBudget: budget.daily_major });
  }
  return postConvert;
}
