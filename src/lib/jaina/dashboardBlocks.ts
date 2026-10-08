// What a saved dashboard keeps of a report, and in what order it is read back.
//
// A dashboard is figures kept for later, and figures with no stated period are figures
// nobody can trust: four production rows carried no `data_scope` block at all, and the only
// window that survived was the one a person had typed into the free-text name. The report
// itself states its window exactly once — the `data_scope` frame the Backend composes from
// the datasets it actually read and emits FIRST — so a save keeps that frame even when the
// person hid it with a module toggle, and a reopen puts it back in front of the figures.
//
// `provenance.period` on the individual blocks is not a substitute: on a real row three of
// five blocks carried empty `since`/`until`. When the report has no scope frame, there is
// nothing honest to derive one from, and the save says so instead of keeping naked numbers.
//
// A save also records, per block, what it would take to re-run it for another window —
// the tool, the entity, the metric keys, the range, and whether the block is derived — so
// a dashboard is more than frozen figures. That is `spec`, derived from the blocks by the
// contracts package and never guessed.

import { type DashboardSpec, deriveDashboardSpec } from '@continuum/contracts';
import type { CheckpointBlockV2, CheckpointReportV2, DataScopeBlockV2 } from './schemas';

export const DASHBOARD_SCOPE_MISSING_MESSAGE =
  'This report does not state the period its figures cover (it has no data scope block), so it cannot be saved as a dashboard. Ask Jaina for the analysis over a named window, such as the last 30 days, and save that answer.';

export function findDataScopeBlock(blocks: readonly CheckpointBlockV2[]): DataScopeBlockV2 | null {
  return blocks.find((block): block is DataScopeBlockV2 => block.category === 'data_scope') ?? null;
}

/** The scope frame first, everything else in the order it was kept. */
export function orderDashboardBlocks<T extends { category: string }>(blocks: readonly T[]): T[] {
  const scope = blocks.filter((block) => block.category === 'data_scope');
  const rest = blocks.filter((block) => block.category !== 'data_scope');
  return [...scope, ...rest];
}

export type DashboardBlocksPlan =
  | { ok: true; blocks: CheckpointBlockV2[]; windowLabel: string; spec: DashboardSpec }
  | { ok: false; missing: 'data_scope'; message: string };

/**
 * The blocks a save persists for `visibleBlocks` of `report`, with the window they cover.
 *
 * The report's own `data_scope` frame is kept whether or not it is among the visible blocks,
 * and it goes first; `windowLabel` is that frame's human-readable window, which is what the
 * saved-dashboards strip prints next to the name. `spec` pairs each kept block with its
 * re-run spec, in the same order.
 */
export function prepareDashboardBlocks(
  report: Pick<CheckpointReportV2, 'blocks'>,
  visibleBlocks: readonly CheckpointBlockV2[],
): DashboardBlocksPlan {
  const scope = findDataScopeBlock(visibleBlocks) ?? findDataScopeBlock(report.blocks);
  if (!scope) {
    return { ok: false, missing: 'data_scope', message: DASHBOARD_SCOPE_MISSING_MESSAGE };
  }
  const withoutScope = visibleBlocks.filter((block) => block.category !== 'data_scope');
  const blocks = [scope, ...withoutScope];
  return { ok: true, blocks, windowLabel: scope.dates, spec: deriveDashboardSpec(blocks) };
}
