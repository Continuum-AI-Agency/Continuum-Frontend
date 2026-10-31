// The "use this goal as the cost cap on the ad platforms" checkbox, as pure logic: its label,
// its help, when it may be ticked, and its errors in plain English.
//
// A portfolio has ONE CPA goal. Checked, the Optimizer proposes setting each platform's bid
// setting to that goal in capped steps; unchecked, the goal is only measured. The copy never
// blurs the two numbers: the goal is "the portfolio CPA goal", the platform number is always
// named with "(bid setting)". Which platforms it acts on is GOAL_AS_COST_CAP_PLATFORMS, so the
// help names Meta the day the contracts constant does.

import {
  GOAL_AS_COST_CAP_PLATFORMS,
  getOptimizationMetricDefinition,
  type OptimizationObjective,
  OptimizationObjectiveSchema,
  type PlatformId,
} from '@continuum/contracts';
import { isMissingRpcError } from '../platforms/multiplatformRead';

export const GOAL_COST_CAP_LABEL = 'Use this goal as the cost cap on the ad platforms';

/** The engine's step when a portfolio sets no max_change_pct_per_cycle
 *  (BID_TARGET_MAX_CHANGE_PER_CYCLE in the optimization engine's signalRules). */
export const DEFAULT_BID_STEP_FRACTION = 0.2;

const BID_SETTING_NAME: Record<PlatformId, string> = {
  google_ads: 'Google Ads target CPA',
  meta: 'Meta cost cap',
  tiktok_ads: 'TikTok cost cap',
};

/** Goals priced per conversion. A CPM, a cost per click or per view is not a cost a platform
 *  takes as a target CPA or cost cap. */
const CPA_GOAL_METRICS: ReadonlySet<OptimizationObjective> = new Set<OptimizationObjective>([
  'purchase',
  'app_install',
  'signup',
  'lead',
  'conversations',
  'custom',
]);

export function bidSettingsPhrase(platforms: readonly PlatformId[]): string {
  const names = platforms.map((platform) => `${BID_SETTING_NAME[platform]} (bid setting)`);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

function stepPercent(maxChangePctPerCycle: number | null | undefined): string {
  const fraction =
    typeof maxChangePctPerCycle === 'number' && maxChangePctPerCycle > 0
      ? maxChangePctPerCycle
      : DEFAULT_BID_STEP_FRACTION;
  return `${Math.round(fraction * 1000) / 10}%`;
}

export function goalCostCapHelp({
  enabled,
  maxChangePctPerCycle,
  platforms = GOAL_AS_COST_CAP_PLATFORMS,
}: {
  enabled: boolean;
  maxChangePctPerCycle: number | null | undefined;
  platforms?: readonly PlatformId[];
}): string {
  if (!enabled) {
    return 'The Optimizer measures the portfolio against this goal and never changes bid settings on the platforms.';
  }
  return `The Optimizer proposes setting the ${bidSettingsPhrase(platforms)} of each campaign to this goal, in steps of up to ${stepPercent(maxChangePctPerCycle)} a day.`;
}

export function isCpaGoalMetric(metric: string | null | undefined): boolean {
  const parsed = OptimizationObjectiveSchema.safeParse(metric);
  return parsed.success && CPA_GOAL_METRICS.has(parsed.data);
}

export type GoalCostCapAvailability = { available: true } | { available: false; reason: string };

function article(label: string): string {
  return /^[AEIOU]/.test(label) ? 'an' : 'a';
}

export function goalCostCapAvailability({
  targetMetric,
  goal,
}: {
  targetMetric: string | null | undefined;
  goal: number | null | undefined;
}): GoalCostCapAvailability {
  if (!isCpaGoalMetric(targetMetric)) {
    const cost = getOptimizationMetricDefinition(targetMetric).costLabel;
    const named = /^[A-Z]{2,}$/.test(cost) ? cost : cost.toLowerCase();
    return {
      available: false,
      reason: `Only a cost-per-conversion goal can be the platforms' cost cap. This portfolio's goal is ${article(named)} ${named}.`,
    };
  }
  if (typeof goal !== 'number' || !(goal > 0)) {
    return {
      available: false,
      reason: 'Set a portfolio CPA goal above to use it as the cost cap on the ad platforms.',
    };
  }
  return { available: true };
}

const ERROR_BY_CODE: Record<string, string> = {
  '22023': 'The change was not accepted. Reload the page and try again.',
  P0002: 'This portfolio no longer exists. Reload the page.',
  '42501': "You don't have access to change this portfolio. Ask a member of the brand.",
};

/** The setter's error, for a person. The database's own text is never shown. */
export function goalCostCapErrorMessage(error: unknown): string {
  if (isMissingRpcError(error)) {
    return "This setting isn't available yet. The server needs an update first.";
  }
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof code === 'string' && ERROR_BY_CODE[code]) return ERROR_BY_CODE[code];
  return "The setting couldn't be saved. Try again.";
}
