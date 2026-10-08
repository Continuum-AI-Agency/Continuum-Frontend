// The portfolio picker beyond Meta (frontend.html §7, feature 07): Platform → Campaign →
// Ad set / Ad group / Asset group. Google moves money at the campaign budget, so a campaign is
// the unit; its ad groups (or a Performance Max campaign's asset groups) show what it holds.
// Campaign types the optimizer cannot act on stay in the list, disabled, with the reason said —
// never filtered out silently. And a platform whose account bills in another currency than the
// portfolio is refused whole (decisiones 21, escenarios 14 and 15).
//
// Pure: the picker component and its tests both build from here.

import { type AdPlatform, PLATFORM_NAMES } from '../sections/platforms/platformTabsModel';

export type PickerChildKind = 'adset' | 'ad_group' | 'asset_group';

export const CHILD_KIND_LABELS: Record<PickerChildKind, { one: string; many: string }> = {
  adset: { one: 'ad set', many: 'Ad sets' },
  ad_group: { one: 'ad group', many: 'Ad groups' },
  asset_group: { one: 'asset group', many: 'Asset groups' },
};

export type GoogleCampaignRow = {
  id: string;
  name: string;
  /** campaign.advertising_channel_type, or null when the read did not carry it. */
  channelType: string | null;
  spend: number;
};

export type GoogleAdGroupRow = { id: string; name: string; campaignId: string };

type Eligibility =
  | { eligible: true; typeLabel: string; childKind: PickerChildKind }
  | { eligible: false; typeLabel: string; reason: string };

const VIDEO_REASON =
  'Google does not let the API pause or change budgets on Video campaigns. Change it in Google Ads.';

/** What the optimizer can do with a Google campaign of this channel type. */
export function googleCampaignEligibility(channelType: string | null): Eligibility {
  switch (channelType) {
    case 'SEARCH':
      return { eligible: true, typeLabel: 'Search', childKind: 'ad_group' };
    case 'PERFORMANCE_MAX':
      return { eligible: true, typeLabel: 'Performance Max', childKind: 'asset_group' };
    case 'DEMAND_GEN':
    case 'DISCOVERY':
      return { eligible: true, typeLabel: 'Demand Gen', childKind: 'ad_group' };
    case 'SHOPPING':
      return { eligible: true, typeLabel: 'Shopping', childKind: 'ad_group' };
    case 'SMART':
      return {
        eligible: false,
        typeLabel: 'Smart',
        reason:
          'Smart campaigns are outside this version: Google sets their bidding and targeting itself.',
      };
    case 'DISPLAY':
      return {
        eligible: false,
        typeLabel: 'Display',
        reason:
          'Display campaigns are outside this version: they buy reach, not the results a portfolio is judged on.',
      };
    case 'VIDEO':
      return { eligible: false, typeLabel: 'Video', reason: VIDEO_REASON };
    case null:
      return {
        eligible: false,
        typeLabel: 'Unknown type',
        reason: "The read did not say this campaign's type, so it can't be added.",
      };
    default:
      return {
        eligible: false,
        typeLabel: channelType.charAt(0) + channelType.slice(1).toLowerCase().replace(/_/g, ' '),
        reason: 'This campaign type is outside this version.',
      };
  }
}

/** The currency rule: a platform joins only when both sides declare the same currency. */
export function platformCurrencyRefusal(
  platform: AdPlatform,
  portfolioCurrency: string | null,
  accountCurrency: string | null,
): string | null {
  const name = PLATFORM_NAMES[platform];
  if (!portfolioCurrency) {
    return `This portfolio's currency isn't confirmed, so ${name} can't be added to it yet.`;
  }
  if (!accountCurrency) {
    return `This ${name} account doesn't report its currency, so it can't join a portfolio in ${portfolioCurrency}.`;
  }
  if (accountCurrency.toUpperCase() !== portfolioCurrency.toUpperCase()) {
    return `This ${name} account bills in ${accountCurrency.toUpperCase()} and the portfolio in ${portfolioCurrency.toUpperCase()}. Mixed currencies aren't supported yet.`;
  }
  return null;
}

export type PickerCampaignNode = {
  id: string;
  name: string;
  typeLabel: string;
  eligible: boolean;
  reason: string | null;
  childKind: PickerChildKind;
  children: { id: string; name: string }[];
};

export type PlatformPickerGroup = {
  platform: AdPlatform;
  accountId: string;
  accountName: string | null;
  currency: string | null;
  /** Why the whole platform cannot join this portfolio, or null when it can. */
  refusal: string | null;
  campaigns: PickerCampaignNode[];
};

export function buildGooglePickerGroup(input: {
  account: { account_id: string; name: string | null; currency: string | null };
  portfolioCurrency: string | null;
  campaigns: readonly GoogleCampaignRow[];
  adGroups: readonly GoogleAdGroupRow[];
}): PlatformPickerGroup {
  const childrenByCampaign = new Map<string, { id: string; name: string }[]>();
  for (const group of input.adGroups) {
    const list = childrenByCampaign.get(group.campaignId) ?? [];
    list.push({ id: group.id, name: group.name });
    childrenByCampaign.set(group.campaignId, list);
  }
  const campaigns = input.campaigns
    .map((campaign): PickerCampaignNode & { spend: number } => {
      const eligibility = googleCampaignEligibility(campaign.channelType);
      const childKind = eligibility.eligible ? eligibility.childKind : 'ad_group';
      return {
        id: campaign.id,
        name: campaign.name || campaign.id,
        typeLabel: eligibility.typeLabel,
        eligible: eligibility.eligible,
        reason: eligibility.eligible ? null : eligibility.reason,
        childKind,
        children: childKind === 'asset_group' ? [] : (childrenByCampaign.get(campaign.id) ?? []),
        spend: campaign.spend,
      };
    })
    .sort(
      (left, right) =>
        Number(right.eligible) - Number(left.eligible) ||
        right.spend - left.spend ||
        left.name.localeCompare(right.name),
    )
    .map(({ spend: _spend, ...node }) => node);
  return {
    platform: 'google_ads',
    accountId: input.account.account_id,
    accountName: input.account.name,
    currency: input.account.currency,
    refusal: platformCurrencyRefusal('google_ads', input.portfolioCurrency, input.account.currency),
    campaigns,
  };
}
