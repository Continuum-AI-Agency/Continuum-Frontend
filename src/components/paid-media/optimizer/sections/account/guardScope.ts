// Which figures a fired guard casts doubt over.
//
// A guard that cannot say WHICH readings it invalidates is decoration, and two surfaces that
// answer that question differently are worse than one that answers it badly. The account read
// marks the cards it poisons; the lead card says whether the ONE figure it leads with is among
// them. Same map, one place.

import type { AccountCandidate, AccountDetector } from '@continuum/contracts';

/** Everything priced off a conversion count reads the broken instrument; the economics guard
 *  only reaches the two that compare against a target. */
const DOUBTED_BY: Record<string, readonly AccountDetector[]> = {
  measurement_integrity: [
    'dead_tail',
    'portfolio_reallocation',
    'account_pacing',
    'scale_readiness',
    'decision_window',
  ],
  target_economics: ['scale_readiness', 'portfolio_reallocation'],
};

export function doubtedBy(guards: readonly AccountCandidate[]): Set<AccountDetector> {
  const doubted = new Set<AccountDetector>();
  for (const guard of guards) {
    for (const detector of DOUBTED_BY[guard.detector] ?? []) doubted.add(detector);
  }
  return doubted;
}

/** What a single guard poisons, in catalogue order. Used to name the scope on the lead card. */
export function scopeOf(guard: AccountCandidate): readonly AccountDetector[] {
  return DOUBTED_BY[guard.detector] ?? [];
}
