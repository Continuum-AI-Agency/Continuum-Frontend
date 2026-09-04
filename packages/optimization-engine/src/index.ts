export type {
  AdSetSeries,
  BacktestReport,
  DailyRow,
  EvalSample,
  ObjectivePredictiveness,
  WindowPredictiveness,
} from './backtest';
export { backtestPredictiveness, buildEvalSamples, spearman } from './backtest';
export {
  classifyPortfolio,
  classifyStatus,
  isCreativeEvaluable,
  NEW_ITEM_LOCK_DAYS,
} from './classify';
export { confidenceOf, portfolioConfidence } from './confidence';
export type { DeepPartial, EngineConfig, WindowWeights } from './config';
export { DEFAULT_CONFIG, resolveConfig } from './config';
export { DRAG_SPEND_SHARE, evaluateCreative, LAGGARD_COST_MULTIPLE } from './creative';
export type {
  BucketItem,
  CreativeBucket,
  RankBucketsOptions,
} from './creativeBuckets';
export {
  bucketCitations,
  canonicalKey,
  labelTokens,
  rankCreativeBuckets,
} from './creativeBuckets';
export { reallocate } from './engine';
export type { BudgetMoveWhy, ExplainDiagnostics } from './explain';
export {
  budgetMoveWhy,
  freezeLabel,
  moveReasonText,
  velocityCapTruncated,
} from './explain';
export { evaluateFatigue } from './fatigue';
// Hierarchical (tree-aware) generalization of `shrinkScores` in ./significance:
// shrink each node toward its parent's already-shrunk estimate instead of one
// flat cohort mean. Pure, zero-dependency — safe for this dependency-free barrel.
export type {
  ShrinkTreeErrorCode,
  ShrinkTreeFlag,
  ShrinkTreeOptions,
  ShrunkNode,
  TreeNodeInput,
} from './hierarchy/shrinkTree';
export { ShrinkTreeError, shrinkTree } from './hierarchy/shrinkTree';
export type { AdAttributionDay, AdDailyRow, MetaMetricRow } from './ingest';
export {
  addRetentionMetrics,
  addWindowMetrics,
  attachCreativeSeries,
  META_FIELD_MAP,
  mapAdDailyRowToRetention,
  mapAdDailyRowToWindowMetrics,
  mapMetaRowToWindowMetrics,
  retentionRates,
} from './ingest';
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
export { evalCondition, evaluateRules, interpolateReason } from './rules/evaluate';
export { buildAdsetFacts, buildPortfolioFacts } from './rules/facts';
export type { ResolvedValue } from './rules/operators';
export { OPERATORS } from './rules/operators';
export type { RuleTemplate } from './rules/templates';
export {
  ALL_TEMPLATES,
  BUILTIN_PARITY_TEMPLATES,
  DCO_ADAPTED_TEMPLATES,
  instantiateTemplate,
  seedParityRules,
} from './rules/templates';
export type {
  AlreadyFlagged,
  ConditionValue,
  FactMap,
  FactRef,
  FactValue,
  GrantableActionKind,
  RuleAction,
  RuleActionKind,
  RuleCondition,
  RuleConditionLeaf,
  RuleDefinition,
  RuleEngineOutput,
  RuleEvaluation,
  RuleFinding,
  RuleOperator,
  RuleSeverity,
} from './rules/types';
export { GRANTABLE_ACTION_KINDS } from './rules/types';
export type { CycleOptions } from './runCycle';
export { runCycle } from './runCycle';
export { costPerEvent, kpiEvents, scoreAdSet, windowScore } from './scoring';
export { adSetCpaInterval, costInterval, cpaInterval, shrinkScores } from './significance';
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
  CreativeAdSeries,
  CreativeStanding,
  CreativeStandingAd,
  CreativeStandingFlag,
  CycleResult,
  ItemDiagnostics,
  OptimizationMode,
  OptimizationObjective,
  PacingResult,
  PacingState,
  ReallocationResult,
  Recommendation,
  RecommendationKind,
  RecommendationTrigger,
  RetentionMetrics,
  RetentionRates,
  TrajectoryState,
  WindowMetrics,
} from './types';

// NOTE: zod-backed IO schemas are intentionally NOT re-exported here — the root
// entry stays pure/dependency-free. Import them from the BE-safe subpath
// `@continuum/optimization-engine/schemas` (physical root shim), or via the
// canonical FE<->BE re-export in @continuum/contracts/optimization.
