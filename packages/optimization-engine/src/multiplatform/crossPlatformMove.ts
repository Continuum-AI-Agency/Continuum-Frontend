// ---------------------------------------------------------------------------
// G27 — move budget between platforms that buy the same result, platform against platform.
//
// The comparison is the PLATFORM's aggregate d7 cost per result (decision 17), never one
// ad set against another. When one platform pays at least 1.5× the other, every eligible
// entity of the expensive platform goes down by the same percentage and every eligible
// entity of the cheap one goes up by the same percentage, the decrease total equal to the
// increase total to the minor unit. Decreases are legs 1…k and every increase follows them,
// so a failure between legs leaves the client spending less, never more.
//
// A move waits for a person unless the portfolio is in autopilot AND its budget_move scope
// is on (decision 18, which replaces 11); the reason always says that human approval is
// recommended. Mixed currencies never produce a move (decision 21).
// Design: decisiones.md 17–21; escenarios.html scenarios 01, 07, 09, 13, 21, 25, 26, 27, 29.
// ---------------------------------------------------------------------------

import { formatMoney, type PlatformId } from '@continuum/contracts';
import type { DeliveryState, OptimizationObjective } from '../types';
import { type PlatformCaps, platformCaps } from './learning';

/** d7 cost per result on one platform must be at least this multiple of the other's. */
export const CROSS_PLATFORM_GAP = 1.5;
/** Results each platform needs in d7 before its cost per result is compared at all. */
export const CROSS_PLATFORM_MIN_RESULTS = 10;
/** Days an entity is protected after it starts; younger ones are not compared. */
export const CROSS_PLATFORM_MIN_AGE_DAYS = 7;
/** TikTok refuses a budget below 105% of what the entity already spent today. */
export const TIKTOK_SPEND_FLOOR_MULTIPLE = 1.05;

/** One entity of the portfolio on one platform, as this cycle read it. */
export type CrossPlatformMember = {
  id: string;
  name: string | null;
  /** Daily budget, major units of the platform's currency. */
  currentBudget: number;
  /** d7 spend and results in the portfolio's KPI. Null when not read — never zero. */
  d7: { spend: number; results: number } | null;
  /** The member's own cost per result as the engine read it this cycle. Informational:
   *  the move compares platforms, so it never picks or drops a member by it. */
  costPerResult: number | null;
  /** Whole days since it started. Null = unknown, which never counts as old enough. */
  ageDays: number | null;
  /** Held for any reason: kpi mismatch, shared budget, read-only, CBO, operator. */
  frozen: boolean;
  /** The engine already recommends pausing it (status 'starved'). */
  starved: boolean;
  /** In its PLATFORM's learning phase (multiplatform/learning.ts). */
  learning: boolean;
  /** The platform reports learning as limited (Meta LEARNING_LIMITED, TikTok rule 08). */
  learningLimited: boolean;
  /** The engine's delivery read. Null = unknown. */
  deliveryState: DeliveryState | null;
  /** Whole days since its budget last changed. Null = unknown. */
  daysSinceBudgetChange: number | null;
  /** Its attribution window matches the portfolio's comparison (TikTok rule 21). */
  attributionMatches: boolean;
  /** What it already spent today (TikTok's 105% floor). Null = not read. */
  spendToday: number | null;
};

export type CrossPlatformLeg = {
  platform: PlatformId;
  currency: string;
  /** The platform's d7 spend and results when read as one aggregate (the portfolio's own
   *  cost series). Null ⇒ summed here from the members this rule compares. */
  reportedD7: { spend: number; results: number } | null;
  members: CrossPlatformMember[];
};

/** What the portfolio allows on its own. Absent ⇒ both false: the move waits for a person. */
export type CrossPlatformAutopilot = {
  /** apply_mode is autopilot and the kill switch (autopilot_paused) is off. */
  portfolioInAutopilot: boolean;
  /** autopilot_scopes.budget_move — off unless someone turned it on. */
  budgetMoveScope: boolean;
};

export type CrossPlatformMoveInput = {
  objective: OptimizationObjective;
  portfolioCurrency: string;
  /** The portfolio's target cost per result IN ITS CURRENCY. Null ⇒ no proposal: the
   *  engine's default target has no currency, and a move needs one (scenario 07). */
  cpaTarget: { amount: number; currency: string } | null;
  legs: CrossPlatformLeg[];
  autopilot?: CrossPlatformAutopilot;
};

/** Why an entity takes no part in the move. Shared by both sides; `throttled` and
 *  `learning_limited` only ever keep an entity from RECEIVING (it would not spend more). */
type MoveExclusion =
  | 'frozen'
  | 'starved'
  | 'dark'
  | 'learning'
  | 'cooldown'
  | 'no_budget'
  | 'rounds_to_zero';
export type ReceiverExclusion = MoveExclusion | 'throttled' | 'learning_limited';
export type DonorExclusion = MoveExclusion;

export type ComparisonExclusion =
  | {
      platform: PlatformId;
      entityId: string;
      reason: 'young' | 'frozen' | 'attribution_mismatch' | 'not_read';
    }
  | { platform: PlatformId; entityId: null; reason: 'insufficient_results'; results: number };

export type MoveLeg = {
  leg: number;
  direction: 'decrease' | 'increase';
  platform: PlatformId;
  entityId: string;
  entityName: string | null;
  from: number;
  to: number;
  currency: string;
  caps: PlatformCaps;
  /** TikTok cannot take a budget under 105% of today's spend until midnight, so such a
   *  decrease is scheduled for 00:00 advertiser time. */
  timing: 'immediate' | 'next_day';
  /** Increases run only after every decrease is confirmed applied. */
  waitsFor: 'nothing' | 'decrease_applied';
};

/** Where the minor units the common percentage cannot split evenly went. */
export type MoveRounding = {
  /** Minor units left after flooring every entity's share of the side's total. */
  remainderMinor: number;
  /** One extra minor unit each, largest dropped fraction first, then by entity id. */
  assignedTo: string[];
};

export type MoveBindingCap = {
  side: 'donor' | 'receiver';
  platform: PlatformId;
  /** The entity whose cap is the tightest on that side; every entity is held to it. */
  entityId: string;
  pct: number;
  basis: string;
};

export type CrossPlatformMoveProposal = {
  outcome: 'proposal';
  rule: 'G27';
  kind: 'budget_move';
  amount: number;
  amountMinor: number;
  currency: string;
  donorPlatform: PlatformId;
  receiverPlatform: PlatformId;
  costPerResult: { donor: number; receiver: number };
  results: { donor: number; receiver: number };
  ratio: number;
  /** The one percentage every donor entity goes down by, and every receiver up by. */
  donorPct: number;
  receiverPct: number;
  bindingCap: MoveBindingCap;
  rounding: { donor: MoveRounding; receiver: MoveRounding };
  /** Every decrease first, then every increase. */
  legs: MoveLeg[];
  excludedReceivers: { entityId: string; entityName: string | null; reason: ReceiverExclusion }[];
  excludedDonors: { entityId: string; entityName: string | null; reason: DonorExclusion }[];
  excludedFromComparison: ComparisonExclusion[];
  /** False only when the portfolio is in autopilot with budget_move on (decision 18). */
  needsApproval: boolean;
  autoApply: boolean;
  reason: string;
};

export type CrossPlatformRefusal =
  | 'missing_cpa_target'
  | 'currency_mismatch'
  | 'insufficient_platforms'
  | 'below_threshold'
  | 'no_eligible_donor'
  | 'no_eligible_receiver';

export type CrossPlatformMoveRefusal = {
  outcome: 'refusal';
  rule: 'G27';
  refusal: CrossPlatformRefusal;
  reason: string;
  ratio: number | null;
  excludedFromComparison: ComparisonExclusion[];
  excludedReceivers: { entityId: string; entityName: string | null; reason: ReceiverExclusion }[];
  excludedDonors: { entityId: string; entityName: string | null; reason: DonorExclusion }[];
};

export type CrossPlatformMoveResult = CrossPlatformMoveProposal | CrossPlatformMoveRefusal;

type PricedLeg = { leg: CrossPlatformLeg; spend: number; results: number; cost: number };

const cents = (v: number): number => Math.round(v * 100) / 100;
const toMinor = (v: number): number => Math.round(v * 100);
const percent = (fraction: number): string => `${(fraction * 100).toFixed(2)}%`;

const PLATFORM_LABEL: Readonly<Record<PlatformId, string>> = {
  meta: 'Meta',
  google_ads: 'Google',
  tiktok_ads: 'TikTok',
};
const UNIT_LABEL: Readonly<Record<PlatformId, string>> = {
  meta: 'ad set',
  google_ads: 'campaign',
  tiktok_ads: 'ad group',
};

export const HUMAN_APPROVAL_RECOMMENDED =
  'Human approval is recommended for moves between platforms.';

function refusal(
  refusalKind: CrossPlatformRefusal,
  reason: string,
  extra: Partial<Omit<CrossPlatformMoveRefusal, 'outcome' | 'rule' | 'refusal' | 'reason'>> = {},
): CrossPlatformMoveRefusal {
  return {
    outcome: 'refusal',
    rule: 'G27',
    refusal: refusalKind,
    reason,
    ratio: extra.ratio ?? null,
    excludedFromComparison: extra.excludedFromComparison ?? [],
    excludedReceivers: extra.excludedReceivers ?? [],
    excludedDonors: extra.excludedDonors ?? [],
  };
}

/** Members whose d7 this rule compares: delivering long enough, held by nothing, and
 *  counting results in the same attribution window as the other platform. */
function comparableMembers(
  leg: CrossPlatformLeg,
  excluded: ComparisonExclusion[],
): CrossPlatformMember[] {
  return leg.members.filter((m) => {
    const out = (reason: 'young' | 'frozen' | 'attribution_mismatch' | 'not_read') => {
      excluded.push({ platform: leg.platform, entityId: m.id, reason });
      return false;
    };
    if (m.frozen) return out('frozen');
    if (!m.attributionMatches) return out('attribution_mismatch');
    if (m.ageDays === null || m.ageDays < CROSS_PLATFORM_MIN_AGE_DAYS) return out('young');
    if (!m.d7) return out('not_read');
    return true;
  });
}

/** The d7 a leg is priced on: the reported aggregate, or the sum of its comparable members. */
export function legD7(
  leg: CrossPlatformLeg,
  excluded: ComparisonExclusion[] = [],
): { spend: number; results: number } {
  if (leg.reportedD7) return leg.reportedD7;
  return comparableMembers(leg, excluded).reduce(
    (acc, m) => ({
      spend: acc.spend + (m.d7?.spend ?? 0),
      results: acc.results + (m.d7?.results ?? 0),
    }),
    { spend: 0, results: 0 },
  );
}

function cooledDown(m: CrossPlatformMember, caps: PlatformCaps): boolean {
  if (caps.minDaysBetweenChanges <= 0) return true;
  return m.daysSinceBudgetChange !== null && m.daysSinceBudgetChange >= caps.minDaysBetweenChanges;
}

/** Google and TikTok restart learning on any budget change, so their learning entities take
 *  no part. Meta's flag is the engine's 50-event proxy, which caps a DECREASE at 8% and
 *  leaves a raise alone (scenario 11): a learning Meta ad set receives, and as a donor its
 *  8% binds the whole side's percentage. */
const learningRestarts = (platform: PlatformId): boolean => platform !== 'meta';

function exclusion(
  m: CrossPlatformMember,
  platform: PlatformId,
  caps: PlatformCaps,
  side: 'donor' | 'receiver',
): ReceiverExclusion | null {
  if (m.frozen) return 'frozen';
  if (m.starved) return 'starved';
  // Dark spends nothing: cutting it moves no money, raising it buys nothing.
  if (m.deliveryState === 'dark') return 'dark';
  if (side === 'receiver' && m.deliveryState === 'throttled') return 'throttled';
  if (side === 'receiver' && m.learningLimited) return 'learning_limited';
  if (m.learning && learningRestarts(platform)) return 'learning';
  if (!cooledDown(m, caps)) return 'cooldown';
  if (toMinor(m.currentBudget) <= 0) return 'no_budget';
  return null;
}

/** The cap's own wording for the side it binds. A learning Meta ad set's basis talks about
 *  its 8% decrease, which says nothing about how far it may go UP. */
function capBasis(side: 'donor' | 'receiver', caps: PlatformCaps): string {
  if (side === 'donor' || caps.platform === 'tiktok_ads') return caps.basis;
  return `${PLATFORM_LABEL[caps.platform]}: at most +${Math.round(caps.upPct * 100)}% per cycle`;
}

type Eligible = { m: CrossPlatformMember; caps: PlatformCaps; budgetMinor: number };

type Side = {
  platform: PlatformId;
  eligible: Eligible[];
  /** The common percentage this side may move: its tightest entity cap. */
  pct: number;
  binding: Eligible;
  /** The most this side can move at `pct`, every entity floored to the minor unit. */
  maxMinor: number;
  totalMinor: number;
};

function sideOf(
  leg: CrossPlatformLeg,
  objective: OptimizationObjective,
  side: 'donor' | 'receiver',
  excluded: { entityId: string; entityName: string | null; reason: ReceiverExclusion }[],
): Side | null {
  const eligible: Eligible[] = [];
  for (const m of leg.members) {
    const caps = platformCaps(leg.platform, objective, m.learning);
    const why = exclusion(m, leg.platform, caps, side);
    if (why) {
      excluded.push({ entityId: m.id, entityName: m.name, reason: why });
      continue;
    }
    eligible.push({ m, caps, budgetMinor: toMinor(m.currentBudget) });
  }
  if (eligible.length === 0) return null;
  // A larger budget first, then by id: the order of the legs and of every tie below.
  eligible.sort((a, b) => b.budgetMinor - a.budgetMinor || a.m.id.localeCompare(b.m.id));
  const capOf = (e: Eligible) => (side === 'donor' ? e.caps.downPct : e.caps.upPct);
  const binding = eligible.reduce((tight, e) => (capOf(e) < capOf(tight) ? e : tight));
  const pct = capOf(binding);
  return {
    platform: leg.platform,
    eligible,
    pct,
    binding,
    maxMinor: eligible.reduce((sum, e) => sum + Math.floor(pct * e.budgetMinor + 1e-9), 0),
    totalMinor: eligible.reduce((sum, e) => sum + e.budgetMinor, 0),
  };
}

/**
 * Split `amountMinor` over the side's entities in proportion to their budgets — the same
 * percentage for each — flooring every share and handing the remainder out one minor unit
 * at a time, largest dropped fraction first, then by id. No entity passes `pct` of its
 * budget: the amount never exceeds the side's floored maximum, so there is always room.
 */
function split(side: Side, amountMinor: number): { shares: number[]; rounding: MoveRounding } {
  const exact = side.eligible.map((e) => (amountMinor * e.budgetMinor) / side.totalMinor);
  const shares = exact.map((x) => Math.floor(x + 1e-9));
  const room = side.eligible.map(
    (e, i) => Math.floor(side.pct * e.budgetMinor + 1e-9) - shares[i]!,
  );
  const remainderMinor = amountMinor - shares.reduce((a, b) => a + b, 0);
  const order = side.eligible
    .map((e, i) => ({ i, id: e.m.id, fraction: exact[i]! - shares[i]! }))
    .sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id));
  const assignedTo: string[] = [];
  let left = remainderMinor;
  while (left > 0) {
    for (const { i, id } of order) {
      if (left === 0) break;
      if (room[i]! <= 0) continue;
      shares[i]! += 1;
      room[i]! -= 1;
      assignedTo.push(id);
      left -= 1;
    }
  }
  return { shares, rounding: { remainderMinor, assignedTo } };
}

function legsFor(
  side: Side,
  shares: number[],
  direction: 'decrease' | 'increase',
  currency: string,
  excluded: { entityId: string; entityName: string | null; reason: ReceiverExclusion }[],
): MoveLeg[] {
  const legs: MoveLeg[] = [];
  side.eligible.forEach((e, i) => {
    const share = shares[i]!;
    if (share === 0) {
      // A budget too small for one minor unit at this percentage: a zero leg moves nothing.
      excluded.push({ entityId: e.m.id, entityName: e.m.name, reason: 'rounds_to_zero' });
      return;
    }
    const toMinorValue = direction === 'decrease' ? e.budgetMinor - share : e.budgetMinor + share;
    const to = toMinorValue / 100;
    const scheduled =
      direction === 'decrease' &&
      side.platform === 'tiktok_ads' &&
      e.m.spendToday !== null &&
      to < TIKTOK_SPEND_FLOOR_MULTIPLE * e.m.spendToday;
    legs.push({
      leg: 0,
      direction,
      platform: side.platform,
      entityId: e.m.id,
      entityName: e.m.name,
      from: e.budgetMinor / 100,
      to,
      currency,
      caps: e.caps,
      timing: scheduled ? 'next_day' : 'immediate',
      waitsFor: direction === 'decrease' ? 'nothing' : 'decrease_applied',
    });
  });
  // A scheduled decrease holds every leg after it, so today's decreases go first.
  return legs.sort((a, b) => Number(a.timing === 'next_day') - Number(b.timing === 'next_day'));
}

/**
 * G27: propose moving budget from the platform that pays at least 1.5× more per result
 * (aggregate d7, ≥ 10 results on each side, same currency) to the one that pays less, the
 * same percentage off every eligible entity of the one and onto every eligible entity of
 * the other — or say, by name, why not.
 */
export function crossPlatformMove(input: CrossPlatformMoveInput): CrossPlatformMoveResult {
  const { objective, portfolioCurrency, cpaTarget } = input;
  if (!cpaTarget || cpaTarget.currency !== portfolioCurrency) {
    return refusal(
      'missing_cpa_target',
      `No target cost per result in ${portfolioCurrency}: set one before budget moves between platforms.`,
    );
  }
  const foreign = input.legs.find((leg) => leg.currency !== portfolioCurrency);
  if (foreign) {
    return refusal(
      'currency_mismatch',
      `${PLATFORM_LABEL[foreign.platform]} bills in ${foreign.currency} and the portfolio in ${portfolioCurrency}. Budget never moves between platforms in different currencies.`,
    );
  }

  const excludedFromComparison: ComparisonExclusion[] = [];
  const priced: PricedLeg[] = [];
  for (const leg of input.legs) {
    const d7 = legD7(leg, excludedFromComparison);
    if (d7.results < CROSS_PLATFORM_MIN_RESULTS) {
      excludedFromComparison.push({
        platform: leg.platform,
        entityId: null,
        reason: 'insufficient_results',
        results: d7.results,
      });
      continue;
    }
    priced.push({ leg, spend: d7.spend, results: d7.results, cost: d7.spend / d7.results });
  }
  if (priced.length < 2) {
    const short = input.legs
      .filter((leg) => !priced.some((p) => p.leg === leg))
      .map((leg) => PLATFORM_LABEL[leg.platform]);
    return refusal(
      'insufficient_platforms',
      input.legs.length < 2
        ? 'Only one platform is in this portfolio: moving budget between platforms needs two.'
        : `Not enough results to compare platforms: ${short.join(', ')} had fewer than ${CROSS_PLATFORM_MIN_RESULTS} in the last 7 days.`,
      { excludedFromComparison },
    );
  }

  const sorted = [...priced].sort((a, b) => b.cost - a.cost);
  const donorLeg = sorted[0]!;
  const receiverLeg = sorted[sorted.length - 1]!;
  const ratio = donorLeg.cost / receiverLeg.cost;
  const currency = portfolioCurrency;
  const donorLabel = PLATFORM_LABEL[donorLeg.leg.platform];
  const receiverLabel = PLATFORM_LABEL[receiverLeg.leg.platform];
  if (ratio < CROSS_PLATFORM_GAP) {
    return refusal(
      'below_threshold',
      `${donorLabel} pays ${formatMoney(donorLeg.cost, currency)} per result and ${receiverLabel} ${formatMoney(receiverLeg.cost, currency)}: ${ratio.toFixed(2)}×, under the ${CROSS_PLATFORM_GAP}× that moves money.`,
      { ratio, excludedFromComparison },
    );
  }

  const excludedDonors: CrossPlatformMoveProposal['excludedDonors'] = [];
  const donor = sideOf(donorLeg.leg, objective, 'donor', excludedDonors);
  if (!donor || donor.maxMinor <= 0) {
    return refusal('no_eligible_donor', `Nothing on ${donorLabel} can be cut this cycle.`, {
      ratio,
      excludedFromComparison,
      excludedDonors,
    });
  }
  const excludedReceivers: CrossPlatformMoveProposal['excludedReceivers'] = [];
  const receiver = sideOf(receiverLeg.leg, objective, 'receiver', excludedReceivers);
  if (!receiver || receiver.maxMinor <= 0) {
    return refusal(
      'no_eligible_receiver',
      `Nothing on ${receiverLabel} can take more budget this cycle.`,
      { ratio, excludedFromComparison, excludedDonors, excludedReceivers },
    );
  }

  // The tighter side sets the amount; its cap is the percentage on that side, and the
  // other side's percentage follows from the same amount over its own total.
  const amountMinor = Math.min(donor.maxMinor, receiver.maxMinor);
  const bindingSide = donor.maxMinor <= receiver.maxMinor ? donor : receiver;
  const cut = split(donor, amountMinor);
  const raise = split(receiver, amountMinor);
  const decreases = legsFor(donor, cut.shares, 'decrease', currency, excludedDonors);
  const increases = legsFor(receiver, raise.shares, 'increase', currency, excludedReceivers);
  const legs = [...decreases, ...increases].map((leg, i) => ({ ...leg, leg: i + 1 }));

  const donorPct = amountMinor / donor.totalMinor;
  const receiverPct = amountMinor / receiver.totalMinor;
  const autoApply =
    input.autopilot?.portfolioInAutopilot === true && input.autopilot.budgetMoveScope === true;
  const bindingCap: MoveBindingCap = {
    side: bindingSide === donor ? 'donor' : 'receiver',
    platform: bindingSide.platform,
    entityId: bindingSide.binding.m.id,
    pct: bindingSide.pct,
    basis: capBasis(bindingSide === donor ? 'donor' : 'receiver', bindingSide.binding.caps),
  };

  const amount = amountMinor / 100;
  const count = (n: number, platform: PlatformId) =>
    `${n} ${UNIT_LABEL[platform]}${n === 1 ? '' : 's'}`;
  const remainderText = (side: string, r: MoveRounding, names: Map<string, string>) =>
    r.remainderMinor === 0
      ? ''
      : ` Rounding: ${formatMoney(r.remainderMinor / 100, currency)} of the ${side} went to ${[...new Set(r.assignedTo)].map((id) => names.get(id) ?? id).join(', ')}.`;
  const names = new Map(
    [...donor.eligible, ...receiver.eligible].map((e) => [e.m.id, e.m.name ?? e.m.id]),
  );
  const bindingName = names.get(bindingCap.entityId) ?? bindingCap.entityId;
  const reason =
    `Move ${formatMoney(amount, currency)}/day from ${donorLabel} to ${receiverLabel}: last 7 days ` +
    `${donorLabel} paid ${formatMoney(donorLeg.cost, currency)} per result and ${receiverLabel} ` +
    `${formatMoney(receiverLeg.cost, currency)} (${ratio.toFixed(2)}×). ` +
    `Every eligible ${donorLabel} ${UNIT_LABEL[donor.platform]} goes down ${percent(donorPct)} ` +
    `(${count(decreases.length, donor.platform)}) and every eligible ${receiverLabel} ` +
    `${UNIT_LABEL[receiver.platform]} goes up ${percent(receiverPct)} ` +
    `(${count(increases.length, receiver.platform)}); ${bindingName} holds the ` +
    `${bindingCap.side === 'donor' ? 'decrease' : 'increase'} to ${percent(bindingCap.pct)} ` +
    `(${bindingCap.basis}).` +
    remainderText('decrease', cut.rounding, names) +
    remainderText('increase', raise.rounding, names) +
    ` ${HUMAN_APPROVAL_RECOMMENDED} ` +
    (autoApply
      ? 'Autopilot applies it within each platform’s caps because this portfolio allows moves between platforms.'
      : 'It waits for a person.');

  return {
    outcome: 'proposal',
    rule: 'G27',
    kind: 'budget_move',
    amount,
    amountMinor,
    currency,
    donorPlatform: donor.platform,
    receiverPlatform: receiver.platform,
    costPerResult: { donor: donorLeg.cost, receiver: receiverLeg.cost },
    results: { donor: donorLeg.results, receiver: receiverLeg.results },
    ratio,
    donorPct,
    receiverPct,
    bindingCap,
    rounding: { donor: cut.rounding, receiver: raise.rounding },
    legs,
    excludedReceivers,
    excludedDonors,
    excludedFromComparison,
    needsApproval: !autoApply,
    autoApply,
    reason,
  };
}
