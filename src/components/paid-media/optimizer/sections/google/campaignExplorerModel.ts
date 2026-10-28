// The Google tab's campaigns priced against the portfolio CPA goal (P6 ideas 1, 3, 7, 8, 10):
// the account read by campaign type, the campaign explorer, the bidding panel, a Google
// portfolio's campaigns and the account's recent changes.
//
// The goal is the portfolio's `cpa_target`, the cost Continuum optimizes up to. It is never
// Google's target CPA, which is a bid setting on the platform that G07 moves to serve the goal.
// A campaign no portfolio holds has no target. A figure a read did not carry is null with the
// reason it reads "—", never a zero.

import {
  type AccountCandidate,
  G07_COOLDOWN_DAYS,
  G07_STEP,
  type GoogleCampaignFields,
  type GoogleCampaignRow,
  type GoogleChange,
  type GoogleChangeHistory,
  type GoogleResultCounts,
  type GoogleTopCampaigns,
  type PlatformCard,
  type PortfolioListItem,
} from '@continuum/contracts';
import { formatCurrency } from '../../format';
import { minorToMajor } from '../actionRows';
import { codeLabel, percentLabel, platformCardOf } from '../platformCards/platformCardModel';
import {
  addResults,
  CAMPAIGN_TYPE_LABELS,
  campaignTypeOf,
  NO_SINGLE_RESULT,
} from '../platforms/googleAdsOverviewModel';
import { campaignField } from './googleReads';

/** A figure, or the reason it reads "—". */
export type Figure<T = number> = { value: T; reason: null } | { value: null; reason: string };

const known = <T>(value: T): Figure<T> => ({ value, reason: null });
const missing = <T>(reason: string): Figure<T> => ({ value: null, reason });

/** The portfolio a Google campaign belongs to, and the goal it is priced against. */
export type CampaignGoal = {
  portfolioId: string;
  portfolioName: string;
  /** The portfolio's CPA goal in `currency`; null when it has none. */
  goal: number | null;
  currency: string | null;
};

export type GoalPortfolio = Pick<PortfolioListItem, 'id' | 'name' | 'cpa_target' | 'currency'>;
export type GoalMember = { platform: string; entityId: string };

/** Campaign id → the portfolio holding it, over every Google member of the brand's portfolios. */
export function campaignGoals(
  portfolios: readonly GoalPortfolio[],
  membersByPortfolio: ReadonlyMap<string, readonly GoalMember[]>,
): Map<string, CampaignGoal> {
  const goals = new Map<string, CampaignGoal>();
  for (const portfolio of portfolios) {
    for (const member of membersByPortfolio.get(portfolio.id) ?? []) {
      if (member.platform !== 'google_ads') continue;
      goals.set(member.entityId, {
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        goal:
          portfolio.cpa_target != null && portfolio.cpa_target > 0 ? portfolio.cpa_target : null,
        currency: portfolio.currency?.trim().toUpperCase() || null,
      });
    }
  }
  return goals;
}

/** Within ±5% of the goal reads as on goal, as the portfolio's "By platform" reads it. */
const ON_GOAL_BAND = 0.05;

/** What a campaign with no portfolio reads where its band would be. */
export const NO_TARGET = 'no target';

export type GoalBand = {
  kind: 'on_goal' | 'under' | 'over' | 'no_results' | 'no_target' | 'unpriced' | 'mixed';
  label: string;
  /** The goal the cost was held against, in the account currency. */
  goal: number | null;
  /** Why there is no band, when there is none. */
  reason: string | null;
};

export function goalBand(
  cost: number | null,
  conversions: number | null,
  goal: CampaignGoal | null | undefined,
  currency: string | null,
): GoalBand {
  if (conversions == null) {
    return { kind: 'unpriced', label: '—', goal: null, reason: NO_SINGLE_RESULT };
  }
  if (!goal) {
    return { kind: 'no_target', label: NO_TARGET, goal: null, reason: 'No portfolio holds it' };
  }
  if (goal.goal == null) {
    return {
      kind: 'no_target',
      label: NO_TARGET,
      goal: null,
      reason: `${goal.portfolioName} has no CPA goal`,
    };
  }
  if (goal.currency && currency && goal.currency !== currency) {
    return {
      kind: 'no_target',
      label: NO_TARGET,
      goal: null,
      reason: `${goal.portfolioName}'s goal is in ${goal.currency}; the account bills in ${currency}`,
    };
  }
  if (cost == null || conversions <= 0) {
    return { kind: 'no_results', label: 'no conversions yet', goal: goal.goal, reason: null };
  }
  const gap = cost / goal.goal - 1;
  if (Math.abs(gap) <= ON_GOAL_BAND) {
    return { kind: 'on_goal', label: 'on goal', goal: goal.goal, reason: null };
  }
  const pct = `${Math.round(Math.abs(gap) * 100)}%`;
  return gap < 0
    ? { kind: 'under', label: `${pct} under goal`, goal: goal.goal, reason: null }
    : { kind: 'over', label: `${pct} over goal`, goal: goal.goal, reason: null };
}

/** One campaign of the read, as the explorer and the bidding panel list it. */
export type CampaignView = {
  id: string;
  name: string;
  channelType: string | null;
  /** "Search", "Performance Max"… null when the read carried no channel type. */
  typeLabel: string | null;
  status: Figure<string>;
  spend: number;
  /** Null when the account has no single result to count. */
  conversions: number | null;
  /** Spend per conversion; null without a conversion or without a single result. */
  cost: number | null;
  /** Each business result counted apart; null on a read from before the edge sent them. */
  byResult: GoogleResultCounts | null;
  goal: CampaignGoal | null;
  band: GoalBand;
  budgetPerDay: Figure;
  impressionShare: Figure;
  budgetLost: Figure;
  rankLost: Figure;
  row: GoogleCampaignRow;
};

function figureOf<K extends keyof GoogleCampaignFields>(
  row: GoogleCampaignRow,
  key: K,
): Figure<NonNullable<GoogleCampaignFields[K]>> {
  const field = campaignField(row, key);
  return field.reason === null ? known(field.value) : missing(field.reason);
}

export function costOf(spend: number, conversions: number | null): number | null {
  return conversions != null && conversions > 0 ? spend / conversions : null;
}

/** Every campaign of the read by spend, each priced against the goal of the portfolio holding it. */
export function campaignViews(
  read: GoogleTopCampaigns,
  goals: ReadonlyMap<string, CampaignGoal>,
  currency: string | null,
  /** Why a campaign with no goal may still sit in a portfolio (a members read failed). */
  unknownGoal: string | null = null,
): CampaignView[] {
  const ambiguous = read.result_basis?.unambiguous === false;
  return read.rows
    .map((row): CampaignView => {
      const channelType = row.labels?.channel_type ?? null;
      const type = campaignTypeOf(channelType ?? undefined);
      const conversions = ambiguous ? null : row.metrics.conversions;
      const cost = costOf(row.metrics.spend, conversions);
      const goal = goals.get(row.id) ?? null;
      return {
        id: row.id,
        name: row.name,
        channelType,
        typeLabel: type ? CAMPAIGN_TYPE_LABELS[type] : null,
        status: figureOf(row, 'status'),
        spend: row.metrics.spend,
        conversions,
        cost,
        byResult: row.metrics.byResult ?? null,
        goal,
        band:
          !goal && unknownGoal && conversions != null
            ? { kind: 'unpriced', label: '—', goal: null, reason: unknownGoal }
            : goalBand(cost, conversions, goal, currency),
        budgetPerDay: figureOf(row, 'budget_per_day'),
        impressionShare: figureOf(row, 'search_impression_share'),
        budgetLost: figureOf(row, 'search_budget_lost_impression_share'),
        rankLost: figureOf(row, 'search_rank_lost_impression_share'),
        row,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export type Totals = {
  spend: number;
  conversions: number | null;
  cost: number | null;
  byResult: GoogleResultCounts | null;
};

export function totalsOf(
  rows: readonly Pick<CampaignView, 'spend' | 'conversions' | 'byResult'>[],
): Totals {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const conversions = rows.some((row) => row.conversions == null)
    ? null
    : rows.reduce((sum, row) => sum + (row.conversions ?? 0), 0);
  const byResult = rows.reduce<GoogleResultCounts | null>(
    (sum, row) => addResults(sum, row.byResult),
    {},
  );
  return { spend, conversions, cost: costOf(spend, conversions), byResult };
}

/** The one goal every campaign that has one shares, or null when they disagree or none has one. */
export function sharedGoal(rows: readonly Pick<CampaignView, 'goal'>[]): CampaignGoal | null {
  const held = rows.flatMap((row) => (row.goal ? [row.goal] : []));
  const first = held[0];
  if (!first) return null;
  return held.every((goal) => goal.goal === first.goal && goal.currency === first.currency)
    ? first
    : null;
}

/** One campaign type of the account read: its cost per conversion against its goal. */
export type TypeRow = Totals & {
  key: string;
  label: string;
  campaigns: number;
  /** Share of the read's spend, 0–100. */
  sharePct: number;
  band: GoalBand;
};

function typeBand(
  rows: readonly CampaignView[],
  totals: Totals,
  currency: string | null,
): GoalBand {
  if (totals.conversions == null || rows.every((row) => !row.goal)) {
    return goalBand(totals.cost, totals.conversions, null, currency);
  }
  const goal = sharedGoal(rows);
  if (goal && rows.every((row) => row.goal)) {
    return goalBand(totals.cost, totals.conversions, goal, currency);
  }
  return {
    kind: 'mixed',
    label: '—',
    goal: null,
    reason:
      'Its campaigns sit under different goals, or only some in a portfolio: see each campaign',
  };
}

/**
 * The account read by campaign type (idea 1). A type is held against a goal only when every
 * campaign of it that spent sits in portfolios sharing that one goal; none in a portfolio reads
 * "no target"; a type split across goals reads "—" and sends a person to its campaigns.
 */
export function typeRows(campaigns: readonly CampaignView[], currency: string | null): TypeRow[] {
  const spending = campaigns.filter((row) => row.spend > 0);
  const total = spending.reduce((sum, row) => sum + row.spend, 0);
  const groups = new Map<string, CampaignView[]>();
  for (const row of spending) {
    const key = row.typeLabel ? `type:${row.typeLabel}` : `campaign:${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, rows]): TypeRow => {
      const totals = totalsOf(rows);
      return {
        key,
        label: rows[0]?.typeLabel ?? rows[0]?.name ?? key,
        campaigns: rows.length,
        sharePct: total > 0 ? Math.round((totals.spend / total) * 100) : 0,
        band: typeBand(rows, totals, currency),
        ...totals,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

// ── Bidding (idea 7) ─────────────────────────────────────────────────────────────────────────

const CPA_STRATEGIES = new Set(['TARGET_CPA', 'MAXIMIZE_CONVERSIONS']);
const ROAS_STRATEGIES = new Set(['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE']);

const STRATEGY_WORDS: Readonly<Record<string, string>> = {
  TARGET_CPA: 'Target CPA',
  MAXIMIZE_CONVERSIONS: 'Maximize conversions',
  TARGET_ROAS: 'Target ROAS',
  MAXIMIZE_CONVERSION_VALUE: 'Maximize conversion value',
  MANUAL_CPC: 'Manual CPC',
  TARGET_SPEND: 'Maximize clicks',
  TARGET_IMPRESSION_SHARE: 'Target impression share',
};

/** Google's bidding_strategy_system_status in a person's words. */
const SYSTEM_STATUS_WORDS: Readonly<Record<string, string>> = {
  ENABLED: 'Learned',
  LEARNING_NEW: 'Learning: new strategy',
  LEARNING_SETTING_CHANGE: 'Learning: a setting changed',
  LEARNING_BUDGET_CHANGE: 'Learning: the budget changed',
  LEARNING_COMPOSITION_CHANGE: 'Learning: campaigns added or removed',
  LEARNING_CONVERSION_TYPE_CHANGE: 'Learning: conversion goals changed',
  LEARNING_CONVERSION_SETTING_CHANGE: 'Learning: conversion settings changed',
  LIMITED_BY_DATA: 'Limited: too little conversion data',
  LIMITED_BY_BUDGET: 'Limited by budget',
  LIMITED_BY_CPC_BID_CEILING: 'Limited by the bid ceiling',
  LIMITED_BY_CPC_BID_FLOOR: 'Limited by the bid floor',
  LIMITED_BY_INVENTORY: 'Limited: too few auctions',
  PAUSED: 'Paused',
};

export function strategyWords(code: string): string {
  return STRATEGY_WORDS[code] ?? codeLabel(code);
}

export function systemStatusWords(code: string): string {
  return SYSTEM_STATUS_WORDS[code] ?? codeLabel(code);
}

/** A change to a campaign's bid target in Google's change history. */
export type BidChange = { at: string; before: number | null; after: number | null };

/** When the target may move again: G07 holds one change per 14 days while Smart Bidding relearns. */
export type Cooldown =
  /** `until`: the ISO day the target may move again. */
  | { state: 'wait'; until: string; daysLeft: number }
  | { state: 'clear' }
  | { state: 'unknown'; reason: string };

/** G07's pending proposal for the campaign, as its card carries it. The card is the only write. */
export type BidProposal = {
  current: number;
  proposed: number;
  strategy: 'target_cpa' | 'target_roas';
};

export type BiddingView = {
  id: string;
  name: string;
  strategy: Figure<string>;
  learning: Figure<string>;
  /** True while Google's own status is LEARNING_*. */
  isLearning: boolean;
  targetKind: 'cpa' | 'roas' | null;
  /** Google's target (a bid setting on the platform): money for a CPA, a ratio for a ROAS. */
  target: Figure;
  /** What the campaign paid per conversion (CPA) or returned per peso (ROAS) over the window. */
  actual: Figure;
  goal: CampaignGoal | null;
  band: GoalBand;
  lastChange: Figure<BidChange>;
  cooldown: Cooldown;
  /** ±G07_STEP around the current target: the furthest one change may take it. */
  step: { low: number; high: number } | null;
  proposal: BidProposal | null;
};

/** What the change-history read said, as the panel holds it. */
export type HistoryRead =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; history: GoogleChangeHistory };

const DAY_MS = 86_400_000;

function bidChangeOf(change: GoogleChange, kind: 'cpa' | 'roas'): BidChange | null {
  const read = (side: GoogleChange['before']): number | null => {
    if (!side) return null;
    if (kind === 'roas') return side.targetRoas ?? null;
    return side.targetCpa ? minorToMajor(side.targetCpa.minor, side.targetCpa.currency) : null;
  };
  const before = read(change.before);
  const after = read(change.after);
  return before == null && after == null ? null : { at: change.at, before, after };
}

export function lastBidChange(
  campaignId: string,
  kind: 'cpa' | 'roas',
  history: HistoryRead,
): Figure<BidChange> {
  if (history.status === 'loading') return missing("Reading Google's change history…");
  if (history.status === 'error') return missing("Google's change history could not be read");
  for (const change of history.history.changes) {
    if (change.campaignId !== campaignId) continue;
    const bid = bidChangeOf(change, kind);
    if (bid) return known(bid);
  }
  const read = history.history.coverage.read;
  return missing(
    read
      ? `No target change in Google's change history since ${dayLabel(read.since)}`
      : "Google's change history holds none of this window",
  );
}

export function cooldownOf(
  lastChange: Figure<BidChange>,
  history: HistoryRead,
  now: Date,
): Cooldown {
  if (lastChange.value) {
    const until = Date.parse(lastChange.value.at) + G07_COOLDOWN_DAYS * DAY_MS;
    if (until <= now.getTime()) return { state: 'clear' };
    // The day it frees, on the account's own calendar (the change carries its offset).
    const changedDay = Date.parse(`${lastChange.value.at.slice(0, 10)}T00:00:00Z`);
    return {
      state: 'wait',
      until: new Date(changedDay + G07_COOLDOWN_DAYS * DAY_MS).toISOString().slice(0, 10),
      daysLeft: Math.ceil((until - now.getTime()) / DAY_MS),
    };
  }
  // No change in a history that reaches back past the cooldown: the target is free to move.
  if (history.status === 'ready' && history.history.coverage.read) {
    const since = Date.parse(`${history.history.coverage.read.since}T00:00:00Z`);
    if (now.getTime() - since >= G07_COOLDOWN_DAYS * DAY_MS) return { state: 'clear' };
  }
  return { state: 'unknown', reason: lastChange.reason ?? 'unknown' };
}

type BidCard = Extract<PlatformCard, { variant: 'google_bid_target' }>;

/** G07's card for this campaign: by the id its action writes, else by the campaign's name. */
export function bidCardFor(
  campaign: Pick<CampaignView, 'id' | 'name'>,
  candidates: readonly AccountCandidate[],
): { candidate: AccountCandidate; card: BidCard } | null {
  for (const candidate of candidates) {
    const card = platformCardOf(candidate);
    if (card?.variant !== 'google_bid_target') continue;
    const action = candidate.card_action?.action;
    const writes = action?.kind === 'set_bid_target' ? action.ref.id : null;
    if (writes === campaign.id || (writes == null && card.campaign_name === campaign.name)) {
      return { candidate, card };
    }
  }
  return null;
}

/** The campaign's bid strategy and Google's target for it, from the read's E1 block. */
function bidTargetOf(row: GoogleCampaignRow): {
  strategy: Figure<string>;
  targetKind: 'cpa' | 'roas' | null;
  target: Figure;
} {
  const strategy = figureOf(row, 'bidding_strategy_type');
  const code = strategy.value;
  if (code && CPA_STRATEGIES.has(code)) {
    return { strategy, targetKind: 'cpa', target: figureOf(row, 'target_cpa') };
  }
  if (code && ROAS_STRATEGIES.has(code)) {
    return { strategy, targetKind: 'roas', target: figureOf(row, 'target_roas') };
  }
  return {
    strategy,
    targetKind: null,
    target: missing(
      code
        ? `${strategyWords(code)} bids without a target to move`
        : (strategy.reason ?? 'Google did not report it'),
    ),
  };
}

export function biddingViews(
  campaigns: readonly CampaignView[],
  history: HistoryRead,
  cards: readonly AccountCandidate[],
  now: Date,
): BiddingView[] {
  return campaigns
    .filter((campaign) => campaign.spend > 0 || campaign.status.value === 'ENABLED')
    .map((campaign): BiddingView => {
      const { row } = campaign;
      const { strategy, targetKind, target } = bidTargetOf(row);
      const status = figureOf(row, 'bidding_strategy_system_status');
      const value = row.metrics.conversionValue;
      const actual: Figure =
        targetKind === 'roas'
          ? value != null && campaign.spend > 0
            ? known(value / campaign.spend)
            : missing('Google reported no conversion value for the window')
          : campaign.cost != null
            ? known(campaign.cost)
            : missing(
                campaign.conversions == null
                  ? NO_SINGLE_RESULT
                  : 'No conversion in the window to price',
              );
      const lastChange = targetKind
        ? lastBidChange(campaign.id, targetKind, history)
        : missing<BidChange>('No bid target to change');
      const found = bidCardFor(campaign, cards);
      return {
        id: campaign.id,
        name: campaign.name,
        strategy: strategy.value ? known(strategyWords(strategy.value)) : strategy,
        learning: status.value ? known(systemStatusWords(status.value)) : status,
        isLearning: (status.value ?? '').startsWith('LEARNING'),
        targetKind,
        target,
        actual,
        goal: campaign.goal,
        band: campaign.band,
        lastChange,
        cooldown: targetKind
          ? cooldownOf(lastChange, history, now)
          : { state: 'unknown', reason: 'No bid target to change' },
        step:
          target.value != null
            ? { low: target.value * (1 - G07_STEP), high: target.value * (1 + G07_STEP) }
            : null,
        proposal: found
          ? {
              current: found.card.current_target,
              proposed: found.card.proposed_target,
              strategy: found.card.strategy,
            }
          : null,
      };
    });
}

/** A target as it reads: money for a CPA, a percentage for a ROAS (3.5 = 350%). */
export function targetLabel(
  value: number | null,
  kind: 'cpa' | 'roas' | null,
  currency: string | null,
): string {
  if (value == null) return '—';
  return kind === 'roas' ? percentLabel(value) : formatCurrency(value, currency);
}

// ── A Google portfolio's campaigns (idea 8) ──────────────────────────────────────────────────

export type PortfolioMemberLike = {
  platform: string;
  entityId: string;
  name: string | null;
  channelType: string | null;
};

/** Said for a member the campaign read does not list: it reads the 50 campaigns that spent most. */
export const NOT_AMONG_TOP =
  'Not among the campaigns that spent in the window: it spent little or nothing';

type BudgetCard = Extract<PlatformCard, { variant: 'google_budget_limited' }>;

export type PortfolioCampaignView = {
  id: string;
  name: string;
  typeLabel: string | null;
  status: Figure<string>;
  budgetBefore: Figure;
  /** G03's proposed budget per day, when a card proposes one. */
  budgetAfter: number | null;
  spend: Figure;
  conversions: number | null;
  cost: number | null;
  band: GoalBand;
  target: Figure;
  targetKind: 'cpa' | 'roas' | null;
  /** G07's proposed target, when a card proposes one. */
  targetAfter: number | null;
};

function budgetCardFor(
  campaign: { id: string; name: string },
  candidates: readonly AccountCandidate[],
): BudgetCard | null {
  for (const candidate of candidates) {
    const card = platformCardOf(candidate);
    if (card?.variant !== 'google_budget_limited') continue;
    const action = candidate.card_action?.action;
    const writes = action?.kind === 'set_budget' ? action.ref.id : null;
    if (writes === campaign.id || (writes == null && card.campaign_name === campaign.name)) {
      return card;
    }
  }
  return null;
}

/** The read's figure for each Google member of the portfolio, with G03's and G07's proposals. */
export function portfolioCampaignViews(args: {
  members: readonly PortfolioMemberLike[];
  read: GoogleTopCampaigns;
  goal: CampaignGoal;
  cards: readonly AccountCandidate[];
  currency: string | null;
}): PortfolioCampaignView[] {
  const { goal, cards, currency } = args;
  const goals = new Map<string, CampaignGoal>();
  for (const member of args.members) goals.set(member.entityId, goal);
  const views = new Map(campaignViews(args.read, goals, currency).map((view) => [view.id, view]));
  return args.members
    .filter((member) => member.platform === 'google_ads')
    .map((member): PortfolioCampaignView => {
      const view = views.get(member.entityId);
      const name = view?.name ?? member.name ?? member.entityId;
      const type = campaignTypeOf(member.channelType ?? view?.channelType ?? undefined);
      const budgetCard = budgetCardFor({ id: member.entityId, name }, cards);
      const bid = view ? bidTargetOf(view.row) : null;
      const bidCard = bidCardFor({ id: member.entityId, name }, cards);
      const budgetBefore: Figure =
        view?.budgetPerDay.value != null
          ? view.budgetPerDay
          : budgetCard
            ? known(budgetCard.budget_per_day)
            : (view?.budgetPerDay ?? missing(NOT_AMONG_TOP));
      return {
        id: member.entityId,
        name,
        typeLabel: type ? CAMPAIGN_TYPE_LABELS[type] : null,
        status: view?.status ?? missing(NOT_AMONG_TOP),
        budgetBefore,
        budgetAfter: budgetCard?.proposed_budget_per_day ?? null,
        spend: view ? known(view.spend) : missing(NOT_AMONG_TOP),
        conversions: view?.conversions ?? null,
        cost: view?.cost ?? null,
        band: view?.band ?? goalBand(null, 0, goal, currency),
        target: bid?.target ?? missing(NOT_AMONG_TOP),
        targetKind: bid?.targetKind ?? null,
        targetAfter: bidCard?.card.proposed_target ?? null,
      };
    })
    .sort((a, b) => (b.spend.value ?? -1) - (a.spend.value ?? -1));
}

// ── Recent changes (idea 10) ─────────────────────────────────────────────────────────────────

const RESOURCE_WORDS: Readonly<Record<string, string>> = {
  CAMPAIGN: 'Campaign',
  CAMPAIGN_BUDGET: 'Budget',
  AD_GROUP: 'Ad group',
  AD_GROUP_AD: 'Ad',
  AD_GROUP_CRITERION: 'Keyword or audience',
  CAMPAIGN_CRITERION: 'Campaign targeting',
  ASSET: 'Asset',
  ASSET_GROUP: 'Asset group',
  ASSET_GROUP_ASSET: 'Asset in an asset group',
  CAMPAIGN_ASSET: 'Campaign asset',
  AD_GROUP_ASSET: 'Ad group asset',
};

const OPERATION_WORDS: Readonly<Record<GoogleChange['operation'], string>> = {
  CREATE: 'added',
  UPDATE: 'changed',
  REMOVE: 'removed',
  UNKNOWN: 'changed',
};

/** Who made a change, by Google's channel; Google never names the person through the API. */
const CLIENT_WORDS: Readonly<Record<string, string>> = {
  GOOGLE_ADS_WEB_CLIENT: 'in Google Ads',
  GOOGLE_ADS_API: 'through the API',
  GOOGLE_ADS_AUTOMATED_RULE: 'by an automated rule',
  GOOGLE_ADS_RECOMMENDATIONS: "by Google's recommendations",
  GOOGLE_ADS_SCRIPTS: 'by a script',
  GOOGLE_ADS_EDITOR: 'in Google Ads Editor',
  GOOGLE_ADS_MOBILE_APP: 'in the Google Ads app',
  GOOGLE_ADS_BULK_UPLOAD: 'by a bulk upload',
  SEARCH_ADS_360_SYNC: 'by Search Ads 360',
};

function moneyOf(side: GoogleChange['before'], key: 'budget' | 'targetCpa'): number | null {
  const money = side?.[key];
  return money ? minorToMajor(money.minor, money.currency) : null;
}

/** "$500 MXN → $650 MXN", for the values a change set that a person decides on. */
function changeDetail(change: GoogleChange): string | null {
  const { before, after } = change;
  const money = (key: 'budget' | 'targetCpa', name: string) => {
    const from = moneyOf(before, key);
    const to = moneyOf(after, key);
    if (from == null && to == null) return null;
    const code = after?.[key]?.currency ?? before?.[key]?.currency ?? null;
    return `${name} ${formatCurrency(from, code)} → ${formatCurrency(to, code)}`;
  };
  if (after?.targetRoas != null || before?.targetRoas != null) {
    const pct = (value: number | undefined) => (value == null ? '—' : percentLabel(value));
    return `target ROAS ${pct(before?.targetRoas)} → ${pct(after?.targetRoas)}`;
  }
  const parts = [
    money('budget', 'budget'),
    money('targetCpa', 'target CPA'),
    before?.status || after?.status
      ? `status ${codeLabel(before?.status ?? '—').toLowerCase()} → ${codeLabel(after?.status ?? '—').toLowerCase()}`
      : null,
    after?.keyword ? `"${after.keyword.text}" (${after.keyword.matchType.toLowerCase()})` : null,
  ].filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export type ChangeLine = {
  at: string;
  /** "Budget changed", "Ad added". */
  what: string;
  /** The campaign (and ad group) it touched, when Google names it. */
  where: string | null;
  detail: string | null;
  who: string;
};

export function changeLine(change: GoogleChange): ChangeLine {
  const resource = RESOURCE_WORDS[change.resourceType] ?? codeLabel(change.resourceType);
  const where = [change.campaignName, change.adGroupName].filter(Boolean).join(' › ');
  return {
    at: change.at,
    what: `${resource} ${OPERATION_WORDS[change.operation]}`,
    where: where || null,
    detail: changeDetail(change),
    who: CLIENT_WORDS[change.clientType] ?? codeLabel(change.clientType).toLowerCase(),
  };
}

/** Google's change history reaches back 30 days, today included, in the account's own day. The
 *  edge clamps a wider ask to what change_event can read and says what it cut (`coverage`). */
export function changeHistoryWindow(now: Date = new Date()): { since: string; until: string } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { since: iso(today - 30 * DAY_MS), until: iso(today + DAY_MS) };
}

/** "Oct 25" from an ISO day, or from an instant on its own offset's day: Google dates a change in
 *  the account's time zone, and that is the day a person there made it. */
export function dayLabel(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The question the campaign detail sends to Jaina, scoped to the campaign and its window. */
export function jainaCampaignPrompt(name: string, since: string, until: string): string {
  return `For the Google Ads campaign "${name}", ${since} to ${until}: how is it doing against its portfolio's CPA goal, what is holding it back (budget, rank, bidding, search terms) and what should change? One table of its figures against the goal, then the actions.`;
}
