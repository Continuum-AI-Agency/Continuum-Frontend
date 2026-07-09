// Optimization-engine IO boundary, surfaced as canonical FE<->BE contracts.
//
// The single source of truth is @continuum/optimization-engine; these are
// re-exports per AGENTS.md §4 (every type that crosses the FE<->BE boundary
// lives in @continuum/contracts and is imported by both sides).
//
// Resolution note: the zod validators come from the `@continuum/optimization-
// engine/schemas` subpath, which is a PHYSICAL root-level file in that package
// — so the Backend's classic `node` resolution finds it (it ignores package
// `exports`). The pure types come from the engine's root entry, which is
// dependency-free. Both work in the Frontend (bundler) and Backend (node).

// Boundary types crossing FE<->BE (request snapshots + cycle results), from the
// pure (zod-free) root entry.
export type {
  AdSetSnapshot,
  AdSetStatus,
  AudienceType,
  Confidence,
  EngineConfig,
  OptimizationObjective,
  ReallocationResult,
  Recommendation,
  WindowMetrics,
  WindowWeights,
} from '@continuum/optimization-engine';
export type { ProposedAction } from '@continuum/optimization-engine/schemas';
// Runtime zod validators for the IO edge (API routes, DB rows, queue jobs).
export {
  AdSetSnapshotSchema,
  AdSetStatusSchema,
  AudienceTypeSchema,
  ConfidenceSchema,
  EngineConfigSchema,
  FreezeReasonSchema,
  OptimizationObjectiveSchema,
  ProposedActionSchema,
  WindowMetricsSchema,
  WindowWeightsSchema,
} from '@continuum/optimization-engine/schemas';
// Meta currency MAJOR->MINOR scaling, shared by the FE guardrail inputs, the apply
// ledger/audit keys, and the Graph budget write. Never hardcode *100.
export * from './currency';
// MCP umbrella IO contracts (optimizer_query read + optimizer_manage write).
export * from './mcp';
// Shared onboarding builders (suggestion→config, create→enroll) — the parity keystone.
export * from './onboarding';
// Optimizer-service orchestration DTOs (enrollment, run requests, FE read model).
export * from './service';
