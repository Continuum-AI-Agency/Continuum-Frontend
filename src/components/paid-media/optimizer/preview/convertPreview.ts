// The CBO->ABO changeover preview: joins a campaign section's ad-set rows (today's
// spend/results context, budget held at the campaign) with the convert edge's dryRun
// per-ad-set budgets (what each would receive after conversion). Pure and read-only —
// the same backend-owned-execution posture as preview/whatIf.ts.

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
