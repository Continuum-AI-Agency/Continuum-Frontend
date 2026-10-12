// The rows of the Performance tab's "cost per result per ad set" table.
//
// The cost column reads the engine's own interval (diagnostics.ci: the 14-day cost and the
// events it was computed from). The results column used to read a DIFFERENT source — the
// account snapshot's d7 window, joined by ad-set id — and that read lists ACTIVE ad sets only
// (paid-media-metrics, meta/adset-snapshots.ts: effective_status ['ACTIVE']). A portfolio
// whose ad sets were paused, or sit in a paused campaign, still has scored cycle rows but no
// snapshot to join, so every row printed "—" leads beside a measured cost, while the hero
// (the brief's growth read) said 59. Even when the join landed, the leads were 7 days and the
// cost 14.
//
// The count now comes from the same interval as the cost: one source, one window, and the
// two columns can always be divided into each other. Only a row the engine did not score
// (no interval at all) falls back to the snapshot.

import type {
  AdSetSnapshot,
  CycleItemRow,
  OptimizationMetricDefinition,
} from '@continuum/contracts';
import { itemToRow, type OptimizerAdsetRow } from '../../kpiColumns';

/** The events the engine scored the ad set on, or null when it carries no interval. */
export function scoredEvents(item: CycleItemRow): number | null {
  const events = item.diagnostics?.ci?.events;
  return typeof events === 'number' && Number.isFinite(events) && events >= 0 ? events : null;
}

export function adsetTableRows(
  items: readonly CycleItemRow[],
  opts: {
    metric: OptimizationMetricDefinition;
    snapshotById: ReadonlyMap<string, AdSetSnapshot>;
    nameById: Map<string, string>;
  },
): OptimizerAdsetRow[] {
  return items.map((item) => {
    const row = itemToRow(item, {
      metric: opts.metric,
      snapshot: opts.snapshotById.get(item.adset_id) ?? null,
      nameById: opts.nameById,
    });
    const events = scoredEvents(item);
    return events == null ? row : { ...row, results: events };
  });
}
