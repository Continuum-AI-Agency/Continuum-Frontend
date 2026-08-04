import {
  type AboBudgetSummary,
  type AdSetSnapshot,
  AdSetSnapshotSchema,
  OptimizerSnapshotsEnvelopeSchema,
} from '@continuum/contracts';

export type AccountSnapshotsResult = {
  snapshots: AdSetSnapshot[];
  fetchedAt: string | null;
  budgetSummary: AboBudgetSummary | null;
};

/** Parse the reporting envelope while keeping observational ABO totals outside the engine's
 * AdSetSnapshot input shape. Older cache entries safely resolve to a null summary. */
export function parseOptimizerSnapshotEnvelope(value: unknown): AccountSnapshotsResult {
  const envelope = OptimizerSnapshotsEnvelopeSchema.parse(value);
  return {
    snapshots: AdSetSnapshotSchema.array().catch([]).parse(envelope.snapshots),
    fetchedAt: envelope.fetchedAt,
    budgetSummary: envelope.budgetSummary,
  };
}
