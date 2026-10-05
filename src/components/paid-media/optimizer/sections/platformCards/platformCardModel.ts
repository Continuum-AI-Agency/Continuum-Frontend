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
      return ['google_ads'];
    case 'tiktok_creative_fatigue':
    case 'tiktok_scheduled_decrease':
      return ['tiktok_ads'];
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
  tiktok_scheduled_decrease: 'Scheduled budget',
  cross_platform_move: 'Move budget',
};

/** Whether the card may carry an action button. A Video campaign cannot be written through
 *  Google's API, so its card sends a person to Google Ads and offers nothing to approve. */
export function isReadOnly(card: PlatformCard): boolean {
  return card.variant === 'google_video_readonly';
}

export function googleAdsCampaignHref(campaignId: string): string {
  return `https://ads.google.com/aw/campaigns?campaignId=${encodeURIComponent(campaignId)}`;
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
    case 'tiktok_creative_fatigue': {
      const frequency =
        card.frequency != null ? ` with frequency ${card.frequency.toFixed(1)}` : '';
      return `"${card.creative_name}" fell from ${percentLabel(card.ctr_before)} to ${percentLabel(card.ctr_now)} CTR in ${card.days} days${frequency}`;
    }
    case 'tiktok_scheduled_decrease':
      return `${card.ad_group_name}: budget down to ${formatCurrency(card.target_budget_per_day, card.currency)}/day from ${formatCurrency(card.budget_per_day, card.currency)}, scheduled for ${scheduledLabel(card.effective_at, card.timezone)}`;
    case 'cross_platform_move':
      return `Move ${formatCurrency(movedPerDay(card.legs), card.currency)}/day from ${platformList(givingLegs(card.legs).map((leg) => leg.platform))} to ${platformList(takingLegs(card.legs).map((leg) => leg.platform))}`;
  }
}

export const CROSS_PLATFORM_APPROVAL_NOTE =
  'We recommend a person approves moves between platforms: one approval writes every leg, budget comes off first.';

export const VIDEO_READONLY_NOTE =
  'Google does not let the API pause or change budgets on Video campaigns. Change it in Google Ads if you want to scale it.';

export const PMAX_NOTE =
  'Google does not report conversions per asset group; it does say what each one is missing.';
