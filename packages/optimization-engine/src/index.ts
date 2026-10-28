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
export {
  DISPLACEMENT_MIN_BASELINE_SHARE,
  DISPLACEMENT_SET_DELIVERY_HELD,
  DISPLACEMENT_SHARE_COLLAPSE,
  DRAG_SPEND_SHARE,
  effectiveCreativeCount,
  evaluateCreative,
  LAGGARD_COST_MULTIPLE,
} from './creative';
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
// Stage D — is this ad set being SERVED? The question every performance ratio presumes
// an answer to, and the one nothing here could previously ask.
export {
  type AbsentAdset,
  countDarkDays,
  DARK_DAYS_THRESHOLD,
  type DeliveryEvaluation,
  calendarDayIn,
  evaluateDelivery,
  impressionsWeekOverWeek,
  OFF_META_FRESH_DAYS,
  REACH_EXHAUSTED_EXPANSION,
  reachExpansionOf,
  readDelivery,
  THROTTLED_IMPRESSION_RATIO,
} from './delivery';
export { reallocate } from './engine';
export type { EntityNounSource } from './entityNoun';
export { entityNoun, entityNounFor, platformName } from './entityNoun';
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
// Multi-platform: Google Ads and TikTok Ads entities through the same engine, and G27.
export * from './multiplatform/index';
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
export type { RuleTemplate, TemplateTitleContext } from './rules/templates';
export {
  ALL_TEMPLATES,
  BUILTIN_PARITY_TEMPLATES,
  DCO_ADAPTED_TEMPLATES,
  instantiateTemplate,
  seedParityRules,
  templateEvidence,
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
export {
  CAP_BINDING_SHARE,
  evaluateSettings,
  FLOOR_RELAXED_SHARE,
  UNDERSPEND_SHARE,
} from './settings';
export {
  adSetCpaInterval,
  costInterval,
  cpaInterval,
  shrinkScores,
  upperBoundMissingBecause,
} from './significance';
export type { SolverAllocation, SolverItem, SolverOutput } from './solver';
export { solve } from './solver';
// The title vocabulary every trigger composes from: Spanish result nouns, ISO money, the
// entity, and the action beside the sentence.
export {
  action as titleAction,
  currencyCode,
  entityOf,
  moneyPerResultUnit,
  resultNoun,
  resultNounPlural,
  title,
  titleMoney,
} from './title';
export type { TriggerOutput } from './triggers';
export { evaluateTriggers } from './triggers';
export type {
  AdSetSnapshot,
  AdSetStatus,
  AudienceType,
  BudgetMovePayload,
  Confidence,
  ConfidenceActionable,
  CpaInterval,
  CreativeAdSeries,
  CreativeStanding,
  CreativeStandingAd,
  CreativeStandingFlag,
  CycleResult,
  DeliveryRead,
  DeliverySignals,
  DeliveryState,
  ItemDiagnostics,
  OptimizationMode,
  OptimizationObjective,
  PacingResult,
  PacingState,
  PlatformHold,
  PlatformSignalPayload,
  ReallocationRefusal,
  ReallocationResult,
  Recommendation,
  RecommendationKind,
  RecommendationTrigger,
  RetentionMetrics,
  RetentionRates,
  RuleFamily,
  RuleSkip,
  ScaleStep,
  SettingsPatch,
  TrajectoryState,
  WindowMetrics,
} from './types';
export { PORTFOLIO_SCOPE } from './types';
export type { WindowKey } from './windows';
export { perDayOver, windowSpanDays } from './windows';

// NOTE: zod-backed IO schemas are intentionally NOT re-exported here — the root
// entry carries no zod schema of its own (the money formatter it takes from
// `@continuum/contracts` is the one runtime dependency). Import the schemas from
// the BE-safe subpath `@continuum/optimization-engine/schemas` (physical root
// shim), or via the canonical FE<->BE re-export in @continuum/contracts/optimization.
