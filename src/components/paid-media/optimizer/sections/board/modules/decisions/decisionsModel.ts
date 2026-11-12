// O03 Decisions: the cards that wait on one account, as the board's Decisions module draws
// them. Pure. Each card is one of the Optimizer's own candidates (the account read's on Meta,
// optimizer_get_platform_cards' on Google), worded with the same functions the Overview's
// recommendation cards use, so a card says the same thing on the board and on the page.
//
// The order is impact order. The guards come first, because they decide whether the other
// figures mean anything. A card that says the whole account shows no ad comes next, because
// every other card assumes the account serves. Then by tier, and inside a tier by the read's
// own ranking (discounted value, then the catalogue's order).
//
// Fix, Grow and Clean are what a person does about a card: repair what makes the figures
// wrong, put money where it buys more, or stop spend and decay that buy nothing.

import {
  ACCOUNT_DETECTOR_META,
  type AccountCandidate,
  type AccountDetector,
  type APPROVABLE_FAMILIES,
  accountCandidateTitle,
  accountGuards,
  applyApprovals,
  type BoardModuleSize,
  type GoogleAccountIdea,
  type InsightState,
  impactTier,
  insightStateSchema,
  isGuardDetector,
  type PlatformCard,
  rankAccountCandidates,
  titleText,
} from '@continuum/contracts';
import { formatCurrency, formatHeadline } from '../../../../format';
import { doubtedBy } from '../../../account/guardScope';
import {
  cardRecommendationId,
  type PlatformCardAction,
} from '../../../platformCards/platformCardActionModel';
import {
  blocksTheAccount,
  googleReasonInWords,
  negativesClipboardText,
  platformCardOf,
  platformCardTitle,
} from '../../../platformCards/platformCardModel';
import { type PlanSource, portfolioPlanPerDay } from '../../../portfolioPlan';
import { type EvidenceBar, evidenceBarsOf } from './evidenceBarsModel';

export type DecisionGroup = 'fix' | 'grow' | 'clean';
export type DecisionFilter = 'all' | DecisionGroup;
export type DecisionTier = 'high' | 'medium' | 'low';

export const DECISION_FILTERS: readonly DecisionFilter[] = ['all', 'fix', 'grow', 'clean'];

export const DECISION_FILTER_LABEL: Record<DecisionFilter, string> = {
  all: 'All',
  fix: 'Fix',
  grow: 'Grow',
  clean: 'Clean',
};

export const DECISION_TIER_LABEL: Record<DecisionTier, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** How many cards each size shows before "Show more". One is the top card. */
export const STACK_LIMIT: Record<BoardModuleSize, number> = {
  s: 1,
  m: 3,
  l: 5,
  w: 4,
};

export type DecisionStep = {
  label: string;
  /** Set when the platform's change history verified it. */
  status: 'done' | 'partial' | 'pending' | null;
  detail: string | null;
};

export type DecisionCard = {
  id: string;
  candidate: AccountCandidate;
  platformCard: PlatformCard | null;
  group: DecisionGroup;
  tier: DecisionTier;
  /** The Optimizer's title, as the Overview's card prints it. */
  title: string;
  /** The sentence that names the card's figures. */
  figure: string | null;
  /** What acting on it is worth, when the card prices it. */
  impact: string | null;
  bars: EvidenceBar[];
  steps: DecisionStep[];
  /** What a person can paste: negatives one per line, or the steps numbered. */
  copyText: string | null;
  /** What the card cannot measure yet, and why. */
  note: string | null;
  guard: boolean;
  /** Google shows no ad anywhere in the account. */
  blocksAccount: boolean;
  /** A guard that fired casts doubt on the figure this card is priced off. */
  doubted: boolean;
  /** The read says it acts on its own, within the portfolio's limits. */
  autopilot: boolean;
  /** The engine's executable action, when the card carries one. */
  action: PlatformCardAction | undefined;
  /** The optimizer.recommendations row the card stands for; null for a read finding. */
  recommendationId: string | null;
  /** The portfolio a person opens to act on it. */
  portfolioId: string | null;
  currency: string | null;
};

export type DecisionCardsInput = {
  /** Everything the read or the platform carries. Guards are told apart here. */
  candidates: readonly AccountCandidate[];
  currency: string | null;
  /** The account's daily spend: the scale a card's money is tiered against. */
  dailySpend: number | null;
  cardActions: ReadonlyMap<string, PlatformCardAction>;
};

/** The read findings, by what a person does about them. */
const DETECTOR_GROUP: Record<AccountDetector, DecisionGroup> = {
  // The figures cannot be trusted, or the money stopped going out.
  measurement_integrity: 'fix',
  target_economics: 'fix',
  delivery_collapse: 'fix',
  // The same money buys more somewhere else, or more money would buy more.
  portfolio_reallocation: 'grow',
  account_pacing: 'grow',
  scale_readiness: 'grow',
  guardrail_bottleneck: 'grow',
  bid_strategy: 'grow',
  placement_mix: 'grow',
  format_gap: 'grow',
  market_allocation: 'grow',
  funnel_coverage: 'grow',
  platform_diversification: 'grow',
  new_vs_returning: 'grow',
  // Spend that buys nothing, or a decay to stop before it costs.
  dead_tail: 'clean',
  structure_consolidation: 'clean',
  optimization_event: 'clean',
  creative_supply: 'clean',
  angle_concentration: 'clean',
  testing_discipline: 'clean',
  audience_overlap: 'clean',
  account_saturation: 'clean',
  decision_window: 'clean',
  seasonality: 'clean',
  auction_pressure: 'clean',
  post_click: 'clean',
};

/** A platform card says what it is, so its variant decides before its detector does. */
const VARIANT_GROUP: Record<
  Exclude<PlatformCard['variant'], 'google_account_finding'>,
  DecisionGroup
> = {
  google_delivery_issue: 'fix',
  tiktok_delivery_issue: 'fix',
  tiktok_attribution_window: 'fix',
  google_budget_limited: 'grow',
  google_promote_term: 'grow',
  google_bid_target: 'grow',
  google_ad_winner: 'grow',
  cross_platform_move: 'grow',
  meta_cost_cap: 'grow',
  tiktok_scheduled_decrease: 'grow',
  tiktok_spark_candidate: 'grow',
  tiktok_budget_below_learning: 'grow',
  google_negative_terms: 'clean',
  google_low_quality_keyword: 'clean',
  google_ad_drag: 'clean',
  google_pmax_assets: 'clean',
  google_pmax_asset_group: 'clean',
  google_audience_saturation: 'clean',
  google_video_readonly: 'clean',
  meta_creative_fatigue: 'clean',
  tiktok_creative_fatigue: 'clean',
  tiktok_hook_retention: 'clean',
};

/** The P8 account ideas, read by idea: the producer files them under detectors that say
 *  nothing about them (an inflated conversion is `optimization_event`). A counted conversion
 *  that is a visit, a PMax at 8× its target, days without ads or a lead that never becomes a
 *  sale invalidate the rest; the checklist the client owes is a fix too. */
const IDEA_GROUP: Record<GoogleAccountIdea, DecisionGroup> = {
  inflated_primary_conversion: 'fix',
  pmax_rescue_or_pause: 'fix',
  lead_to_sale_funnel: 'fix',
  client_executes_checklist: 'fix',
  continuity_calendar: 'fix',
  brand_vs_nonbrand: 'grow',
  capped_budget_locked: 'grow',
  course_line_split: 'grow',
  device_split: 'grow',
  paused_beat_active: 'grow',
  quality_score_by_service: 'clean',
  conversion_value_map: 'clean',
  competitor_terms: 'clean',
  intent_negatives: 'clean',
  google_recommendations_filtered: 'clean',
};

const TIER_ORDER: Record<DecisionTier, number> = { high: 0, medium: 1, low: 2 };

const PLATFORM_SIGNAL_PREFIX = 'platform_signal:';

export function groupOf(candidate: AccountCandidate, card: PlatformCard | null): DecisionGroup {
  if (isGuardDetector(candidate.detector)) return 'fix';
  if (card?.variant === 'google_account_finding') return IDEA_GROUP[card.idea];
  if (card) return VARIANT_GROUP[card.variant];
  return DETECTOR_GROUP[candidate.detector];
}

/** The card's tier: its money against the account's daily spend. A platform card the producer
 *  put no money on keeps the severity the engine gave it, as the Overview's card does: a zero
 *  nobody priced is not "Low". A guard is always high, because it outranks the list. */
export function tierOf(
  candidate: AccountCandidate,
  card: PlatformCard | null,
  dailySpend: number | null,
): DecisionTier {
  if (isGuardDetector(candidate.detector)) return 'high';
  const priced = card == null || candidate.impact_per_day > 0;
  const severity = candidate.evidence.severity;
  if (!priced && (severity === 'high' || severity === 'medium' || severity === 'low')) {
    return severity;
  }
  return impactTier(candidate.impact_per_day, dailySpend);
}

/** The title the Overview's card prints: the producer's own for a platform card (a P8 finding's
 *  headline as stored), the stamped or composed title for a read finding, its label otherwise. */
export function titleOf(
  candidate: AccountCandidate,
  card: PlatformCard | null,
  currency: string | null,
): string {
  if (card) return platformCardTitle(card);
  const title = candidate.title ?? accountCandidateTitle(candidate, currency);
  return title ? titleText(title) : ACCOUNT_DETECTOR_META[candidate.detector].label;
}

/** The line under the title that names the figures. A P8 finding states its producer-worded
 *  facts. A delivery card says Google's reasons from its own fields: its stored sentence quotes
 *  Google's codes and is cut at 240 characters, often mid-word. Anything else prints the
 *  code-authored sentence it was priced with. */
export function figureOf(candidate: AccountCandidate, card: PlatformCard | null): string | null {
  if (card?.variant === 'google_account_finding') {
    return card.facts.map((fact) => `${fact.label}: ${fact.value}`).join(' · ');
  }
  if (card?.variant === 'google_delivery_issue') {
    const budget =
      card.budget_per_day != null
        ? ` Budget ${formatCurrency(card.budget_per_day, card.currency)}/day.`
        : '';
    return `Google says: ${card.reasons.map((code) => googleReasonInWords(code)).join('; ')}.${budget}`;
  }
  const basis = candidate.impact_basis.trim();
  return basis.length > 0 ? basis : null;
}

/** What acting is worth, when the card prices it: the money per day, or the detector's own
 *  headline. A card nobody priced says nothing rather than "$0.00". */
export function impactOf(
  candidate: AccountCandidate,
  currency: string | null,
  standing: { guard: boolean; blocksAccount: boolean },
): string | null {
  if (standing.blocksAccount) return 'Everything else waits';
  if (standing.guard) return 'Read this first';
  if (candidate.impact_per_day > 0) {
    return `${formatCurrency(candidate.impact_per_day, currency)}/day`;
  }
  if (candidate.headline) {
    const lead = formatHeadline(candidate.headline, currency);
    return `${lead.figure} ${lead.label}`;
  }
  return null;
}

/** The steps a card lists: a P8 finding's checklist, with what change history verified. */
export function stepsOf(card: PlatformCard | null): DecisionStep[] {
  if (card?.variant !== 'google_account_finding') return [];
  return card.checklist.map((item) => ({
    label: item.label,
    status: item.status,
    detail: item.detail,
  }));
}

/** What a person pastes: negatives as Google Ads' bulk editor takes them, else the steps. */
export function copyTextOf(
  card: PlatformCard | null,
  steps: readonly DecisionStep[],
): string | null {
  if (card?.variant === 'google_negative_terms') {
    return negativesClipboardText(card.terms.map((term) => term.term));
  }
  if (card?.variant === 'google_account_finding' && card.negatives && card.negatives.length > 0) {
    return negativesClipboardText(card.negatives.flatMap((group) => group.terms));
  }
  if (steps.length === 0) return null;
  return steps.map((step, index) => `${index + 1}. ${step.label}`).join('\n');
}

/** The recommendation row a card stands for. A platform card is one (its id names it); a read
 *  finding is recomposed every night and has none. */
export function recommendationIdOf(candidate: AccountCandidate): string | null {
  const isRecommendation =
    candidate.card_action != null || candidate.id.startsWith(PLATFORM_SIGNAL_PREFIX);
  return isRecommendation ? cardRecommendationId(candidate) : null;
}

function cardCurrency(card: PlatformCard | null): string | null {
  return card && 'currency' in card ? card.currency : null;
}

function decisionCardOf(
  candidate: AccountCandidate,
  input: DecisionCardsInput,
  doubted: ReadonlySet<AccountDetector>,
): DecisionCard {
  const platformCard = platformCardOf(candidate);
  const currency = cardCurrency(platformCard) ?? input.currency;
  const guard = isGuardDetector(candidate.detector);
  const blocksAccount = blocksTheAccount(platformCard);
  const steps = stepsOf(platformCard);
  return {
    id: candidate.id,
    candidate,
    platformCard,
    group: groupOf(candidate, platformCard),
    tier: tierOf(candidate, platformCard, input.dailySpend),
    title: titleOf(candidate, platformCard, currency),
    figure: figureOf(candidate, platformCard),
    impact: impactOf(candidate, currency, { guard, blocksAccount }),
    bars: evidenceBarsOf(candidate, platformCard, currency),
    steps,
    copyText: copyTextOf(platformCard, steps),
    note: platformCard?.variant === 'google_account_finding' ? platformCard.blocked : null,
    guard,
    blocksAccount,
    doubted: !guard && doubted.has(candidate.detector),
    autopilot: candidate.state === 'autopilot',
    action: input.cardActions.get(candidate.id),
    recommendationId: recommendationIdOf(candidate),
    portfolioId: candidate.cta.kind === 'portfolio' ? candidate.cta.target_id : null,
    currency,
  };
}

function precedence(card: DecisionCard): number {
  if (card.guard) return 0;
  return card.blocksAccount ? 1 : 2;
}

/** The account's cards in impact order. */
export function decisionCardsOf(input: DecisionCardsInput): DecisionCard[] {
  const guards = accountGuards(input.candidates);
  const doubted = doubtedBy(guards);
  return [...guards, ...rankAccountCandidates(input.candidates)]
    .map((candidate) => decisionCardOf(candidate, input, doubted))
    .sort((a, b) => precedence(a) - precedence(b) || TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
}

export function decisionCounts(cards: readonly DecisionCard[]): Record<DecisionFilter, number> {
  const counts: Record<DecisionFilter, number> = {
    all: cards.length,
    fix: 0,
    grow: 0,
    clean: 0,
  };
  for (const card of cards) counts[card.group] += 1;
  return counts;
}

export function tierCounts(cards: readonly DecisionCard[]): Record<DecisionTier, number> {
  const counts: Record<DecisionTier, number> = { high: 0, medium: 0, low: 0 };
  for (const card of cards) counts[card.tier] += 1;
  return counts;
}

export function cardsInFilter(
  cards: readonly DecisionCard[],
  filter: DecisionFilter,
): readonly DecisionCard[] {
  return filter === 'all' ? cards : cards.filter((card) => card.group === filter);
}

// ---------------------------------------------------------------------------
// What the module reads
// ---------------------------------------------------------------------------

export type ApprovalMaps = {
  families: Record<string, string>;
  insights: Record<string, string>;
};

type ApprovableFamily = (typeof APPROVABLE_FAMILIES)[number];

/** The ceilings the read was composed under, as the approvals need them. A family the worker
 *  did not record reads as `recommend`, the shipped default for every family but budget. */
function ceilingDefaults(
  raw: Readonly<Record<string, string>>,
): Record<ApprovableFamily, InsightState> {
  const state = (family: ApprovableFamily): InsightState => {
    const parsed = insightStateSchema.safeParse(raw[family]);
    return parsed.success ? parsed.data : 'recommend';
  };
  return {
    budget: state('budget'),
    creative_swap: state('creative_swap'),
    audience_change: state('audience_change'),
    new_audience: state('new_audience'),
    new_creatives: state('new_creatives'),
    structure: state('structure'),
  };
}

/** The read's candidates and guards with the approvals made since it was composed, as the
 *  Overview applies them: the read is last night's, an approval at noon is today's. */
export function readCandidatesOf(
  read: {
    candidates: AccountCandidate[];
    guards: AccountCandidate[];
    ceiling_defaults: Record<string, string>;
  } | null,
  maps: ApprovalMaps | undefined,
): AccountCandidate[] {
  if (!read) return [];
  if (!maps) return [...read.candidates, ...read.guards];
  const args = { ...maps, defaults: ceilingDefaults(read.ceiling_defaults) };
  return [...applyApprovals(read.candidates, args), ...applyApprovals(read.guards, args)];
}

/** The portfolios' daily plan, summed: the scale a card's money is tiered against when the read
 *  carries none. Null without portfolios. */
export function planPerDay(portfolios: readonly PlanSource[]): number | null {
  if (portfolios.length === 0) return null;
  return portfolios.reduce((sum, portfolio) => sum + (portfolioPlanPerDay(portfolio) ?? 0), 0);
}
