// Shared objective/mode vocabulary for the "Start from a suggestion" surface, so
// the compact suggestion card and the full-width SuggestionExplorer derive the
// same defaults from one source instead of each hand-rolling the map.

import type { OptimizationModeDto, OptimizationObjective } from '@continuum/contracts';

// `clicks` is deliberately absent: it is the engine's internal fallback, not a thing an
// advertiser chooses to buy. Everything else a Meta ad set can DECLARE is selectable —
// without `conversations` here, a messaging account could not create a portfolio that
// prices what it actually buys, and every one of its ad sets would sit frozen.
export const OBJECTIVES: OptimizationObjective[] = [
  'purchase',
  'app_install',
  'signup',
  'lead',
  'conversations',
  'traffic',
  'link_clicks',
  'thruplays',
  'post_engagement',
  'awareness',
];

export const MODES: OptimizationModeDto[] = ['efficiency', 'balanced', 'scale'];

// Per-objective default reallocation mode — mirrors optimizer-suggest's DEFAULT_MODE
// so changing the objective on a suggestion card re-derives the same mode the server
// would have chosen for that objective.
export const DEFAULT_MODE_BY_OBJECTIVE: Record<OptimizationObjective, OptimizationModeDto> = {
  purchase: 'balanced',
  app_install: 'scale',
  signup: 'scale',
  lead: 'efficiency',
  traffic: 'balanced',
  awareness: 'efficiency',
  // The objectives whose engine profiles are UNCALIBRATED (see optimization-engine
  // objectives.ts). We have no backtest telling us how hard these saturate, so they
  // default to `efficiency` — the mode that treats the planned total as a ceiling and
  // never force-spends on inventory it cannot vouch for. Guessing on the cautious side
  // costs a little reach; guessing on the other side costs someone else's money.
  conversations: 'efficiency',
  link_clicks: 'efficiency',
  thruplays: 'efficiency',
  post_engagement: 'efficiency',
  clicks: 'efficiency',
};

// Conversion objectives need tracked events to score; with 0 tracked conversions the
// first cycle is pause-all / Low-confidence. The suggestion card nudges toward Traffic.
export const CONVERSION_OBJECTIVES = new Set<OptimizationObjective>([
  'purchase',
  'app_install',
  'signup',
  'lead',
  // A messaging thread is a tracked conversion like any other: with none recorded, the
  // first cycle has nothing to score and the same nudge applies.
  'conversations',
]);
