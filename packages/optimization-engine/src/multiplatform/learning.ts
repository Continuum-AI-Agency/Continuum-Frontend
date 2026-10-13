// ---------------------------------------------------------------------------
// What "learning" means on each platform, and the budget caps that follow from it.
//
// The engine's learning test (fewer than 50 KPI events in 7 days, or younger than 7 days)
// is Meta's. Applied to Google or TikTok it is simply wrong: Google REPORTS its learning
// state on the bid strategy, and TikTok reports none at all — it documents a threshold.
// Design: escenarios.html scenarios 11, 12, 13; google-acciones.html G13; tiktok.html §2.12.
// ---------------------------------------------------------------------------

import type { PlatformId } from '@continuum/contracts';
import type { EngineConfig } from '../config';
import { DEFAULT_CONFIG } from '../config';
import { getObjectiveProfile } from '../objectives';
import { kpiEvents } from '../scoring';
import type { AdSetSnapshot, OptimizationObjective } from '../types';

/** TikTok: "volatility starts to drop after about 25 campaign results or 7 days". */
export const TIKTOK_LEARNING_RESULTS = 25;
export const TIKTOK_LEARNING_DAYS = 7;
/** TikTok: "wait at least 2 days between targeting, bid or budget changes". */
export const TIKTOK_MIN_DAYS_BETWEEN_CHANGES = 2;
/** TikTok: keep a budget within 50% of the previous one; raise in steps of about 20%. */
export const TIKTOK_MAX_DECREASE_PCT = 0.5;
export const TIKTOK_MAX_INCREASE_PCT = 0.2;
/** Performance Max learns slower than an ad set: 14 days of protection, not 7. */
export const PMAX_PROTECT_DAYS = 14;

/** Google's bidding_strategy_system_status: LEARNING_NEW, LEARNING_SETTING_CHANGE,
 *  LEARNING_BUDGET_CHANGE, LEARNING_COMPOSITION_CHANGE, LEARNING_CONVERSION_TYPE_CHANGE… */
export function isGoogleBidLearning(systemStatus: string | undefined): boolean {
  return systemStatus?.startsWith('LEARNING_') ?? false;
}

function platformOf(s: AdSetSnapshot): PlatformId {
  return s.platform ?? 'meta';
}

/**
 * Is this entity in its platform's learning phase?
 *
 * - Meta (and any snapshot without a platform): the learning stage Meta's read carries; the
 *   engine's 50-events-in-7-days proxy only when the snapshot has no delivery read.
 * - Google: the bid strategy says so (LEARNING_*). The 50-event proxy never applies.
 * - TikTok: no API state exists, so it is inferred — younger than 7 days, or its campaign
 *   has fewer than 25 results in d7. `campaignResults7d` is the campaign's total; without
 *   it the entity's own d7 results stand in, which can only over-report learning.
 */
export function isPlatformLearning(
  s: AdSetSnapshot,
  cfg: EngineConfig,
  campaignResults7d?: number,
): boolean {
  switch (platformOf(s)) {
    case 'meta':
      // Meta says whether an ad set is learning: learning_stage_info carries a status only while
      // it is LEARNING (or FAIL / LEARNING_LIMITED, which are not a learning phase the engine
      // should protect). The proxy — under 50 KPI events in 7 days — marked every Easy Fit
      // WhatsApp ad set "learning" months after Meta had them out of it, which capped their cuts
      // at −8 % while raises ran to +25 %. The proxy stays for a snapshot with no delivery read.
      if (s.ageDays < cfg.learningMinDays) return true;
      if (s.delivery) return s.delivery.learningStage === 'LEARNING';
      return kpiEvents(s.windows.d7, cfg) < cfg.learningConvThreshold;
    case 'google_ads':
      return isGoogleBidLearning(s.bidding?.systemStatus);
    case 'tiktok_ads': {
      const results = campaignResults7d ?? entityResults7d(s, cfg);
      return s.ageDays < TIKTOK_LEARNING_DAYS || results < TIKTOK_LEARNING_RESULTS;
    }
  }
}

/** d7 results in the entity's own declared KPI (falls back to the portfolio's). */
export function entityResults7d(s: AdSetSnapshot, cfg: EngineConfig): number {
  return kpiEvents(s.windows.d7, s.kpiField ? { ...cfg, kpiField: s.kpiField } : cfg);
}

/** d7 results per TikTok campaign across a roster — the "campaign results" TikTok counts. */
export function tiktokCampaignResults7d(
  snapshots: readonly AdSetSnapshot[],
  cfg: EngineConfig,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of snapshots) {
    if (s.platform !== 'tiktok_ads' || !s.campaignId) continue;
    totals.set(s.campaignId, (totals.get(s.campaignId) ?? 0) + entityResults7d(s, cfg));
  }
  return totals;
}

/** Days a new entity is protected (grace) before its numbers move money. */
export function protectDaysFor(s: AdSetSnapshot, cfg: EngineConfig): number {
  if (s.platform === 'google_ads' && s.automation === 'pmax') {
    return Math.max(cfg.newItemProtectDays, PMAX_PROTECT_DAYS);
  }
  return cfg.newItemProtectDays;
}

/** How far one cycle may move an entity's budget on its platform. */
export type PlatformCaps = {
  platform: PlatformId;
  upPct: number;
  downPct: number;
  /** Minimum whole days since the last budget change before another one. */
  minDaysBetweenChanges: number;
  /** Why the caps are what they are, in English, for the card. */
  basis: string;
};

/**
 * The per-platform velocity caps a budget leg is held to.
 *
 * Meta and Google take the objective profile's asymmetric caps (lead: +25% / −35%), and a
 * learning entity's decrease is held to 8% (Meta: engine.ts; Google: G13). TikTok takes its
 * own documented limits — −50% / +20%, two days between changes — and a learning TikTok
 * entity takes no change at all, which is the caller's eligibility test, not a cap here.
 */
export function platformCaps(
  platform: PlatformId,
  objective: OptimizationObjective,
  learning: boolean,
): PlatformCaps {
  const learningCap = DEFAULT_CONFIG.learningReductionCapPct;
  if (platform === 'tiktok_ads') {
    return {
      platform,
      upPct: TIKTOK_MAX_INCREASE_PCT,
      downPct: TIKTOK_MAX_DECREASE_PCT,
      minDaysBetweenChanges: TIKTOK_MIN_DAYS_BETWEEN_CHANGES,
      basis: 'TikTok: at most 50% down or 20% up, 2 days between changes',
    };
  }
  const profile = getObjectiveProfile(objective);
  const downPct = learning
    ? Math.min(profile.velocityDownPct, learningCap)
    : profile.velocityDownPct;
  const who = platform === 'google_ads' ? 'Google' : 'Meta';
  return {
    platform,
    upPct: profile.velocityUpPct,
    downPct,
    minDaysBetweenChanges: 0,
    basis: learning
      ? `${who}: learning, so a decrease is held to ${pct(learningCap)}`
      : `${who}: the ${objective} profile allows +${pct(profile.velocityUpPct)} / −${pct(profile.velocityDownPct)}`,
  };
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
