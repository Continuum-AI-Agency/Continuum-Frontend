export { reallocate } from './engine';
export { runCycle } from './runCycle';
export type { CycleOptions } from './runCycle';
export { classifyStatus, classifyPortfolio, NEW_ITEM_LOCK_DAYS } from './classify';
export { evaluateTriggers } from './triggers';
export type { TriggerOutput } from './triggers';
export { computePacing } from './pacing';
export { scoreAdSet, cpp, windowScore } from './scoring';
export { solve } from './solver';
export { DEFAULT_CONFIG, resolveConfig } from './config';
export type { EngineConfig, DeepPartial, WindowWeights } from './config';
export type {
  AdSetSnapshot,
  AdSetStatus,
  WindowMetrics,
  ItemDiagnostics,
  ReallocationResult,
  TrajectoryState,
  AudienceType,
  OptimizationMode,
  Recommendation,
  PacingState,
  PacingResult,
  CycleResult,
} from './types';
export type { SolverItem, SolverOutput, SolverAllocation } from './solver';
