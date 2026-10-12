// ---------------------------------------------------------------------------
// Stage A — classify(): derive each ad set's status from its data, BEFORE the
// budget solver runs. Manual states (frozen) and trigger-set states
// (flagged/starved) are respected and never overwritten here.
// ---------------------------------------------------------------------------

import type { EngineConfig } from './config';
import { isPlatformLearning, protectDaysFor, tiktokCampaignResults7d } from './multiplatform/learning';
import type { AdSetSnapshot, AdSetStatus, FreezeReason } from './types';

/** Days a brand-new ad set has its budget fully locked (no movement at all). */
export const NEW_ITEM_LOCK_DAYS = 3;

/**
 * Freeze reasons that say "we have no authority over this ad set's budget" and NOTHING
 * about whether its numbers can be read.
 *
 * A CBO or lifetime-budget ad set has no daily budget of its own, so the reallocation
 * genuinely has nothing to move — that is what these freezes are for. They are not a
 * statement that the ad set is unmeasurable, and every other reason IS: `kpi_mismatch`
 * and `no_declared_objective` mean we would be pricing it in the wrong currency, and
 * `no_conversions` means there is nothing to price at all.
 */
const BUDGET_AUTHORITY_FREEZES: ReadonlySet<FreezeReason> = new Set<FreezeReason>([
  'no_own_budget',
  'unsupported_budget',
  'lifetime_budget',
]);

/**
 * Can the non-budget triggers (fatigue F1/F2, creative C1/C2/C3) judge this ad set?
 *
 * Those stages emit approval-gated SUGGESTIONS — refresh the creative, expand the
 * audience, pause one ad, make variants. None of them moves money, so the test that
 * gates them must be about whether the ad set's numbers are trustworthy, not about
 * whether the solver may touch its budget.
 *
 * Both stages used to reuse the budget test, and on a live account that silenced the
 * best creative evidence we had: four Vivo47 ad sets carrying $18,297 of spend and 401
 * conversations over 14 days sat frozen `no_own_budget` because their campaign owns the
 * budget (CBO). Every creative trigger skipped them — and CBO is exactly the case where
 * swapping the creative is the ONLY lever left, because the budget one is gone.
 *
 * `flagged` (a human hard-excluded it) and `starved` (already recommended for pause)
 * still exclude, and a frozen-for-any-other-reason ad set still excludes.
 */
export function isCreativeEvaluable(s: AdSetSnapshot): boolean {
  if (s.status === 'flagged' || s.status === 'starved') return false;
  if (s.status !== 'frozen' && !s.freeze) return true;
  return s.freezeReason != null && BUDGET_AUTHORITY_FREEZES.has(s.freezeReason);
}

/**
 * `campaignResults7d` is TikTok's learning input (its campaign's d7 results); every other
 * platform ignores it. Absent on the Meta path, which classifies exactly as it always has.
 */
export function classifyStatus(
  s: AdSetSnapshot,
  cfg: EngineConfig,
  campaignResults7d?: number,
): AdSetStatus {
  // Respect states that come from manual action or upstream triggers.
  if (s.freeze) return 'frozen';
  if (s.status === 'frozen' || s.status === 'flagged' || s.status === 'starved') {
    return s.status;
  }

  // First few days: lock the budget entirely (treated as frozen for the cycle).
  if (s.ageDays < NEW_ITEM_LOCK_DAYS) return 'frozen';

  // New item still in its protection window: grace (Tier-3 average score). PMax gets 14.
  if (s.ageDays < protectDaysFor(s, cfg)) return 'grace';

  // Platform learning phase, by each platform's own definition. On Meta: few conversions
  // in 7d (counted on the objective's KPI) OR still young — the engine's original proxy.
  if (isPlatformLearning(s, cfg, campaignResults7d)) return 'learning';

  return 'active';
}

/** Apply classification to a whole portfolio (returns new snapshots). */
export function classifyPortfolio(snapshots: AdSetSnapshot[], cfg: EngineConfig): AdSetSnapshot[] {
  const tiktokCampaigns = tiktokCampaignResults7d(snapshots, cfg);
  return snapshots.map((s) => {
    const campaignResults =
      s.platform === 'tiktok_ads' && s.campaignId ? tiktokCampaigns.get(s.campaignId) : undefined;
    const status = classifyStatus(s, cfg, campaignResults);
    return {
      ...s,
      status,
      // keep an explicit learningPhase flag consistent with the status
      learningPhase: status === 'learning' ? true : (s.learningPhase ?? false),
      freeze: status === 'frozen' ? true : (s.freeze ?? false),
    };
  });
}
