import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

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
    case 'google_ad_drag':
    case 'google_ad_winner':
    case 'google_audience_saturation':
    case 'google_pmax_assets':
    case 'google_account_finding':
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
    case 'meta_cost_cap':
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
  google_ad_drag: 'Ad',
  google_ad_winner: 'Creative',
  google_audience_saturation: 'Audience',
  google_pmax_assets: 'Assets',
  google_account_finding: 'Account finding',
  meta_cost_cap: 'Cost cap',
};

/** The variants whose body carries the platform's mark beside the title. The wave-6/7
 *  variants predate the mark and keep the chip alone; Meta's fatigue card carries it because
 *  it renders inside the Meta creative card, where no chip says whose ad set it is. */
const MARKED_VARIANTS: ReadonlySet<PlatformCard['variant']> = new Set([
  'meta_creative_fatigue',
  'meta_cost_cap',
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
  'google_ad_drag',
  'google_ad_winner',
  'google_audience_saturation',
  'google_pmax_assets',
  'google_account_finding',
]);

export function markedPlatformOf(card: PlatformCard): AdPlatform | null {
  return MARKED_VARIANTS.has(card.variant) ? (platformsOf(card)[0] ?? null) : null;
}

/** Whether the card may carry an action button. A Video campaign cannot be written through
 *  Google's API, so its card sends a person to Google Ads and offers nothing to approve; an
 *  attribution-window card explains why platforms are not compared and has nothing to apply; a
 *  delivery problem is fixed where the platform names it (a policy, billing, a review), never
 *  by a write of ours. A new ad, a replacement asset and a wider audience are made by a person
 *  in Google Ads too. An account finding is recommend-only by contract: it carries no write. */
const READ_ONLY_VARIANTS: ReadonlySet<PlatformCard['variant']> = new Set([
  'google_video_readonly',
  'tiktok_attribution_window',
  'google_delivery_issue',
  'tiktok_delivery_issue',
  'google_ad_winner',
  'google_audience_saturation',
  'google_pmax_assets',
  'google_account_finding',
]);

export function isReadOnly(card: PlatformCard): boolean {
  return READ_ONLY_VARIANTS.has(card.variant);
}

/** Google shows no ad anywhere in the account: one cause that outranks every other card. */
export function blocksTheAccount(card: PlatformCard | null): boolean {
  return card?.variant === 'google_delivery_issue' && card.account_wide;
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
  uiLocale: UiLocale = 'en',
): string {
  return strategy === 'target_cpa'
    ? formatCurrency(value, currency, uiLocale)
    : percentLabel(value, uiLocale);
}

export function negativesLabel(count: number, uiTranslate?: ScaleCopy): string {
  return uiTranslate
    ? uiTranslate('helper_9d1d502a36cd', {
        v0: count,
        v1: count === 1 ? 'negative' : 'negatives',
      })
    : `Add ${count} ${count === 1 ? 'negative' : 'negatives'}`;
}

/** The action a new variant names on its button; null keeps the row's own action label. */
export function platformCardActionLabel(
  card: PlatformCard,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string | null {
  switch (card.variant) {
    case 'google_negative_terms':
      return negativesLabel(card.terms.length, uiTranslate);
    case 'google_promote_term':
      return uiTranslate ? uiTranslate('add_as_exact_keyword_70fba83') : 'Add as exact keyword';
    case 'google_bid_target': {
      const direction = card.proposed_target < card.current_target ? 'Lower' : 'Raise';
      const name = card.strategy === 'target_cpa' ? 'tCPA' : 'tROAS';
      return uiTranslate
        ? uiTranslate('helper_4d3cf5d9c766', {
            v0: direction,
            v1: name,
            v2: bidTargetLabel(card.proposed_target, card.strategy, card.currency, uiLocale),
          })
        : `${direction} the Google Ads bid target (${name}) to ${bidTargetLabel(card.proposed_target, card.strategy, card.currency, uiLocale)}`;
    }
    case 'meta_cost_cap': {
      const direction = card.proposed_cap < card.current_cap ? 'Lower' : 'Raise';
      return `${direction} the Meta cost cap (bid setting) to ${formatCurrency(card.proposed_cap, card.currency)}`;
    }
    case 'google_low_quality_keyword':
      return uiTranslate ? uiTranslate('pause_keyword_ecc15fd') : 'Pause keyword';
    case 'google_ad_drag':
      return uiTranslate ? uiTranslate('optimizer_pauseAd') : 'Pause ad';
    case 'tiktok_hook_retention':
      return uiTranslate ? uiTranslate('request_a_new_opening_22e4b24') : 'Request a new opening';
    case 'tiktok_spark_candidate':
      return uiTranslate ? uiTranslate('request_the_spark_code_481ff61') : 'Request the Spark code';
    case 'tiktok_budget_below_learning':
      return uiTranslate
        ? uiTranslate('helper_443ccaf321b9', {
            v0: formatCurrency(card.required_budget_per_day, card.currency, uiLocale),
          })
        : `Raise the budget to ${formatCurrency(card.required_budget_per_day, card.currency, uiLocale)}/day`;
    default:
      return null;
  }
}

/** The relearning cooldown in plain words, from the days since the last bid change. */
export function bidCooldownNote(
  daysSinceLastChange: number | null,
  uiTranslate?: ScaleCopy,
): string {
  if (daysSinceLastChange == null) {
    return uiTranslate
      ? uiTranslate('helper_aa5f95c27f5a', { v0: BID_RELEARNING_DAYS })
      : `No recent bid change on record. Google relearns for about ${BID_RELEARNING_DAYS} days after a target changes.`;
  }
  const ago =
    daysSinceLastChange === 0
      ? 'today'
      : uiTranslate
        ? uiTranslate('helper_4338c9096862', {
            v0: daysSinceLastChange,
            v1: daysSinceLastChange === 1 ? 'day' : 'days',
          })
        : `${daysSinceLastChange} ${daysSinceLastChange === 1 ? 'day' : 'days'} ago`;
  if (daysSinceLastChange < BID_RELEARNING_DAYS) {
    const left = BID_RELEARNING_DAYS - daysSinceLastChange;
    return uiTranslate
      ? uiTranslate('helper_76568ae18212', {
          v0: ago,
          v1: left,
          v2: left === 1 ? 'day' : 'days',
        })
      : `The target last changed ${ago}. Google is still relearning, so wait ${left} more ${left === 1 ? 'day' : 'days'} before changing it again.`;
  }
  return uiTranslate
    ? uiTranslate('helper_ad53d331fe56', { v0: ago, v1: BID_RELEARNING_DAYS })
    : `The target last changed ${ago}, past Google's ${BID_RELEARNING_DAYS}-day relearning period.`;
}

/** The Optimizer waits this long between two changes to one ad set's Meta cost cap. */
export const COST_CAP_COOLDOWN_DAYS = 7;

/** The Meta cost cap's cooldown in plain words, from the days since this service last changed it. */
export function costCapCooldownNote(daysSinceLastChange: number | null): string {
  if (daysSinceLastChange == null) {
    return `Continuum has not changed this cost cap before. It waits ${COST_CAP_COOLDOWN_DAYS} days between changes.`;
  }
  const ago =
    daysSinceLastChange === 0
      ? 'today'
      : `${daysSinceLastChange} ${daysSinceLastChange === 1 ? 'day' : 'days'} ago`;
  return `Continuum last changed this cost cap ${ago}. It waits ${COST_CAP_COOLDOWN_DAYS} days between changes.`;
}

type MetaCostCapCard = Extract<PlatformCard, { variant: 'meta_cost_cap' }>;

/** Whether the proposal reaches the portfolio CPA goal now or is a capped step toward it. */
export function costCapStepNote(card: MetaCostCapCard): string {
  if (card.proposed_cap === card.portfolio_goal) {
    return 'The proposed cost cap is the portfolio CPA goal.';
  }
  return `The gap to the portfolio CPA goal is larger than this portfolio's ${percentLabel(card.max_change_pct)} limit per cycle, so this is one step toward it.`;
}

/** Under Advantage campaign budget the campaign holds the bid strategy; the cap stays on the ad set. */
export const COST_CAP_CBO_NOTE =
  'This campaign uses Advantage campaign budget: the campaign holds the bid strategy, and each ad set keeps its own cost cap, which is what changes here.';

type BudgetLimitedCard = Extract<PlatformCard, { variant: 'google_budget_limited' }>;

/** What the proposed budget is expected to buy, as the producer projected it; null when there is
 *  no projection, or nothing proposed for it to stand on. */
export function budgetProjectionLabel(
  card: BudgetLimitedCard,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string | null {
  const projection = card.projection;
  if (projection == null || card.proposed_budget_per_day == null) return null;
  const perDay = uiTranslate
    ? uiTranslate('helper_34dd8b60efe4', { v0: card.result_label })
    : `${card.result_label}/day`;
  return uiTranslate
    ? uiTranslate('helper_3a949259de99', {
        v0: formatCurrency(card.proposed_budget_per_day, card.currency, uiLocale),
        v1: countLabel(projection.results_per_day_low, uiLocale),
        v2: countLabel(projection.results_per_day_high, uiLocale),
        v3: perDay,
        v4: countLabel(projection.results_per_day_now, uiLocale),
        v5: projection.basis_days,
      })
    : `At ${formatCurrency(card.proposed_budget_per_day, card.currency, uiLocale)}/day: about ${countLabel(projection.results_per_day_low, uiLocale)}–${countLabel(projection.results_per_day_high, uiLocale)} ${perDay} (now ${countLabel(projection.results_per_day_now, uiLocale)}), based on ${projection.basis_days} days`;
}

export function countLabel(value: number, uiLocale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(uiLocale, { maximumFractionDigits: 1 }).format(value);
}

function plural(count: number, one: string, many: string, uiLocale: UiLocale = 'en'): string {
  return `${countLabel(count, uiLocale)} ${count === 1 ? one : many}`;
}

function windowLabel(click: number, view: number, uiTranslate?: ScaleCopy): string {
  return uiTranslate
    ? uiTranslate('helper_75f1f32c0610', { v0: click, v1: view })
    : `${click}-day click / ${view}-day view`;
}

export function googleAdsCampaignHref(campaignId: string): string {
  return `https://ads.google.com/aw/campaigns?campaignId=${encodeURIComponent(campaignId)}`;
}

/** Google Ads' campaigns list: where a card that carries no campaign id sends a person. */
export const GOOGLE_ADS_CAMPAIGNS_HREF = 'https://ads.google.com/aw/campaigns';

/** Where a delivery problem is fixed: the policy manager when ads are disapproved, the
 *  campaigns list otherwise. The card carries no campaign id, so it never deep-links one. */
export function googleDeliveryHref(disapprovedAds: number): string {
  return disapprovedAds > 0 ? 'https://ads.google.com/aw/policymanager' : GOOGLE_ADS_CAMPAIGNS_HREF;
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
  // campaign.serving_status when it is not SERVING (G12 quotes it as SERVING_STATUS_<status>):
  // Easy Fit 2026 read ELIGIBLE with no reason while serving said SUSPENDED (billing).
  SERVING_STATUS_SUSPENDED: 'suspended',
  SERVING_STATUS_ENDED: 'its end date has passed',
  SERVING_STATUS_PENDING: 'not started yet',
  SERVING_STATUS_NONE: 'not serving',
};

function codeInWords(code: string): string {
  return code.toLowerCase().replace(/_+/g, ' ').trim();
}

/** "LONG_HEADLINE" → "Long headline": a Google enum as the start of a sentence. */
export function codeLabel(code: string, uiTranslate?: ScaleCopy): string {
  if (uiTranslate) return uiTranslate('platformAssetType', { code });
  const words = codeInWords(code);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type PmaxAsset = Extract<PlatformCard, { variant: 'google_pmax_assets' }>['assets'][number];

/** One asset of a PMax assets card against the best of its own field type. */
export function pmaxAssetLine(
  asset: PmaxAsset,
  currency: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  if (uiTranslate)
    return uiTranslate('platformPmaxAssetLine', {
      kind: codeLabel(asset.field_type, uiTranslate),
      kindLower: codeLabel(asset.field_type, uiTranslate).toLocaleLowerCase(uiLocale),
      name: asset.label,
      hasCost: asset.cost_per_result != null ? 'yes' : 'no',
      cost:
        asset.cost_per_result != null
          ? formatCurrency(asset.cost_per_result, currency, uiLocale)
          : '',
      count: asset.conversions,
      spend: formatCurrency(asset.spend, currency, uiLocale),
      best: asset.best_of_kind.label,
      bestCost: formatCurrency(asset.best_of_kind.cost_per_result, currency, uiLocale),
    });
  const kind = codeInWords(asset.field_type);
  const spent = formatCurrency(asset.spend, currency, uiLocale);
  const cost =
    asset.cost_per_result == null
      ? `spent ${spent} with no conversion`
      : `costs ${formatCurrency(asset.cost_per_result, currency, uiLocale)} per conversion (${plural(asset.conversions, 'conversion', 'conversions', uiLocale)}, ${spent} spent)`;
  return `${codeLabel(asset.field_type, uiTranslate)} "${asset.label}" ${cost}; the best ${kind}, "${asset.best_of_kind.label}", converts at ${formatCurrency(asset.best_of_kind.cost_per_result, currency, uiLocale)}.`;
}

const GOOGLE_REASON_KEYS = {
  HAS_ADS_DISAPPROVED: 'platformGoogleReason_HAS_ADS_DISAPPROVED',
  HAS_ADS_LIMITED_BY_POLICY: 'platformGoogleReason_HAS_ADS_LIMITED_BY_POLICY',
  MOST_ADS_UNDER_REVIEW: 'platformGoogleReason_MOST_ADS_UNDER_REVIEW',
  HAS_ASSET_GROUPS_DISAPPROVED: 'platformGoogleReason_HAS_ASSET_GROUPS_DISAPPROVED',
  HAS_ASSET_GROUPS_LIMITED_BY_POLICY: 'platformGoogleReason_HAS_ASSET_GROUPS_LIMITED_BY_POLICY',
  MOST_ASSET_GROUPS_UNDER_REVIEW: 'platformGoogleReason_MOST_ASSET_GROUPS_UNDER_REVIEW',
  BUDGET_CONSTRAINED: 'platformGoogleReason_BUDGET_CONSTRAINED',
  BUDGET_MISCONFIGURED: 'platformGoogleReason_BUDGET_MISCONFIGURED',
  BIDDING_STRATEGY_MISCONFIGURED: 'platformGoogleReason_BIDDING_STRATEGY_MISCONFIGURED',
  BIDDING_STRATEGY_LIMITED: 'platformGoogleReason_BIDDING_STRATEGY_LIMITED',
  BIDDING_STRATEGY_CONSTRAINED: 'platformGoogleReason_BIDDING_STRATEGY_CONSTRAINED',
  BIDDING_STRATEGY_LEARNING: 'platformGoogleReason_BIDDING_STRATEGY_LEARNING',
  SEARCH_VOLUME_LIMITED: 'platformGoogleReason_SEARCH_VOLUME_LIMITED',
  NO_AD_GROUPS: 'platformGoogleReason_NO_AD_GROUPS',
  AD_GROUPS_PAUSED: 'platformGoogleReason_AD_GROUPS_PAUSED',
  NO_AD_GROUP_ADS: 'platformGoogleReason_NO_AD_GROUP_ADS',
  AD_GROUP_ADS_PAUSED: 'platformGoogleReason_AD_GROUP_ADS_PAUSED',
  NO_KEYWORDS: 'platformGoogleReason_NO_KEYWORDS',
  KEYWORDS_PAUSED: 'platformGoogleReason_KEYWORDS_PAUSED',
  NO_ASSET_GROUPS: 'platformGoogleReason_NO_ASSET_GROUPS',
  ASSET_GROUPS_PAUSED: 'platformGoogleReason_ASSET_GROUPS_PAUSED',
  CAMPAIGN_PENDING: 'platformGoogleReason_CAMPAIGN_PENDING',
  CAMPAIGN_ENDED: 'platformGoogleReason_CAMPAIGN_ENDED',
  CAMPAIGN_PAUSED: 'platformGoogleReason_CAMPAIGN_PAUSED',
  CAMPAIGN_GROUP_PAUSED: 'platformGoogleReason_CAMPAIGN_GROUP_PAUSED',
  MISSING_LEAD_FORM_EXTENSION: 'platformGoogleReason_MISSING_LEAD_FORM_EXTENSION',
  LEAD_FORM_EXTENSION_DISAPPROVED: 'platformGoogleReason_LEAD_FORM_EXTENSION_DISAPPROVED',
  LEAD_FORM_EXTENSION_UNDER_REVIEW: 'platformGoogleReason_LEAD_FORM_EXTENSION_UNDER_REVIEW',
} as const;
export function googleReasonInWords(code: string, uiTranslate?: ScaleCopy): string {
  if (uiTranslate)
    return uiTranslate(
      Object.hasOwn(GOOGLE_REASON_KEYS, code)
        ? GOOGLE_REASON_KEYS[code as keyof typeof GOOGLE_REASON_KEYS]
        : 'platformGoogleReasonUnknown',
      { code },
    );
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

export function tiktokStatusInWords(status: string, uiTranslate?: ScaleCopy): string {
  if (uiTranslate) return uiTranslate('platformTikTokStatus', { status });
  return TIKTOK_STATUS_WORDS[status] ?? codeInWords(status.replace(/^ADGROUP_STATUS_/, ''));
}

function darkFor(days: number, uiLocale: UiLocale = 'en'): string {
  return days === 0
    ? 'is not serving'
    : `has not served for ${plural(days, 'day', 'days', uiLocale)}`;
}

/** Fractions to whole percent ("41%"), one decimal under 10 ("0.8%"). */
export function percentLabel(fraction: number, locale: UiLocale = 'en'): string {
  const pct = fraction * 100;
  const digits = pct !== 0 && Math.abs(pct) < 10 ? 1 : 0;
  return `${formatDecimal(pct, digits, locale)}%`;
}

export function givingLegs(legs: readonly CrossPlatformLeg[]): CrossPlatformLeg[] {
  return legs.filter((leg) => leg.to_per_day < leg.from_per_day);
}

export function takingLegs(legs: readonly CrossPlatformLeg[]): CrossPlatformLeg[] {
  return legs.filter((leg) => leg.to_per_day > leg.from_per_day);
}

/** A leg's change as the card prints it: "−4.2%" or "+25%". */
export function legChangeLabel(
  leg: CrossPlatformLeg,
  uiTranslate?: ScaleCopy,
  locale: UiLocale = 'en',
): string {
  if (leg.from_per_day === 0) return uiTranslate ? uiTranslate('new_18fdd54') : 'new';
  const change = (leg.to_per_day - leg.from_per_day) / leg.from_per_day;
  const label = percentLabel(Math.abs(change), locale);
  return change < 0 ? `−${label}` : `+${label}`;
}

/** The money a move shifts per day: what the giving legs take off. */
export function movedPerDay(legs: readonly CrossPlatformLeg[]): number {
  return givingLegs(legs).reduce((sum, leg) => sum + (leg.from_per_day - leg.to_per_day), 0);
}

function platformList(platforms: readonly AdPlatform[], uiTranslate?: ScaleCopy): string {
  const names = [...new Set(platforms)].map((platform) => PLATFORM_NAMES[platform]);
  if (names.length <= 1) return names[0] ?? '';
  return uiTranslate
    ? uiTranslate('helper_c6a22df1409d', {
        v0: names.slice(0, -1).join(', '),
        v1: names[names.length - 1],
      })
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Wed 1 Oct, 00:00 (America/Mexico_City)" in the advertiser's own timezone when we have it. */
export function scheduledLabel(
  iso: string,
  timezone: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  const date = new Date(iso);
  const zone = timezone ?? 'UTC';
  try {
    // Assembled from parts: ICU builds disagree on en-GB's punctuation ("Thu, 1 Oct, 00:00"
    // vs "Thu 1 Oct, 00:00"), and the label must read the same on every runtime.
    const parts = new Intl.DateTimeFormat(uiLocale === 'en' ? 'en-GB' : uiLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: zone,
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    return uiTranslate
      ? uiTranslate('helper_aa92a172516e', {
          v0: part('weekday'),
          v1: part('day'),
          v2: part('month'),
          v3: part('hour'),
          v4: part('minute'),
          v5: zone,
        })
      : `${part('weekday')}, ${part('day')} ${part('month')} at ${part('hour')}:${part('minute')} (${zone})`;
  } catch {
    return uiTranslate
      ? uiTranslate('helper_18d23516f886', {
          v0: date.toISOString().slice(0, 16).replace('T', ' '),
        })
      : `${date.toISOString().slice(0, 16).replace('T', ' ')} (UTC)`;
  }
}

/** The card's title: entity + figure + comparison, from the producer's own fields. */
function platformCardTitleBase(
  card: PlatformCard,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  switch (card.variant) {
    case 'google_budget_limited': {
      const cost =
        card.cost_per_result != null
          ? ` with ${card.result_label} at ${formatCurrency(card.cost_per_result, card.currency, uiLocale)}`
          : '';
      const days = card.days_limited != null ? `, ${card.days_limited} days running` : '';
      return uiTranslate
        ? uiTranslate('helper_5317bfac2c7e', {
            v0: card.campaign_name,
            v1: percentLabel(card.budget_lost_impression_share, uiLocale),
            v2: cost,
            v3: days,
          })
        : `${card.campaign_name} loses ${percentLabel(card.budget_lost_impression_share, uiLocale)} of impressions to budget${cost}${days}`;
    }
    case 'google_pmax_asset_group': {
      const short = card.asset_groups.filter((group) => group.missing.length > 0).length;
      const groups = card.asset_groups.length;
      return short === 0
        ? `${card.campaign_name}: ${groups} ${groups === 1 ? 'asset group' : 'asset groups'}, none missing assets`
        : `${card.campaign_name}: ${short} of ${groups} ${groups === 1 ? 'asset group is' : 'asset groups are'} missing assets`;
    }
    case 'google_video_readonly':
      return uiTranslate
        ? uiTranslate('helper_db8c55b8db8b', { v0: card.campaign_name })
        : `${card.campaign_name} is a Video campaign, read-only here`;
    case 'tiktok_creative_fatigue':
    case 'meta_creative_fatigue': {
      const frequency =
        card.frequency != null
          ? ` with frequency ${formatDecimal(card.frequency, 1, uiLocale)}`
          : '';
      return uiTranslate
        ? uiTranslate('helper_12902625cfc5', {
            v0: card.creative_name,
            v1: percentLabel(card.ctr_before, uiLocale),
            v2: percentLabel(card.ctr_now, uiLocale),
            v3: card.days,
            v4: frequency,
          })
        : `"${card.creative_name}" fell from ${percentLabel(card.ctr_before, uiLocale)} to ${percentLabel(card.ctr_now, uiLocale)} CTR in ${card.days} days${frequency}`;
    }
    case 'tiktok_scheduled_decrease':
      return uiTranslate
        ? uiTranslate('helper_ce5b277aaced', {
            v0: card.ad_group_name,
            v1: formatCurrency(card.target_budget_per_day, card.currency, uiLocale),
            v2: formatCurrency(card.budget_per_day, card.currency, uiLocale),
            v3: scheduledLabel(card.effective_at, card.timezone, uiTranslate, uiLocale),
          })
        : `${card.ad_group_name}: budget down to ${formatCurrency(card.target_budget_per_day, card.currency, uiLocale)}/day from ${formatCurrency(card.budget_per_day, card.currency, uiLocale)}, scheduled for ${scheduledLabel(card.effective_at, card.timezone, uiTranslate, uiLocale)}`;
    case 'cross_platform_move':
      return uiTranslate
        ? uiTranslate('helper_a66bbcfe1c8b', {
            v0: formatCurrency(movedPerDay(card.legs), card.currency, uiLocale),
            v1: platformList(
              givingLegs(card.legs).map((leg) => leg.platform),
              uiTranslate,
            ),
            v2: platformList(
              takingLegs(card.legs).map((leg) => leg.platform),
              uiTranslate,
            ),
          })
        : `Move ${formatCurrency(movedPerDay(card.legs), card.currency, uiLocale)}/day from ${platformList(
            givingLegs(card.legs).map((leg) => leg.platform),
            uiTranslate,
          )} to ${platformList(
            takingLegs(card.legs).map((leg) => leg.platform),
            uiTranslate,
          )}`;
    case 'google_negative_terms': {
      const spend = card.terms.reduce((sum, term) => sum + term.spend, 0);
      const conversions = card.terms.reduce((sum, term) => sum + term.conversions, 0);
      const result =
        conversions === 0
          ? 'without a conversion'
          : `for ${plural(conversions, 'conversion', 'conversions', uiLocale)}`;
      return uiTranslate
        ? uiTranslate('helper_c62e964b4934', {
            v0: plural(card.terms.length, 'search term', 'search terms', uiLocale),
            v1: card.campaign_name,
            v2: formatCurrency(spend, card.currency, uiLocale),
            v3: card.window_days,
            v4: result,
          })
        : `${plural(card.terms.length, 'search term', 'search terms', uiLocale)} in ${card.campaign_name} spent ${formatCurrency(spend, card.currency, uiLocale)} in ${card.window_days} days ${result}`;
    }
    case 'google_promote_term': {
      const cost =
        card.cost_per_result != null
          ? ` at ${formatCurrency(card.cost_per_result, card.currency, uiLocale)}`
          : '';
      return uiTranslate
        ? uiTranslate('helper_20a939769608', {
            v0: card.term,
            v1: plural(card.conversions, 'conversion', 'conversions', uiLocale),
            v2: cost,
            v3: card.window_days,
          })
        : `"${card.term}" brought ${plural(card.conversions, 'conversion', 'conversions', uiLocale)}${cost} in ${card.window_days} days and is not a keyword yet`;
    }
    case 'google_bid_target': {
      const name = card.strategy === 'target_cpa' ? 'tCPA' : 'tROAS';
      const actual =
        card.actual != null
          ? `, actual ${bidTargetLabel(card.actual, card.strategy, card.currency, uiLocale)} over ${card.window_days} days`
          : '';
      return uiTranslate
        ? uiTranslate('helper_7532cd45a973', {
            v0: card.campaign_name,
            v1: name,
            v2: bidTargetLabel(card.current_target, card.strategy, card.currency, uiLocale),
            v3: actual,
          })
        : `${card.campaign_name}: Google Ads bid target (${name}) ${bidTargetLabel(card.current_target, card.strategy, card.currency, uiLocale)}${actual}`;
    }
    case 'google_low_quality_keyword':
      return uiTranslate
        ? uiTranslate('helper_ca942cfb80e5', {
            v0: card.keyword,
            v1: card.quality_score,
            v2: formatCurrency(card.spend, card.currency, uiLocale),
            v3: card.window_days,
            v4: plural(card.conversions, 'conversion', 'conversions', uiLocale),
          })
        : `"${card.keyword}" has Quality Score ${card.quality_score}/10 and spent ${formatCurrency(card.spend, card.currency, uiLocale)} in ${card.window_days} days with ${plural(card.conversions, 'conversion', 'conversions', uiLocale)}`;
    case 'tiktok_hook_retention':
      return uiTranslate
        ? uiTranslate('helper_1338a04ca041', {
            v0: card.creative_name,
            v1: percentLabel(card.hold_2s, uiLocale),
            v2: percentLabel(card.portfolio_hold_2s, uiLocale),
          })
        : `"${card.creative_name}" holds ${percentLabel(card.hold_2s, uiLocale)} of viewers past 2 seconds, against ${percentLabel(card.portfolio_hold_2s, uiLocale)} across the portfolio`;
    case 'tiktok_spark_candidate':
      return uiTranslate
        ? uiTranslate('helper_2fadc86d2995', {
            v0: countLabel(card.views, uiLocale),
            v1: percentLabel(card.engagement_rate, uiLocale),
          })
        : `An organic post has ${countLabel(card.views, uiLocale)} views and ${percentLabel(card.engagement_rate, uiLocale)} engagement, and is not promoted`;
    case 'tiktok_budget_below_learning':
      return uiTranslate
        ? uiTranslate('helper_bd723ac42b0e', {
            v0: card.ad_group_name,
            v1: formatCurrency(card.budget_per_day, card.currency, uiLocale),
            v2: formatCurrency(card.required_budget_per_day, card.currency, uiLocale),
          })
        : `${card.ad_group_name}: budget ${formatCurrency(card.budget_per_day, card.currency, uiLocale)}/day, under the ${formatCurrency(card.required_budget_per_day, card.currency, uiLocale)}/day learning needs`;
    case 'tiktok_attribution_window':
      return uiTranslate
        ? uiTranslate('helper_1bccc85a66dc', {
            v0: card.ad_group_name,
            v1: windowLabel(card.click_window_days, card.view_window_days, uiTranslate),
            v2: PLATFORM_NAMES[card.compared_to.platform],
            v3: windowLabel(
              card.compared_to.click_window_days,
              card.compared_to.view_window_days,
              uiTranslate,
            ),
          })
        : `${card.ad_group_name} counts ${windowLabel(card.click_window_days, card.view_window_days, uiTranslate)}, ${PLATFORM_NAMES[card.compared_to.platform]} counts ${windowLabel(card.compared_to.click_window_days, card.compared_to.view_window_days, uiTranslate)}`;
    case 'google_delivery_issue':
      return card.account_wide
        ? `No campaign in the account ${card.dark_days === 0 ? 'is serving' : `has served for ${plural(card.dark_days, 'day', 'days', uiLocale)}`}: one cause for the whole account`
        : `${card.campaign_name} ${darkFor(card.dark_days, uiLocale)}`;
    case 'tiktok_delivery_issue': {
      const status =
        card.secondary_status != null ? `: ${tiktokStatusInWords(card.secondary_status)}` : '';
      return `${card.ad_group_name} ${darkFor(card.dark_days, uiLocale)}${status}`;
    }
    case 'google_ad_drag':
      return card.cost_per_result == null
        ? `"${card.ad_label}" in ${card.ad_group_name} spent ${formatCurrency(card.spend, card.currency, uiLocale)} in ${card.window_days} days without a conversion`
        : `"${card.ad_label}" takes ${percentLabel(card.spend_share, uiLocale)} of ${card.ad_group_name}'s spend at ${formatCurrency(card.cost_per_result, card.currency, uiLocale)} per conversion`;
    case 'google_ad_winner':
      return uiTranslate
        ? uiTranslate('helper_ad97fbfed8a8', {
            v0: card.winner.label,
            v1: card.ad_group_name,
            v2: formatCurrency(card.winner.cost_per_result, card.currency, uiLocale),
            v3: formatCurrency(card.comparator.cost_per_result, card.currency, uiLocale),
          })
        : `"${card.winner.label}" is the best ad in ${card.ad_group_name}: ${formatCurrency(card.winner.cost_per_result, card.currency, uiLocale)} per conversion against ${formatCurrency(card.comparator.cost_per_result, card.currency, uiLocale)}`;
    case 'google_audience_saturation':
      return uiTranslate
        ? uiTranslate('helper_e9374d3c00c0', {
            v0: card.campaign_name,
            v1: countLabel(card.frequency, uiLocale),
            v2: formatCurrency(card.cost_per_result_now, card.currency, uiLocale),
            v3: formatCurrency(card.cost_per_result_before, card.currency, uiLocale),
          })
        : `The same people saw ${card.campaign_name} ${countLabel(card.frequency, uiLocale)} times in 7 days, and a result now costs ${formatCurrency(card.cost_per_result_now, card.currency, uiLocale)} against ${formatCurrency(card.cost_per_result_before, card.currency, uiLocale)}`;
    case 'google_pmax_assets': {
      // A PMax campaign's one asset group often carries the campaign's own name.
      const where =
        card.asset_group_name === card.campaign_name
          ? card.campaign_name
          : `${card.asset_group_name} (${card.campaign_name})`;
      const one = card.assets.length === 1;
      return uiTranslate
        ? uiTranslate('helper_618c842b8da4', {
            v0: plural(card.assets.length, 'asset', 'assets', uiLocale),
            v1: where,
            v2: one ? 'costs' : 'cost',
            v3: one ? 'its' : 'their',
          })
        : `${plural(card.assets.length, 'asset', 'assets', uiLocale)} in ${where} ${one ? 'costs' : 'cost'} more than the best of ${one ? 'its' : 'their'} kind`;
    }
    case 'google_account_finding':
      return card.headline;
    case 'meta_cost_cap':
      return `${card.ad_set_name}: Meta cost cap (bid setting) ${formatCurrency(card.current_cap, card.currency)}, portfolio CPA goal ${formatCurrency(card.portfolio_goal, card.currency)}`;
  }
}

type AccountFindingCard = Extract<PlatformCard, { variant: 'google_account_finding' }>;
type AccountFindingBar = NonNullable<AccountFindingCard['bars']>[number];
export type AccountFindingStatus = AccountFindingCard['checklist'][number]['status'];

/** On an account the client runs, the card recommends and verifies; it never offers a write. */
export const RECOMMEND_ONLY_BADGE = 'Client executes · recommend only';

/** "Search | Marca · last 30 days", or the whole account when no campaign is named. */
export function accountFindingScope(card: AccountFindingCard): string {
  return `${card.campaign_name ?? 'Whole account'} · last ${plural(card.window_days, 'day', 'days')}`;
}

/** A bar's own figure in the card's unit; a bar without a unit counts. */
export function accountBarValueLabel(
  value: number,
  unit: AccountFindingCard['unit'],
  currency: string | null,
): string {
  if (unit === 'money') return formatCurrency(value, currency);
  if (unit === 'share') return percentLabel(value);
  return countLabel(value);
}

export type AccountBarGeometry = {
  /** 0..1 of the track the bar fills. */
  width: number;
  /** 0..1 of the track where the target tick sits; null without a target. */
  target: number | null;
};

/** Where each bar ends and where its target tick sits, relative to the largest bar. When the
 *  bars split a whole they are drawn by share, on the same scale as their target shares, so a
 *  tick and a bar can be compared by eye; otherwise by value. Geometry only: every figure the
 *  card prints is the producer's. */
export function accountBarGeometry(bars: readonly AccountFindingBar[]): AccountBarGeometry[] {
  const byShare = bars.length > 0 && bars.every((bar) => bar.share != null);
  const extent = Math.max(
    0,
    ...bars.map((bar) => (byShare ? (bar.share ?? 0) : bar.value)),
    ...bars.map((bar) => (byShare ? (bar.target_share ?? 0) : 0)),
  );
  const fraction = (amount: number) => (extent > 0 ? Math.min(1, amount / extent) : 0);
  return bars.map((bar) => ({
    width: fraction(byShare ? (bar.share ?? 0) : bar.value),
    target: byShare && bar.target_share != null ? fraction(bar.target_share) : null,
  }));
}

/** The checklist chip: a glyph and a word for each verified status; null has no chip. */
export const CHECKLIST_STATUS: Record<
  NonNullable<AccountFindingStatus>,
  { glyph: string; label: string }
> = {
  done: { glyph: '✓', label: 'Done' },
  partial: { glyph: '◐', label: 'Partial' },
  pending: { glyph: '✗', label: 'Pending' },
};

/** A negative list as Google Ads' bulk editor takes it: one term per line. */
export function negativesClipboardText(terms: readonly string[]): string {
  return terms.join('\n');
}

export const ATTRIBUTION_WINDOW_NOTE =
  'Different attribution windows count different conversions, so we do not compare these platforms until the windows match.';

export const SPARK_NOTE =
  "As a Spark Ad the post keeps its likes and comments. It needs the creator's authorization code first.";

export const CROSS_PLATFORM_APPROVAL_NOTE =
  'We recommend a person approves moves between platforms: one approval writes every leg, budget comes off first.';

export const VIDEO_READONLY_NOTE =
  'Google does not let the API pause or change budgets on Video campaigns. Change it in Google Ads if you want to scale it.';

export const PMAX_ASSETS_NOTE =
  'Add a replacement before removing one: Google needs enough assets of each kind.';

export const PMAX_NOTE =
  'Google does not report conversions per asset group; it does say what each one is missing.';

/** First-party card summaries from structured fields; source asset/campaign names are interpolated verbatim. */
export function platformCardTitle(
  card: PlatformCard,
  t?: ScaleCopy,
  locale: UiLocale = 'en',
): string {
  if (!t) return platformCardTitleBase(card, undefined, locale);
  const money = (value: number, currency: string | null) => formatCurrency(value, currency, locale);
  switch (card.variant) {
    case 'google_budget_limited':
      return t('platformBudgetLimitedTitle', {
        name: card.campaign_name,
        lost: percentLabel(card.budget_lost_impression_share, locale),
        hasCost: card.cost_per_result != null ? 'yes' : 'no',
        result: card.result_label,
        cost: card.cost_per_result != null ? money(card.cost_per_result, card.currency) : '',
        hasDays: card.days_limited != null ? 'yes' : 'no',
        days: card.days_limited ?? 0,
      });
    case 'google_pmax_asset_group':
      return t('platformPmaxGroupsTitle', {
        name: card.campaign_name,
        count: card.asset_groups.length,
        short: card.asset_groups.filter((group) => group.missing.length > 0).length,
      });
    case 'tiktok_creative_fatigue':
    case 'meta_creative_fatigue':
      return t('platformFatigueTitle', {
        name: card.creative_name,
        before: percentLabel(card.ctr_before, locale),
        now: percentLabel(card.ctr_now, locale),
        days: card.days,
        hasFrequency: card.frequency != null ? 'yes' : 'no',
        frequency: card.frequency != null ? formatDecimal(card.frequency, 1, locale) : '',
      });
    case 'google_negative_terms':
      return t('platformNegativeTermsTitle', {
        count: card.terms.length,
        name: card.campaign_name,
        spend: money(
          card.terms.reduce((sum, term) => sum + term.spend, 0),
          card.currency,
        ),
        days: card.window_days,
        conversions: card.terms.reduce((sum, term) => sum + term.conversions, 0),
      });
    case 'google_promote_term':
      return t('platformPromoteTermTitle', {
        term: card.term,
        count: card.conversions,
        hasCost: card.cost_per_result != null ? 'yes' : 'no',
        cost: card.cost_per_result != null ? money(card.cost_per_result, card.currency) : '',
        days: card.window_days,
      });
    case 'google_bid_target':
      return t('platformBidTargetTitle', {
        name: card.campaign_name,
        strategy: card.strategy === 'target_cpa' ? 'tCPA' : 'tROAS',
        target: bidTargetLabel(card.current_target, card.strategy, card.currency, locale),
        hasActual: card.actual != null ? 'yes' : 'no',
        actual:
          card.actual != null
            ? bidTargetLabel(card.actual, card.strategy, card.currency, locale)
            : '',
        days: card.window_days,
      });
    case 'google_low_quality_keyword':
      return t('platformQualityTitle', {
        keyword: card.keyword,
        score: card.quality_score,
        spend: money(card.spend, card.currency),
        days: card.window_days,
        count: card.conversions,
      });
    case 'google_delivery_issue':
      return t('platformGoogleDeliveryTitle', {
        wide: card.account_wide ? 'yes' : 'no',
        name: card.campaign_name,
        days: card.dark_days,
      });
    case 'tiktok_delivery_issue':
      return t('platformTikTokDeliveryTitle', {
        name: card.ad_group_name,
        days: card.dark_days,
        hasStatus: card.secondary_status ? 'yes' : 'no',
        status: card.secondary_status ? tiktokStatusInWords(card.secondary_status, t) : '',
      });
    case 'google_ad_drag':
      return t('platformAdDragTitle', {
        name: card.ad_label,
        group: card.ad_group_name,
        hasCost: card.cost_per_result != null ? 'yes' : 'no',
        share: percentLabel(card.spend_share, locale),
        cost: card.cost_per_result != null ? money(card.cost_per_result, card.currency) : '',
        spend: money(card.spend, card.currency),
        days: card.window_days,
      });
    case 'google_pmax_assets':
      return t('platformPmaxAssetsTitle', {
        count: card.assets.length,
        name:
          card.asset_group_name === card.campaign_name
            ? card.campaign_name
            : `${card.asset_group_name} (${card.campaign_name})`,
      });
    default:
      return platformCardTitleBase(card, t, locale);
  }
}

const PLATFORM_CARD_TYPE_KEYS = {
  google_account_finding: 'beta_accountFinding',
  meta_cost_cap: 'beta_metaCostCap',
  google_budget_limited: 'budget_1c6225e',
  google_pmax_asset_group: 'asset_group_0cdcb5b',
  google_video_readonly: 'platformTypeReadOnly',
  tiktok_creative_fatigue: 'creative_2c7e633',
  meta_creative_fatigue: 'creative_2c7e633',
  tiktok_scheduled_decrease: 'platformTypeScheduledBudget',
  cross_platform_move: 'accountVerb_reallocate',
  google_negative_terms: 'platformTypeNegatives',
  google_promote_term: 'search_term_c474ada',
  google_bid_target: 'platformTypeBid',
  google_low_quality_keyword: 'keyword_a668022',
  tiktok_hook_retention: 'hook_536ff50',
  tiktok_spark_candidate: 'platformTypeSpark',
  tiktok_budget_below_learning: 'platformTypeLearning',
  tiktok_attribution_window: 'attribution_a902dcc',
  google_delivery_issue: 'delivery_52bfe58',
  tiktok_delivery_issue: 'delivery_52bfe58',
  google_ad_drag: 'ad_1d97c9f',
  google_ad_winner: 'creative_2c7e633',
  google_audience_saturation: 'audience_545c023',
  google_pmax_assets: 'assets_bd12731',
} as const satisfies Record<PlatformCard['variant'], Parameters<ScaleCopy>[0]>;
export function platformCardType(card: PlatformCard, translate: ScaleCopy): string {
  return translate(PLATFORM_CARD_TYPE_KEYS[card.variant]);
}
