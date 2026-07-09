// ---------------------------------------------------------------------------
// Stage A — classify(): derive each ad set's status from its data, BEFORE the
// budget solver runs. Manual states (frozen) and trigger-set states
// (flagged/starved) are respected and never overwritten here.
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import type { AdSetSnapshot, AdSetStatus } from './types';

/** Days a brand-new ad set has its budget fully locked (no movement at all). */
export const NEW_ITEM_LOCK_DAYS = 3;

export function classifyStatus(s: AdSetSnapshot, cfg: EngineConfig): AdSetStatus {
  // Respect states that come from manual action or upstream triggers.
  if (s.freeze) return 'frozen';
  if (s.status === 'frozen' || s.status === 'flagged' || s.status === 'starved') {
    return s.status;
  }

  // First few days: lock the budget entirely (treated as frozen for the cycle).
  if (s.ageDays < NEW_ITEM_LOCK_DAYS) return 'frozen';

  // New item still in its protection window: grace (Tier-3 average score).
  if (s.ageDays < cfg.newItemProtectDays) return 'grace';

  // Platform learning phase: few conversions in 7d OR still young.
  const conv7d = s.windows.d7.purchases;
  if (conv7d < cfg.learningConvThreshold || s.ageDays < cfg.learningMinDays) {
    return 'learning';
  }

  return 'active';
}

/** Apply classification to a whole portfolio (returns new snapshots). */
export function classifyPortfolio(
  snapshots: AdSetSnapshot[],
  cfg: EngineConfig,
): AdSetSnapshot[] {
  return snapshots.map((s) => {
    const status = classifyStatus(s, cfg);
    return {
      ...s,
      status,
      // keep an explicit learningPhase flag consistent with the status
      learningPhase: status === 'learning' ? true : s.learningPhase ?? false,
      freeze: status === 'frozen' ? true : s.freeze ?? false,
    };
  });
}
