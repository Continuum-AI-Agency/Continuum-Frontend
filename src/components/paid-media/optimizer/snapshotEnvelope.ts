import {
  type AboBudgetSummary,
  type AdSetSnapshot,
  AdSetSnapshotSchema,
  type AdsetTargeting,
  OptimizerSnapshotsEnvelopeSchema,
} from '@continuum/contracts';

export type AccountSnapshotsResult = {
  snapshots: AdSetSnapshot[];
  fetchedAt: string | null;
  budgetSummary: AboBudgetSummary | null;
  /** Each ad set's live targeting spec, carried beside the fleet; [] from an older edge. */
  targeting: AdsetTargeting[];
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
  };
}
