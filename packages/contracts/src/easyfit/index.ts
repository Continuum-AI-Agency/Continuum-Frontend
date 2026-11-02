import type { EasyfitAttributionRow } from './attribution';
import type { EasyfitDashboardPayload } from './dashboard-payload';
import type { EasyfitEngineInput } from './engine-input';

export * from './attribution';
export * from './config';
export * from './dashboard-payload';
export * from './engine-input';
export * from './phone';
export * from './prototype-adapter';

/**
 * The engine entry point the Backend implements
 * (`Continuum-Backend/App/modules/easyfit/engine`): pure, deterministic, no I/O.
 * Same input, same payload.
 */
export type ComputeEasyfitDashboard = (input: EasyfitEngineInput) => EasyfitDashboardPayload;

/** The per-alta attribution the dashboard aggregates from; exposed for storage and parity checks. */
export type ComputeEasyfitAttribution = (input: EasyfitEngineInput) => EasyfitAttributionRow[];
