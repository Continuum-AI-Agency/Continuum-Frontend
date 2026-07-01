// Reusable identity fragments shared by every paid-media metric row (ranking
// leaderboards + the diagnostics tier). A row must state its own aggregation
// `level` explicitly and carry the id + name of every level at or above it, so
// a consumer never has to infer the level from the parent `scope` or correlate
// separate label fields. Google's "ad group" maps onto `adset`.

import { z } from "zod";

// Aggregation level a single metric row reports at. `account` = a whole
// ad-account rollup (cross-platform spend); campaign > adset > ad is the drill
// chain. Google ad groups are reported as `adset`.
export const paidEntityLevelSchema = z.enum(["account", "campaign", "adset", "ad"]);
export type PaidEntityLevel = z.infer<typeof paidEntityLevelSchema>;

// One node of a row's identity chain: the id and human-readable name of a
// single level. `name` is nullable because upstream APIs can omit it.
export const entityRefSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
});
export type EntityRef = z.infer<typeof entityRefSchema>;

// Full identity chain for a row. Every level at or above the row's own `level`
// is populated; deeper levels are omitted (a campaign row carries `campaign`
// only; an ad row carries campaign + adset + ad).
export const entityHierarchySchema = z.object({
  campaign: entityRefSchema.optional(),
  adset: entityRefSchema.optional(),
  ad: entityRefSchema.optional(),
});
export type EntityHierarchy = z.infer<typeof entityHierarchySchema>;

// The separator used to join hierarchy names into a `path_label`
// ("Campaign › Ad set › Ad"). U+203A (single right-pointing angle quotation).
export const ENTITY_PATH_SEPARATOR = " › ";

// Build the composite "Campaign › Ad set › Ad" label from a hierarchy, skipping
// levels whose name is missing. Producer-side helper; never throws.
export function buildEntityPathLabel(hierarchy: EntityHierarchy): string {
  return [hierarchy.campaign?.name, hierarchy.adset?.name, hierarchy.ad?.name]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(ENTITY_PATH_SEPARATOR);
}
