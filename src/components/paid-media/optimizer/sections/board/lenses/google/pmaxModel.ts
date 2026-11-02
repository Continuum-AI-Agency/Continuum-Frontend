// G09 Performance Max on the adaptive board, from google_signals' campaign, bid-target and
// asset-group blocks: the reads the Optimizer's V4 detector (pmax_rescue_or_pause) prices with,
// so the lens and the card that cites it say the same figure. Per Performance Max campaign: its
// cost per conversion (what Google reports) against its goal — the campaign's own target CPA,
// else the portfolio's goal, the detector's order — the share of its impressions lost to rank,
// and its asset groups by Ad Strength. On an account with no Performance Max spend the lens is
// the Optimizer's winning-ad card (G10): the best ad of a group against the dearer one.

import type { GoogleSignalsRead, PlatformCard } from '@continuum/contracts';

type GoogleBlocks = NonNullable<NonNullable<GoogleSignalsRead['signals']>['google']>;
type CampaignSignal = NonNullable<GoogleBlocks['campaigns']>[number];
type AssetGroupSignal = NonNullable<GoogleBlocks['asset_groups']>[number];
type BidTargetSignal = NonNullable<GoogleBlocks['bid_targets']>[number];
export type AccountFindingCard = Extract<PlatformCard, { variant: 'google_account_finding' }>;
export type AdWinnerCard = Extract<PlatformCard, { variant: 'google_ad_winner' }>;

/** Google's ratings, worst first. PENDING and UNSPECIFIED are not ratings. */
export const AD_STRENGTHS = ['POOR', 'AVERAGE', 'GOOD', 'EXCELLENT'] as const;
export type AdStrength = (typeof AD_STRENGTHS)[number];

export const AD_STRENGTH_LABEL: Record<AdStrength, string> = {
  POOR: 'Poor',
  AVERAGE: 'Average',
  GOOD: 'Good',
  EXCELLENT: 'Excellent',
};

export type PmaxGoal = { value: number; source: 'target_cpa' | 'portfolio' };

export type PmaxAssetGroup = {
  id: string;
  name: string;
  strength: AdStrength | null;
  /** Google's own action items, as it words them. */
  missing: string[];
};

export type PmaxCampaign = {
  id: string;
  name: string;
  status: CampaignSignal['status'];
  spend: number;
  conversions: number;
  /** Null when it bought no conversion in the window. */
  costPerConversion: number | null;
  goal: PmaxGoal | null;
  /** Cost per conversion over the goal; null without either. */
  multiple: number | null;
  /** 0–1; null when Google reports none. */
  lostToRank: number | null;
  budgetPerDay: number | null;
  /** Its asset groups per rating, and how many Google has not rated. */
  strengths: Record<AdStrength, number>;
  unrated: number;
  /** Weakest first. */
  groups: PmaxAssetGroup[];
  /** The Optimizer's V4 card on this campaign, when it fired. */
  finding: AccountFindingCard | null;
};

type Window = { since: string; until: string };

export type PmaxModel =
  | { kind: 'unread'; reason: string }
  | { kind: 'empty'; window: Window }
  | {
      kind: 'pmax';
      window: Window;
      /** By spend, most first. */
      campaigns: PmaxCampaign[];
      /** Performance Max's share of the account's spend, 0–1. */
      share: number;
      /** Null when the asset groups were read; else why not. */
      assetGroupsUnread: string | null;
    }
  | { kind: 'search_only'; window: Window; winner: AdWinnerCard | null };

function strengthOf(value: AssetGroupSignal['ad_strength']): AdStrength | null {
  return AD_STRENGTHS.find((strength) => strength === value) ?? null;
}

const strengthRank = (strength: AdStrength | null): number =>
  strength === null ? AD_STRENGTHS.length : AD_STRENGTHS.indexOf(strength);

function goalOf(bid: BidTargetSignal | undefined, portfolioGoal: number | null): PmaxGoal | null {
  if (bid?.target_cpa != null && bid.target_cpa > 0) {
    return { value: bid.target_cpa, source: 'target_cpa' };
  }
  return portfolioGoal != null && portfolioGoal > 0
    ? { value: portfolioGoal, source: 'portfolio' }
    : null;
}

function campaignOf(
  campaign: CampaignSignal,
  google: GoogleBlocks,
  findings: readonly AccountFindingCard[],
  portfolioGoal: number | null,
): PmaxCampaign {
  const { spend, conversions } = campaign.totals;
  const costPerConversion = conversions > 0 ? spend / conversions : null;
  const goal = goalOf(
    google.bid_targets?.find((bid) => bid.campaign_id === campaign.campaign_id),
    portfolioGoal,
  );
  const groups = (google.asset_groups ?? [])
    .filter((group) => group.campaign_id === campaign.campaign_id)
    .map(
      (group): PmaxAssetGroup => ({
        id: group.asset_group_id,
        name: group.name,
        strength: strengthOf(group.ad_strength),
        missing: group.missing,
      }),
    )
    .sort((a, b) => strengthRank(a.strength) - strengthRank(b.strength));
  const strengths: Record<AdStrength, number> = { POOR: 0, AVERAGE: 0, GOOD: 0, EXCELLENT: 0 };
  for (const group of groups) if (group.strength) strengths[group.strength] += 1;
  return {
    id: campaign.campaign_id,
    name: campaign.name,
    status: campaign.status,
    spend,
    conversions,
    costPerConversion,
    goal,
    multiple: costPerConversion !== null && goal ? costPerConversion / goal.value : null,
    lostToRank: campaign.rank_lost_impression_share,
    budgetPerDay: campaign.budget_per_day,
    strengths,
    unrated: groups.filter((group) => group.strength === null).length,
    groups,
    finding: findings.find((card) => card.campaign_name === campaign.name) ?? null,
  };
}

/** The edge's three statements behind the campaigns block: one that fails leaves the block out
 *  and is counted as `read_failed_<name>`. */
const CAMPAIGN_READS = ['campaign_catalog', 'campaign_window', 'campaign_60d'] as const;

/** The winning-ad card the lens shows: the one whose winner counts the most conversions. */
function winnerOf(cards: readonly PlatformCard[] | null): AdWinnerCard | null {
  const winners = (cards ?? []).flatMap((card) =>
    card.variant === 'google_ad_winner' ? [card] : [],
  );
  return winners.sort((a, b) => b.winner.conversions - a.winner.conversions)[0] ?? null;
}

/**
 * `portfolioGoal` is the reading's goal (one portfolio goal for the platform, else null);
 * `cards` is null when the Optimizer's cards could not be read.
 */
export function buildPmaxModel(
  read: GoogleSignalsRead,
  cards: readonly PlatformCard[] | null,
  portfolioGoal: number | null,
): PmaxModel {
  if (!read.signals) {
    return {
      kind: 'unread',
      reason: `The Google read came back incomplete${read.rejected.length ? `: ${read.rejected.join('; ')}` : ''}`,
    };
  }
  const window = read.signals.window;
  const google = read.signals.google ?? {};
  const campaigns = google.campaigns;
  if (!campaigns) {
    return {
      kind: 'unread',
      reason: CAMPAIGN_READS.some((name) => read.skipped[`read_failed_${name}`])
        ? "Google's campaign read failed"
        : 'Campaigns were not read for this account',
    };
  }
  const accountSpend = campaigns.reduce((sum, campaign) => sum + campaign.totals.spend, 0);
  if (accountSpend <= 0) return { kind: 'empty', window };
  const findings = (cards ?? []).flatMap((card) =>
    card.variant === 'google_account_finding' && card.idea === 'pmax_rescue_or_pause' ? [card] : [],
  );
  const pmax = campaigns
    .filter((campaign) => campaign.channel_type === 'PERFORMANCE_MAX' && campaign.totals.spend > 0)
    .sort((a, b) => b.totals.spend - a.totals.spend)
    .map((campaign) => campaignOf(campaign, google, findings, portfolioGoal));
  if (pmax.length === 0) {
    return { kind: 'search_only', window, winner: winnerOf(cards) };
  }
  const pmaxSpend = pmax.reduce((sum, campaign) => sum + campaign.spend, 0);
  return {
    kind: 'pmax',
    window,
    campaigns: pmax,
    share: pmaxSpend / accountSpend,
    assetGroupsUnread: google.asset_groups
      ? null
      : read.skipped.read_failed_asset_groups
        ? "Google's asset-group read failed"
        : 'Asset groups were not read for this account',
  };
}

/** The Performance Max campaign that spent most, and the read's window: the campaign whose
 *  channels the lens reads next, over the same days. Null when the read names none. */
export function leadPmaxCampaign(read: GoogleSignalsRead): { id: string; window: Window } | null {
  const lead = (read.signals?.google?.campaigns ?? [])
    .filter((campaign) => campaign.channel_type === 'PERFORMANCE_MAX' && campaign.totals.spend > 0)
    .sort((a, b) => b.totals.spend - a.totals.spend)[0];
  return lead && read.signals ? { id: lead.campaign_id, window: read.signals.window } : null;
}

/** Where a cost sits against its goal, for the takeaway and the bullet's mark. */
export function positionOf(multiple: number): 'over' | 'at' | 'under' {
  if (multiple > 1.05) return 'over';
  return multiple < 0.95 ? 'under' : 'at';
}

/** "8.2×" under ten, "12×" from ten. */
export function multipleText(multiple: number): string {
  return `${multiple < 10 ? multiple.toFixed(1) : Math.round(multiple).toString()}×`;
}
