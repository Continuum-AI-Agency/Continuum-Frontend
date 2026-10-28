import {
  type AboBudgetSummary,
  type AdSetSnapshot,
  AdSetSnapshotSchema,
  type AdsetTargeting,
  type InactiveAdsetWindows,
  OptimizerSnapshotsEnvelopeSchema,
} from '@continuum/contracts';

export type AccountSnapshotsResult = {
  snapshots: AdSetSnapshot[];
  fetchedAt: string | null;
  budgetSummary: AboBudgetSummary | null;
  /** Each ad set's live targeting spec, carried beside the fleet; [] from an older edge. */
  targeting: AdsetTargeting[];
  /** Ad sets paused inside the window, windows only — for figures, never the engine; [] from
   *  an older edge. */
  inactiveWindows: InactiveAdsetWindows[];
  /** The ad account's IANA timezone, which dated the windows; null from an older edge. */
  timezone: string | null;
};

/** Parse the reporting envelope while keeping observational ABO totals outside the engine's
 * AdSetSnapshot input shape. Older cache entries safely resolve to a null summary. */
export function parseOptimizerSnapshotEnvelope(value: unknown): AccountSnapshotsResult {
  const envelope = OptimizerSnapshotsEnvelopeSchema.parse(value);
  return {
    snapshots: AdSetSnapshotSchema.array().catch([]).parse(envelope.snapshots),
    fetchedAt: envelope.fetchedAt,
    budgetSummary: envelope.budgetSummary,
    targeting: envelope.targeting,
    inactiveWindows: envelope.inactiveWindows,
    timezone: envelope.timezone,
  };
}
