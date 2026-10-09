// Which platform-specific card a recommendation renders as, and the words and figures it says
// (frontend.html §5). The card reads `platform_card` on the account candidate; anything absent
// or malformed is null, and the caller renders today's generic card — a half-parsed variant
// would show a figure the producer never wrote.

import {
  type AccountCandidate,
  type CrossPlatformLeg,
  type PlatformCard,
  PlatformCardSchema,
} from '@continuum/contracts';
import { formatCurrency } from '../../format';
import { type AdPlatform, PLATFORM_NAMES } from '../platforms/platformTabsModel';

export function platformCardOf(candidate: AccountCandidate): PlatformCard | null {
  if (candidate.platform_card == null) return null;
  const parsed = PlatformCardSchema.safeParse(candidate.platform_card);
  return parsed.success ? parsed.data : null;
}

/** The platforms a card names in its chips: the giving side of a move first. */
export function platformsOf(card: PlatformCard): AdPlatform[] {
  switch (card.variant) {
    case 'google_budget_limited':
    case 'google_pmax_asset_group':
    case 'google_video_readonly':
    case 'google_negative_terms':
    case 'google_promote_term':
    case 'google_bid_target':
    case 'google_low_quality_keyword':
    case 'google_delivery_issue':
      return ['google_ads'];
    case 'tiktok_creative_fatigue':
    case 'tiktok_scheduled_decrease':
    case 'tiktok_hook_retention':
    case 'tiktok_spark_candidate':
    case 'tiktok_budget_below_learning':
    case 'tiktok_attribution_window':
    case 'tiktok_delivery_issue':
      return ['tiktok_ads'];
    case 'meta_creative_fatigue':
      return ['meta'];
    case 'cross_platform_move': {
      const ordered = [...givingLegs(card.legs), ...takingLegs(card.legs)].map(
        (leg) => leg.platform,
      );
      return [...new Set(ordered)];
    }
  }
}

/** The short type label beside the chip: what kind of decision this is. */
export const PLATFORM_CARD_TYPE: Record<PlatformCard['variant'], string> = {
  google_budget_limited: 'Budget',
  google_pmax_asset_group: 'Asset group',
  google_video_readonly: 'Read-only',
  tiktok_creative_fatigue: 'Creative',
  meta_creative_fatigue: 'Creative',
  tiktok_scheduled_decrease: 'Scheduled budget',
  cross_platform_move: 'Move budget',
  google_negative_terms: 'Negatives',
  google_promote_term: 'Search term',
  google_bid_target: 'Bid',
  google_low_quality_keyword: 'Keyword',
  tiktok_hook_retention: 'Hook',
  tiktok_spark_candidate: 'Spark Ad',
  tiktok_budget_below_learning: 'Learning',
  tiktok_attribution_window: 'Attribution',
  google_delivery_issue: 'Delivery',
  tiktok_delivery_issue: 'Delivery',
};

/** The variants whose body carries the platform's mark beside the title. The wave-6/7
 *  variants predate the mark and keep the chip alone; Meta's fatigue card carries it because
 *  it renders inside the Meta creative card, where no chip says whose ad set it is. */
const MARKED_VARIANTS: ReadonlySet<PlatformCard['variant']> = new Set([
  'meta_creative_fatigue',
  'google_negative_terms',
  'google_promote_term',
  'google_bid_target',
  'google_low_quality_keyword',
  'tiktok_hook_retention',
  'tiktok_spark_candidate',
  'tiktok_budget_below_learning',
  'tiktok_attribution_window',
  'google_delivery_issue',
  'tiktok_delivery_issue',
]);

export function markedPlatformOf(card: PlatformCard): AdPlatform | null {
  return MARKED_VARIANTS.has(card.variant) ? (platformsOf(card)[0] ?? null) : null;
}

/** Whether the card may carry an action button. A Video campaign cannot be written through
 *  Google's API, so its card sends a person to Google Ads and offers nothing to approve; an
 *  attribution-window card explains why platforms are not compared and has nothing to apply; a
 *  delivery problem is fixed where the platform names it (a policy, billing, a review), never
 *  by a write of ours. */
const READ_ONLY_VARIANTS: ReadonlySet<PlatformCard['variant']> = new Set([
  'google_video_readonly',
  'tiktok_attribution_window',
  'google_delivery_issue',
  'tiktok_delivery_issue',
]);

export function isReadOnly(card: PlatformCard): boolean {
  return READ_ONLY_VARIANTS.has(card.variant);
}

/** The negatives card holds its own buttons, because which terms it adds is chosen inside it. */
export function ownsItsActions(card: PlatformCard): boolean {
  return card.variant === 'google_negative_terms';
}

/** Smart Bidding relearns after a target change; the card waits this long between changes. */
export const BID_RELEARNING_DAYS = 7;

/** "35 MXN" for a target CPA, "350%" for a target ROAS (a ratio: 3.5 is 350%). */
export function bidTargetLabel(
  value: number,
  strategy: 'target_cpa' | 'target_roas',
  currency: string | null,
): string {
  return strategy === 'target_cpa' ? formatCurrency(value, currency) : percentLabel(value);
}

export function negativesLabel(count: number): string {
  return `Add ${count} ${count === 1 ? 'negative' : 'negatives'}`;
}

/** The action a new variant names on its button; null keeps the row's own action label. */
export function platformCardActionLabel(card: PlatformCard): string | null {
  switch (card.variant) {
    case 'google_negative_terms':
      return negativesLabel(card.terms.length);
    case 'google_promote_term':
      return 'Add as exact keyword';
    case 'google_bid_target': {
      const direction = card.proposed_target < card.current_target ? 'Lower' : 'Raise';
      const name = card.strategy === 'target_cpa' ? 'tCPA' : 'tROAS';
      return `${direction} the Google Ads bid target (${name}) to ${bidTargetLabel(card.proposed_target, card.strategy, card.currency)}`;
    }
    case 'google_low_quality_keyword':
      return 'Pause keyword';
    case 'tiktok_hook_retention':
      return 'Request a new opening';
    case 'tiktok_spark_candidate':
      return 'Request the Spark code';
    case 'tiktok_budget_below_learning':
      return `Raise the budget to ${formatCurrency(card.required_budget_per_day, card.currency)}/day`;
    default:
      return null;
  }
}

/** The relearning cooldown in plain words, from the days since the last bid change. */
export function bidCooldownNote(daysSinceLastChange: number | null): string {
  if (daysSinceLastChange == null) {
    return `No recent bid change on record. Google relearns for about ${BID_RELEARNING_DAYS} days after a target changes.`;
  }
  const ago =
    daysSinceLastChange === 0
      ? 'today'
      : `${daysSinceLastChange} ${daysSinceLastChange === 1 ? 'day' : 'days'} ago`;
  if (daysSinceLastChange < BID_RELEARNING_DAYS) {
    const left = BID_RELEARNING_DAYS - daysSinceLastChange;
    return `The target last changed ${ago}. Google is still relearning, so wait ${left} more ${left === 1 ? 'day' : 'days'} before changing it again.`;
  }
  return `The target last changed ${ago}, past Google's ${BID_RELEARNING_DAYS}-day relearning period.`;
}

type BudgetLimitedCard = Extract<PlatformCard, { variant: 'google_budget_limited' }>;

/** What the proposed budget is expected to buy, as the producer projected it; null when there is
 *  no projection, or nothing proposed for it to stand on. */
export function budgetProjectionLabel(card: BudgetLimitedCard): string | null {
  const projection = card.projection;
  if (projection == null || card.proposed_budget_per_day == null) return null;
  const perDay = `${card.result_label}/day`;
  return `At ${formatCurrency(card.proposed_budget_per_day, card.currency)}/day: about ${countLabel(projection.results_per_day_low)}–${countLabel(projection.results_per_day_high)} ${perDay} (now ${countLabel(projection.results_per_day_now)}), based on ${projection.basis_days} days`;
}

export function countLabel(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function plural(count: number, one: string, many: string): string {
  return `${countLabel(count)} ${count === 1 ? one : many}`;
}

function windowLabel(click: number, view: number): string {
  return `${click}-day click / ${view}-day view`;
}

export function googleAdsCampaignHref(campaignId: string): string {
  return `https://ads.google.com/aw/campaigns?campaignId=${encodeURIComponent(campaignId)}`;
}

/** Where a delivery problem is fixed: the policy manager when ads are disapproved, the
 *  campaigns list otherwise. The card carries no campaign id, so it never deep-links one. */
export function googleDeliveryHref(disapprovedAds: number): string {
  return disapprovedAds > 0
    ? 'https://ads.google.com/aw/policymanager'
    : 'https://ads.google.com/aw/campaigns';
}

/** Google's campaign primary_status_reasons in a person's words. A code Google adds later
 *  still reads, lower-cased, rather than disappearing. */
const GOOGLE_REASON_WORDS: Readonly<Record<string, string>> = {
  HAS_ADS_DISAPPROVED: 'ads disapproved by policy',
  HAS_ADS_LIMITED_BY_POLICY: 'ads limited by policy',
  MOST_ADS_UNDER_REVIEW: 'most ads still under review',
  HAS_ASSET_GROUPS_DISAPPROVED: 'asset groups disapproved by policy',
  HAS_ASSET_GROUPS_LIMITED_BY_POLICY: 'asset groups limited by policy',
  MOST_ASSET_GROUPS_UNDER_REVIEW: 'most asset groups still under review',
  BUDGET_CONSTRAINED: 'limited by budget',
  BUDGET_MISCONFIGURED: 'the budget is set up wrong',
  BIDDING_STRATEGY_MISCONFIGURED: 'the bid strategy is set up wrong',
  BIDDING_STRATEGY_LIMITED: 'the bid strategy is limited',
  BIDDING_STRATEGY_CONSTRAINED: 'the bid target is too tight',
  BIDDING_STRATEGY_LEARNING: 'the bid strategy is still learning',
  SEARCH_VOLUME_LIMITED: 'too few searches for its keywords',
  NO_AD_GROUPS: 'no ad groups',
  AD_GROUPS_PAUSED: 'every ad group paused',
  NO_AD_GROUP_ADS: 'no ads',
  AD_GROUP_ADS_PAUSED: 'every ad paused',
  NO_KEYWORDS: 'no keywords',
  KEYWORDS_PAUSED: 'every keyword paused',
  NO_ASSET_GROUPS: 'no asset groups',
  ASSET_GROUPS_PAUSED: 'every asset group paused',
  CAMPAIGN_PENDING: 'not started yet',
  CAMPAIGN_ENDED: 'its end date has passed',
  CAMPAIGN_PAUSED: 'paused',
  CAMPAIGN_GROUP_PAUSED: 'its campaign group is paused',
  MISSING_LEAD_FORM_EXTENSION: 'the lead form is missing',
  LEAD_FORM_EXTENSION_DISAPPROVED: 'the lead form was disapproved',
  LEAD_FORM_EXTENSION_UNDER_REVIEW: 'the lead form is under review',
};

function codeInWords(code: string): string {
  return code.toLowerCase().replace(/_+/g, ' ').trim();
}

export function googleReasonInWords(code: string): string {
  return GOOGLE_REASON_WORDS[code] ?? codeInWords(code);
}

/** TikTok's ad group secondary_status in a person's words; the ADGROUP_STATUS_ prefix is TikTok's
 *  namespace, not part of what it says. */
const TIKTOK_STATUS_WORDS: Readonly<Record<string, string>> = {
  ADGROUP_STATUS_AUDIT_DENY: 'rejected in review',
  ADGROUP_STATUS_AUDIT: 'still in review',
  ADGROUP_STATUS_REAUDIT: 'back in review after an edit',
  ADGROUP_STATUS_NOT_DELIVER: 'not delivering',
  ADGROUP_STATUS_BALANCE_EXCEED: 'out of account balance',
  ADGROUP_STATUS_BUDGET_EXCEED: 'out of budget',
  ADGROUP_STATUS_CAMPAIGN_EXCEED: 'its campaign is out of budget',
  ADGROUP_STATUS_CAMPAIGN_DISABLE: 'its campaign is paused',
  ADGROUP_STATUS_DISABLE: 'paused',
  ADGROUP_STATUS_TIME_DONE: 'its schedule has ended',
  ADGROUP_STATUS_NOT_START: 'not started yet',
};

export function tiktokStatusInWords(status: string): string {
  return TIKTOK_STATUS_WORDS[status] ?? codeInWords(status.replace(/^ADGROUP_STATUS_/, ''));
}

function darkFor(days: number): string {
  return days === 0 ? 'is not serving' : `has not served for ${plural(days, 'day', 'days')}`;
}

/** Fractions to whole percent ("41%"), one decimal under 10 ("0.8%"). */
export function percentLabel(fraction: number): string {
  const pct = fraction * 100;
  const digits = pct !== 0 && Math.abs(pct) < 10 ? 1 : 0;
  return `${pct.toFixed(digits)}%`;
}

export function givingLegs(legs: readonly CrossPlatformLeg[]): CrossPlatformLeg[] {
  return legs.filter((leg) => leg.to_per_day < leg.from_per_day);
}

export function takingLegs(legs: readonly CrossPlatformLeg[]): CrossPlatformLeg[] {
  return legs.filter((leg) => leg.to_per_day > leg.from_per_day);
}

/** A leg's change as the card prints it: "−4.2%" or "+25%". */
export function legChangeLabel(leg: CrossPlatformLeg): string {
  if (leg.from_per_day === 0) return 'new';
  const change = (leg.to_per_day - leg.from_per_day) / leg.from_per_day;
  const label = percentLabel(Math.abs(change));
  return change < 0 ? `−${label}` : `+${label}`;
}

/** The money a move shifts per day: what the giving legs take off. */
export function movedPerDay(legs: readonly CrossPlatformLeg[]): number {
  return givingLegs(legs).reduce((sum, leg) => sum + (leg.from_per_day - leg.to_per_day), 0);
}

function platformList(platforms: readonly AdPlatform[]): string {
  const names = [...new Set(platforms)].map((platform) => PLATFORM_NAMES[platform]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Wed 1 Oct, 00:00 (America/Mexico_City)" in the advertiser's own timezone when we have it. */
export function scheduledLabel(iso: string, timezone: string | null): string {
  const date = new Date(iso);
  const zone = timezone ?? 'UTC';
  try {
    const text = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: zone,
    }).format(date);
    return `${text} (${zone})`;
  } catch {
    return `${date.toISOString().slice(0, 16).replace('T', ' ')} (UTC)`;
  }
}

/** The card's title: entity + figure + comparison, from the producer's own fields. */
export function platformCardTitle(card: PlatformCard): string {
  switch (card.variant) {
    case 'google_budget_limited': {
      const cost =
        card.cost_per_result != null
          ? ` with ${card.result_label} at ${formatCurrency(card.cost_per_result, card.currency)}`
          : '';
      const days = card.days_limited != null ? `, ${card.days_limited} days running` : '';
      return `${card.campaign_name} loses ${percentLabel(card.budget_lost_impression_share)} of impressions to budget${cost}${days}`;
    }
    case 'google_pmax_asset_group': {
      const short = card.asset_groups.filter((group) => group.missing.length > 0).length;
      const groups = card.asset_groups.length;
      return short === 0
        ? `${card.campaign_name}: ${groups} ${groups === 1 ? 'asset group' : 'asset groups'}, none missing assets`
        : `${card.campaign_name}: ${short} of ${groups} ${groups === 1 ? 'asset group is' : 'asset groups are'} missing assets`;
    }
    case 'google_video_readonly':
      return `${card.campaign_name} is a Video campaign, read-only here`;
    case 'tiktok_creative_fatigue':
    case 'meta_creative_fatigue': {
      const frequency =
        card.frequency != null ? ` with frequency ${card.frequency.toFixed(1)}` : '';
      return `"${card.creative_name}" fell from ${percentLabel(card.ctr_before)} to ${percentLabel(card.ctr_now)} CTR in ${card.days} days${frequency}`;
    }
    case 'tiktok_scheduled_decrease':
      return `${card.ad_group_name}: budget down to ${formatCurrency(card.target_budget_per_day, card.currency)}/day from ${formatCurrency(card.budget_per_day, card.currency)}, scheduled for ${scheduledLabel(card.effective_at, card.timezone)}`;
    case 'cross_platform_move':
      return `Move ${formatCurrency(movedPerDay(card.legs), card.currency)}/day from ${platformList(givingLegs(card.legs).map((leg) => leg.platform))} to ${platformList(takingLegs(card.legs).map((leg) => leg.platform))}`;
    case 'google_negative_terms': {
      const spend = card.terms.reduce((sum, term) => sum + term.spend, 0);
      const conversions = card.terms.reduce((sum, term) => sum + term.conversions, 0);
      const result =
        conversions === 0
          ? 'without a conversion'
          : `for ${plural(conversions, 'conversion', 'conversions')}`;
      return `${plural(card.terms.length, 'search term', 'search terms')} in ${card.campaign_name} spent ${formatCurrency(spend, card.currency)} in ${card.window_days} days ${result}`;
    }
    case 'google_promote_term': {
      const cost =
        card.cost_per_result != null
          ? ` at ${formatCurrency(card.cost_per_result, card.currency)}`
          : '';
      return `"${card.term}" brought ${plural(card.conversions, 'conversion', 'conversions')}${cost} in ${card.window_days} days and is not a keyword yet`;
    }
    case 'google_bid_target': {
      const name = card.strategy === 'target_cpa' ? 'tCPA' : 'tROAS';
      const actual =
        card.actual != null
          ? `, actual ${bidTargetLabel(card.actual, card.strategy, card.currency)} over ${card.window_days} days`
          : '';
      return `${card.campaign_name}: Google Ads bid target (${name}) ${bidTargetLabel(card.current_target, card.strategy, card.currency)}${actual}`;
    }
    case 'google_low_quality_keyword':
      return `"${card.keyword}" has Quality Score ${card.quality_score}/10 and spent ${formatCurrency(card.spend, card.currency)} in ${card.window_days} days with ${plural(card.conversions, 'conversion', 'conversions')}`;
    case 'tiktok_hook_retention':
      return `"${card.creative_name}" holds ${percentLabel(card.hold_2s)} of viewers past 2 seconds, against ${percentLabel(card.portfolio_hold_2s)} across the portfolio`;
    case 'tiktok_spark_candidate':
      return `An organic post has ${countLabel(card.views)} views and ${percentLabel(card.engagement_rate)} engagement, and is not promoted`;
    case 'tiktok_budget_below_learning':
      return `${card.ad_group_name}: budget ${formatCurrency(card.budget_per_day, card.currency)}/day, under the ${formatCurrency(card.required_budget_per_day, card.currency)}/day learning needs`;
    case 'tiktok_attribution_window':
      return `${card.ad_group_name} counts ${windowLabel(card.click_window_days, card.view_window_days)}, ${PLATFORM_NAMES[card.compared_to.platform]} counts ${windowLabel(card.compared_to.click_window_days, card.compared_to.view_window_days)}`;
    case 'google_delivery_issue':
      return card.account_wide
        ? `No campaign in the account ${card.dark_days === 0 ? 'is serving' : `has served for ${plural(card.dark_days, 'day', 'days')}`}: one cause for the whole account`
        : `${card.campaign_name} ${darkFor(card.dark_days)}`;
    case 'tiktok_delivery_issue': {
      const status =
        card.secondary_status != null ? `: ${tiktokStatusInWords(card.secondary_status)}` : '';
      return `${card.ad_group_name} ${darkFor(card.dark_days)}${status}`;
    }
  }
}

export const ATTRIBUTION_WINDOW_NOTE =
  'Different attribution windows count different conversions, so we do not compare these platforms until the windows match.';

export const SPARK_NOTE =
  "As a Spark Ad the post keeps its likes and comments. It needs the creator's authorization code first.";

export const CROSS_PLATFORM_APPROVAL_NOTE =
  'We recommend a person approves moves between platforms: one approval writes every leg, budget comes off first.';

export const VIDEO_READONLY_NOTE =
  'Google does not let the API pause or change budgets on Video campaigns. Change it in Google Ads if you want to scale it.';

export const PMAX_NOTE =
  'Google does not report conversions per asset group; it does say what each one is missing.';
