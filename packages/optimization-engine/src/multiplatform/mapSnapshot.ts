// ---------------------------------------------------------------------------
// MultiPlatformSnapshot (the neutral ingest shape, BE1 contracts) -> the AdSetSnapshot the
// engine already consumes.
//
// The rule this file keeps: what a platform does not report stays undefined. Google has no
// frequency and no Meta delivery blockers; TikTok has no creative standing. A zero in their
// place would be a measurement nobody made, and the engine treats missing and zero very
// differently (see DeliverySignals and the no_conversions abstain).
// Design: google-acciones.html §6 (AdSetSnapshotSchema gains platform/level/budget/bidding),
// tiktok.html §3.2–§3.3, escenarios.html scenarios 02–06.
// ---------------------------------------------------------------------------

import {
  currencyMinorOffset,
  type MultiPlatformSnapshot,
  type MultiPlatformWindowMetrics,
} from '@continuum/contracts';
import type { AdSetSnapshot, FreezeReason, PlatformHold, WindowMetrics } from '../types';

/** What the ingest knows about an entity that the neutral snapshot does not carry. Every
 *  field is required so no caller can forget one; null says "not known" out loud. */
export type MultiPlatformMapContext = {
  /** Whole days since the entity started (Google campaign.start_date, TikTok create_time)
   *  as of the cycle day. Null ⇒ unknown: the entity is treated as brand new and locked. */
  ageDays: number | null;
  /** The WindowMetrics field this entity's platform goal resolves to through
   *  platform_objective_map. Null ⇒ no row in the map: frozen `kpi_mismatch`, never guessed. */
  kpiField: keyof WindowMetrics | null;
  /** Google campaign.advertising_channel_type, verbatim. Ignored for Meta and TikTok. */
  channelType: string | null;
};

/** Google campaign types the Optimizer admits (decision 5): Search, PMax, Demand Gen and
 *  YouTube Video — and Video only to read. Anything else (Smart, Display, Shopping…) is
 *  listed but never enrolled: an explicit list, not "everything but Shopping". */
export const ADMITTED_GOOGLE_CHANNELS: readonly string[] = [
  'SEARCH',
  'PERFORMANCE_MAX',
  'DEMAND_GEN',
  'VIDEO',
];
/** The API can neither pause nor change budgets on VIDEO campaigns. */
export const READONLY_GOOGLE_CHANNELS: readonly string[] = ['VIDEO'];

export type GoogleChannelAdmission =
  | { admitted: true; readonly: boolean }
  | { admitted: false; reason: `unsupported_channel:${string}` };

export function googleChannelAdmission(channelType: string | null): GoogleChannelAdmission {
  const channel = channelType?.trim().toUpperCase() ?? '';
  if (!ADMITTED_GOOGLE_CHANNELS.includes(channel)) {
    return { admitted: false, reason: `unsupported_channel:${channel || 'UNKNOWN'}` };
  }
  return { admitted: true, readonly: READONLY_GOOGLE_CHANNELS.includes(channel) };
}

/** Event counts the engine scores on; copied only when the platform reported them. */
const OPTIONAL_COUNTS = [
  'leads',
  'appInstalls',
  'signups',
  'landingPageViews',
  'reach',
  'conversations',
  'linkClicks',
  'thruplays',
  'postEngagement',
] as const satisfies readonly (keyof WindowMetrics)[];

function toEngineWindow(m: MultiPlatformWindowMetrics): WindowMetrics {
  const window: WindowMetrics = {
    spend: m.spend,
    purchases: m.purchases,
    addToCarts: m.addToCarts,
    clicks: m.clicks,
    impressions: m.impressions,
  };
  for (const key of OPTIONAL_COUNTS) {
    const value = m[key];
    if (value !== undefined) window[key] = value;
  }
  return window;
}

function platformHoldOf(
  snapshot: MultiPlatformSnapshot,
  context: MultiPlatformMapContext,
): PlatformHold | null {
  if (snapshot.platform === 'google_ads') {
    const admission = googleChannelAdmission(context.channelType);
    if (!admission.admitted) return 'unsupported_channel';
    if (admission.readonly) return 'platform_readonly';
  }
  if (snapshot.budget.shared) return 'shared_budget';
  return null;
}

/** Why the budget is held, first reason wins: what the platform forbids, then where the
 *  money lives, then whether the entity buys what the portfolio prices. */
function freezeReasonOf(
  snapshot: MultiPlatformSnapshot,
  context: MultiPlatformMapContext,
  hold: PlatformHold | null,
): FreezeReason | null {
  // The contracts enum is closed this wave; the specific cause rides in platformHold.
  if (hold) return 'unsupported_budget';
  if (snapshot.budget.kind !== 'daily') return 'lifetime_budget';
  // A group whose budget lives on its campaign (CBO), or whose campaign the platform
  // drives (PMax, Smart+): there is no group budget for the engine to move.
  const budgetOnCampaign =
    snapshot.level !== 'campaign' && snapshot.budget.ownerRef.level === 'campaign';
  if (budgetOnCampaign || (snapshot.level !== 'campaign' && snapshot.automation !== 'manual')) {
    return 'unsupported_budget';
  }
  if (context.kpiField === null) return 'kpi_mismatch';
  return null;
}

export function mapMultiPlatformSnapshotToAdSet(
  snapshot: MultiPlatformSnapshot,
  context: MultiPlatformMapContext,
): AdSetSnapshot {
  const hold = platformHoldOf(snapshot, context);
  const freezeReason = freezeReasonOf(snapshot, context, hold);
  const currentBudget = snapshot.budget.minor / currencyMinorOffset(snapshot.budget.currency);
  const frequency7d = snapshot.windows.d7.delivery?.frequency;
  return {
    id: snapshot.id,
    ...(snapshot.name !== undefined ? { name: snapshot.name } : {}),
    status: 'active',
    currentBudget,
    budgetType: snapshot.budget.kind === 'daily' ? 'daily' : 'lifetime',
    ageDays: context.ageDays ?? 0,
    ...(context.ageDays === null ? { ageUnknown: true as const } : {}),
    ...(freezeReason ? { freeze: true, freezeReason } : {}),
    ...(hold ? { platformHold: hold } : {}),
    ...(context.kpiField ? { kpiField: context.kpiField } : {}),
    ...(snapshot.campaignId !== undefined ? { campaignId: snapshot.campaignId } : {}),
    ...(frequency7d !== undefined ? { frequency7d } : {}),
    platform: snapshot.platform,
    level: snapshot.level,
    entityRef: {
      platform: snapshot.platform,
      level: snapshot.level,
      nativeLevel: snapshot.native_level,
      id: snapshot.id,
      accountId: snapshot.accountId,
      ...(snapshot.name !== undefined ? { name: snapshot.name } : {}),
    },
    automation: snapshot.automation,
    ...(snapshot.bidding ? { bidding: { ...snapshot.bidding } } : {}),
    ...(snapshot.primaryStatus !== undefined ? { primaryStatus: snapshot.primaryStatus } : {}),
    ...(snapshot.primaryStatusReasons !== undefined
      ? { primaryStatusReasons: [...snapshot.primaryStatusReasons] }
      : {}),
    windows: {
      d3: toEngineWindow(snapshot.windows.d3),
      d7: toEngineWindow(snapshot.windows.d7),
      d14: toEngineWindow(snapshot.windows.d14),
    },
  };
}
