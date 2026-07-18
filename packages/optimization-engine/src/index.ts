export type {
  AdSetSeries,
  BacktestReport,
  DailyRow,
  EvalSample,
  ObjectivePredictiveness,
  WindowPredictiveness,
} from './backtest';
export { backtestPredictiveness, buildEvalSamples, spearman } from './backtest';
export { classifyPortfolio, classifyStatus, NEW_ITEM_LOCK_DAYS } from './classify';
export { confidenceOf, portfolioConfidence } from './confidence';
export type { DeepPartial, EngineConfig, WindowWeights } from './config';
export { DEFAULT_CONFIG, resolveConfig } from './config';
export { DRAG_SPEND_SHARE, evaluateCreative, LAGGARD_COST_MULTIPLE } from './creative';
export { reallocate } from './engine';
export { evaluateFatigue } from './fatigue';
export type { MetaMetricRow } from './ingest';
export { META_FIELD_MAP, mapMetaRowToWindowMetrics } from './ingest';
// First wiring of the DCO-salvage miner: paid-creative-intel corroborates its
// win-rate categories with lift rules (and fires the `confounded` flag).
export type { AssociationRule, MinableItem, MiningResult } from './mining/apriori';
export { mineCreativeCombos } from './mining/apriori';
export type { ObjectiveProfile } from './objectives';
export { getObjectiveProfile, OBJECTIVE_PROFILES } from './objectives';
export { computePacing } from './pacing';
export type {
  BacktestSnapshotsOptions,
  BacktestSnapshotsResult,
  SnapshotsToSeriesOptions,
} from './realdata';
export { backtestSnapshots, KPI_FIELD_TO_OBJECTIVE, snapshotsToSeries } from './realdata';
export type { CycleOptions } from './runCycle';
export { runCycle } from './runCycle';
export { scoreAdSet, windowScore } from './scoring';
export { adSetCpaInterval, cpaInterval, shrinkScores } from './significance';
export type { SolverAllocation, SolverItem, SolverOutput } from './solver';
export { solve } from './solver';
export type { TriggerOutput } from './triggers';
export { evaluateTriggers } from './triggers';
export type {
  AdSetSnapshot,
  AdSetStatus,
  AudienceType,
  Confidence,
  CpaInterval,
  CycleResult,
  ItemDiagnostics,
  OptimizationMode,
  OptimizationObjective,
  PacingResult,
  PacingState,
  ReallocationResult,
  Recommendation,
  TrajectoryState,
  WindowMetrics,
} from './types';

// NOTE: zod-backed IO schemas are intentionally NOT re-exported here — the root
// entry stays pure/dependency-free. Import them from the BE-safe subpath
// `@continuum/optimization-engine/schemas` (physical root shim), or via the
// canonical FE<->BE re-export in @continuum/contracts/optimization.
