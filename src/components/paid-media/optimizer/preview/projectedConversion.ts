// Turns a held CBO campaign into a PROJECTED ABO suggestion: what the campaign's ad sets
// would each be budgeted at after a convert, and the engine inputs that as-if-converted
// fleet would be scored under. Analysis only — nothing here converts anything, calls Meta,
// or writes. It exists so an all-CBO account is not a dead end at the suggestion step: the
// operator can evaluate a conversion before choosing to perform one.
//
// The projection math itself is NOT re-derived here. `projectAboBudgets` /
// `projectPostConvertSnapshots` in ./convertPreview mirror the deployed convert edge's split
// policy and are parity-tested against it; this module only composes them with the picker's
// campaign grouping and the display totals the cards need.

import type { AdSetSnapshot, OptimizationObjective } from '@continuum/contracts';
import type { CampaignSection } from '../picker/campaignGroups';
import type { CyclePreviewInput } from '../useOptimizerData';
import {
  type ConvertPreviewRow,
  type ConvertPreviewTotals,
  convertPreviewRows,
  convertPreviewTotals,
  floorClampedAdsetIds,
  projectAboBudgets,
  projectPostConvertSnapshots,
  resolvePreviewObjective,
} from './convertPreview';

/** The per-ad-set daily minimum the projection clamps up to, in MINOR currency units.
 *
 *  This is an ASSUMPTION, and the UI must say so. The authoritative minimum is learned from
 *  Meta by the convert edge and only comes back on a real dryRun; the ad-account read the
 *  Frontend has (`AdAccountSchema`) carries a currency but no minimum. 100 minor is Meta's
 *  near-universal floor (1.00 per day in a two-decimal currency), so it is the least-wrong
 *  stand-in — and it can only affect ad sets with no trailing spend, since everything that
 *  spent projects off its own spend7. Ad sets it DOES move are counted
 *  (`floorAdsetCount`) so the surface can flag exactly which numbers rest on the guess. */
export const ASSUMED_MIN_DAILY_BUDGET_MINOR = 100;

export type ProjectedConversion = {
  campaignId: string;
  campaignName: string;
  section: CampaignSection;
  /** The as-if-converted fleet: the campaign's held ad sets, budgeted, active, unfrozen. */
  postConvert: AdSetSnapshot[];
  rows: ConvertPreviewRow[];
  totals: ConvertPreviewTotals;
  /** The objective the projected cycle is scored under (the fleet's dominant declared KPI). */
  objective: OptimizationObjective;
  /** How many projected budgets rest on ASSUMED_MIN_DAILY_BUDGET_MINOR rather than on the
   *  ad set's own trailing spend. Above zero, the surface qualifies the total. */
  floorAdsetCount: number;
};

/** The campaign's held ad sets among a fleet-wide snapshot read. Held means the budget lives
 *  on the campaign (`unsupported_budget`) — the same predicate `buildCboCampaignSections`
 *  groups on, so a projection covers exactly the ad sets the section counted. */
function heldSnapshotsOf(snapshots: AdSetSnapshot[], campaignId: string): AdSetSnapshot[] {
  return snapshots.filter(
    (snapshot) =>
      snapshot.campaignId === campaignId && snapshot.freezeReason === 'unsupported_budget',
  );
}

/** Project one CBO campaign's conversion. Returns null when the campaign has no held ad sets
 *  in the current metrics read — there is nothing to project, and an empty card would imply
 *  a conversion buys nothing rather than that we cannot see it. */
export function buildProjectedConversion(
  section: CampaignSection,
  snapshots: AdSetSnapshot[],
  options: { currency: string | null | undefined },
): ProjectedConversion | null {
  const held = heldSnapshotsOf(snapshots, section.campaignId);
  if (held.length === 0) return null;

  const projectionOptions = {
    currency: options.currency,
    minDailyBudgetMinor: ASSUMED_MIN_DAILY_BUDGET_MINOR,
  };
  const budgets = projectAboBudgets(held, projectionOptions);
  const rows = convertPreviewRows(section, budgets);

  return {
    campaignId: section.campaignId,
    campaignName: section.campaignName,
    section,
    postConvert: projectPostConvertSnapshots(held, projectionOptions),
    rows,
    totals: convertPreviewTotals(section, rows),
    objective: resolvePreviewObjective(held),
    floorAdsetCount: floorClampedAdsetIds(held, projectionOptions).length,
  };
}

/** Every CBO campaign that can be projected, in the sections' existing order. */
export function buildProjectedConversions(
  sections: CampaignSection[],
  snapshots: AdSetSnapshot[],
  options: { currency: string | null | undefined },
): ProjectedConversion[] {
  const projections: ProjectedConversion[] = [];
  for (const section of sections) {
    const projection = buildProjectedConversion(section, snapshots, options);
    if (projection) projections.push(projection);
  }
  return projections;
}

/** The read-only /cycle/preview request for a projection: the real engine, over the projected
 *  fleet, at the projected total. `balanced` matches the convert dialog's as-if-converted
 *  preview so the two surfaces answer the same question the same way. */
export function projectedCyclePreviewInput(
  projection: ProjectedConversion,
  scope: { brandId: string; accountId: string },
): CyclePreviewInput {
  return {
    brandId: scope.brandId,
    accountId: scope.accountId,
    snapshots: projection.postConvert,
    objective: projection.objective,
    mode: 'balanced',
    total: projection.postConvert.reduce((sum, snapshot) => sum + snapshot.currentBudget, 0),
  };
}
