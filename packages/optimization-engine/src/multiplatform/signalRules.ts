// ---------------------------------------------------------------------------
// The platform-only rules (wave 8): what the engine says about the parts of Google and TikTok
// the neutral snapshot does not carry — search terms, keywords, bid targets, PMax asset
// groups, TikTok creatives and organic posts. Every one is recommend-only: each finding is a
// `platform_card` the Frontend renders and, where a write exists, the OptimizerAction a
// person approves. A rule that lacks what it needs stays silent and says why by name.
//
// One entry point, evaluatePlatformSignals(signals, context) — the seam the Optimizer's
// signal producer calls (mp-w8-signals-producer).
// Design: google-acciones.html §4 (G05, G07, G09, G10, G11, G12, G18, G23); tiktok.html §4 rules 07, 10, 12,
// 14, 16, 20, 21; escenarios.html 20, 31–44.
// ---------------------------------------------------------------------------

import {
  currencyMinorOffset,
  formatMoney,
  G07_COOLDOWN_DAYS,
  G07_STEP,
  type MultiPlatformSnapshot,
  NegativeTermSchema,
  type OptimizerAction,
  OptimizerActionSchema,
  type PlatformCard,
  PlatformCardSchema,
  type PlatformEntityRef,
  type PlatformSignals,
} from '@continuum/contracts';
import { DARK_DAYS_THRESHOLD } from '../delivery';
import type { OptimizationObjective, WindowMetrics } from '../types';
import {
  type CreativeSibling,
  draggingSiblings,
  G23_FREQUENCY_CAP,
  g03BudgetLimitedRaise,
  g09Thresholds,
  g11LowQualityKeyword,
  g23Saturation,
  isBudgetConstrained,
  pmaxAssetThresholds,
  winnerToVary,
} from './googleRules';
import { googleBudgetLimitedCard } from './platformCards';

/** G05/G19: never more than this many negatives proposed in one cycle, account-wide. */
export const G05_MAX_NEGATIVES_PER_CYCLE = 20;
/** Promote: a term needs this many conversions in the window before it becomes a keyword. */
export const PROMOTE_MIN_CONVERSIONS = 3;
/** G07: raise the Google Ads target CPA (bid setting) when the real cost is under this share
 *  of the PORTFOLIO's CPA goal … */
export const G07_RAISE_BELOW = 0.8;
/** … and Search loses more than this share of impressions to rank. */
export const G07_RANK_LOST_ABOVE = 0.3;
/** G07: lower the Google Ads target CPA when the real cost is over this multiple of the
 *  portfolio's CPA goal — or over the goal at all while Google's target sits above it. */
export const G07_LOWER_ABOVE = 1.3;
/** G07's step and cooldown and G11's Quality Score floor live in contracts (google-tab.ts),
 *  where the Google tab reads them too. */
export { G07_COOLDOWN_DAYS, G07_STEP, G11_MAX_QUALITY_SCORE } from '@continuum/contracts';
/** T1: a creative needs this many impressions before its 2-second hold is judged. */
export const T1_MIN_IMPRESSIONS = 2000;
/** T1: the portfolio's lower quartile needs at least this many judged creatives. */
export const T1_MIN_CREATIVES = 4;
/** T3: reach in the last 7 days growing less than this over the 7 before is "no new reach". */
export const T3_REACH_GROWTH_BELOW = 0.05;
/** T3: consecutive days of spend under the 7-day average. */
export const T3_FALLING_DAYS = 3;
/** T5: a post counts as fresh for this many hours after it is published. */
export const T5_FRESH_HOURS = 72;
/** T5: the post's views must reach this percentile of the account's posts. */
export const T5_PERCENTILE = 90;
/** T5: a percentile over fewer posts than this says nothing. */
export const T5_MIN_POSTS = 5;
/** T7: TikTok's minimum ad group budget in USD, times the currency's verification ratio. */
export const TIKTOK_MIN_ADGROUP_BUDGET_USD = 20;
/** TikTok's Budget Verification Ratio per currency (tiktok.html §2.7) — a TikTok table,
 *  not an exchange rate. A currency missing here makes the floor abstain, never guess. */
export const TIKTOK_BUDGET_VERIFICATION_RATIO: Readonly<Record<string, number>> = {
  USD: 1,
  MXN: 10,
  JPY: 100,
  KRW: 1000,
  IDR: 10000,
  BRL: 1,
};
/** T12: Meta's default attribution, the window a cross-platform comparison uses. */
export const META_ATTRIBUTION = { click_window_days: 7, view_window_days: 1 } as const;

export type PlatformSignalsContext = {
  /** The portfolio's target cost per result in the ACCOUNT's currency (signals.currency).
   *  Null, or another currency ⇒ every rule that prices against it abstains by name. */
  cpaTarget: { amount: number; currency: string } | null;
  /** The cycle's clock, ISO instant: G07's cooldown and T5's 72-hour window. */
  now: string;
  /** Every MultiPlatformSnapshot read for this account this cycle (any level). Names come
   *  from here; G07 reads campaign d14 cost and rank-lost share; T7 reads ad group budgets. */
  snapshots: readonly MultiPlatformSnapshot[];
  /** The WindowMetrics field that counts one of the portfolio's results. */
  kpiField: keyof WindowMetrics;
  /** The portfolio compares this account against Meta's platform-attributed cost (more than
   *  one platform, platform attribution — not GA4 or a sheet). T12 speaks only then. */
  crossPlatformComparison: boolean;
  /** Entities the cycle's D2 (dark with budget) already carries a card for. Their delivery
   *  card is D2's; G12 and T11 leave them out by name. Absent ⇒ none. */
  d2EntityIds?: ReadonlySet<string>;
  /** The portfolio's objective: it sets how far G03 may raise a budget in one step
   *  (platformCaps). Absent ⇒ G03 abstains by name. */
  objective?: OptimizationObjective;
};

/** Every rule evaluatePlatformSignals can emit — the `signal:<rule>` triggers it persists. */
export const PLATFORM_SIGNAL_RULES = [
  'G03',
  'G05',
  'G05_promote',
  'G07',
  'G09',
  'G10',
  'G11',
  'G12',
  'G18_pmax_assets',
  'G18_pmax_coverage',
  'G23',
  'T1',
  'T3',
  'T5',
  'T7',
  'T11',
  'T12',
] as const;

export type PlatformSignalRule = (typeof PLATFORM_SIGNAL_RULES)[number];

export type PlatformSignalSeverity = 'low' | 'medium' | 'high';

export type PlatformSignalRecommendation = {
  rule: PlatformSignalRule;
  platform: 'google_ads' | 'tiktok_ads';
  /** What the card is about: a campaign or an ad group. */
  entity: PlatformEntityRef;
  /** What inside `entity` the card is about, unique per (rule, entity.id) in one run. */
  subject_key: string;
  platform_card: PlatformCard;
  /** Null when the finding has no write (PMax coverage, every TikTok rule). */
  action: OptimizerAction | null;
  needsApproval: true;
  severity: PlatformSignalSeverity;
  reason: string;
};

export type PlatformSignalAbstention = {
  rule: PlatformSignalRule;
  entityId: string | null;
  reason: string;
  /** Set when the rule DID find something and a card that speaks for the whole account held
   *  it back (G12 on a dark account): a finding deferred, not a rule that lacked an input. */
  suppressedBy?: PlatformSignalRule;
};

export type PlatformSignalsEvaluation = {
  recommendations: PlatformSignalRecommendation[];
  abstentions: PlatformSignalAbstention[];
  /** T12: TikTok ad groups G27 must not compare (CrossPlatformMember.attributionMatches). */
  comparisonExclusions: {
    platform: 'tiktok_ads';
    entityId: string;
    reason: 'attribution_mismatch';
  }[];
};

type GoogleSignals = NonNullable<PlatformSignals['google']>;
type TikTokSignals = NonNullable<PlatformSignals['tiktok']>;
type TikTokCreative = TikTokSignals['creatives'][number];
type CreativeDay = TikTokCreative['days'][number];

const DAY_MS = 86_400_000;
const cents = (v: number): number => Math.round(v * 100) / 100;
const pct = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;
const normalize = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Shared state of one evaluation: what it found, what it declined, and the names it uses. */
class Run {
  readonly recommendations: PlatformSignalRecommendation[] = [];
  readonly abstentions: PlatformSignalAbstention[] = [];
  readonly comparisonExclusions: PlatformSignalsEvaluation['comparisonExclusions'] = [];
  private readonly byId = new Map<string, MultiPlatformSnapshot>();

  constructor(
    readonly signals: PlatformSignals,
    readonly context: PlatformSignalsContext,
  ) {
    for (const s of context.snapshots) {
      if (s.accountId === signals.account_id || !this.byId.has(s.id)) this.byId.set(s.id, s);
    }
  }

  get currency(): string | null {
    return this.signals.currency;
  }

  /** The target, only when it is in the account's own currency. */
  get target(): number | null {
    const t = this.context.cpaTarget;
    if (!t || !this.currency || t.currency !== this.currency || !(t.amount > 0)) return null;
    return t.amount;
  }

  get windowDays(): number {
    const { since, until } = this.signals.window;
    return Math.round((Date.parse(until) - Date.parse(since)) / DAY_MS) + 1;
  }

  snapshot(id: string): MultiPlatformSnapshot | undefined {
    return this.byId.get(id);
  }

  name(id: string, noun: string): string {
    return this.byId.get(id)?.name ?? `${noun} ${id}`;
  }

  ref(
    platform: 'google_ads' | 'tiktok_ads',
    level: PlatformEntityRef['level'],
    nativeLevel: PlatformEntityRef['nativeLevel'],
    id: string,
    name?: string,
  ): PlatformEntityRef {
    return {
      platform,
      level,
      nativeLevel,
      id,
      accountId: this.signals.account_id,
      ...(name ? { name } : {}),
    };
  }

  abstain(rule: PlatformSignalRule, entityId: string | null, reason: string): void {
    this.abstentions.push({ rule, entityId, reason });
  }

  /** Emits a finding only when its card and action pass their contracts; a producer bug
   *  becomes a named abstention, never an unrenderable card. */
  recommend(r: Omit<PlatformSignalRecommendation, 'needsApproval'>): void {
    const card = PlatformCardSchema.safeParse(r.platform_card);
    const action = r.action === null ? null : OptimizerActionSchema.safeParse(r.action);
    if (!card.success || (action && !action.success)) {
      const issue = !card.success ? card.error.issues[0] : action?.error?.issues[0];
      this.abstain(
        r.rule,
        r.entity.id,
        `the ${r.platform_card.variant} finding failed its contract (${issue?.path.join('.')}: ${issue?.message}); not shown`,
      );
      return;
    }
    this.recommendations.push({ ...r, needsApproval: true });
  }
}

function results(m: WindowMetrics | undefined, kpiField: keyof WindowMetrics): number {
  return ((m?.[kpiField] as number | undefined) ?? 0) || 0;
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

/** Active, positive keywords of the account, normalized: a term that is one is never a
 *  negative and never "promoted". */
function activeKeywordTexts(google: GoogleSignals): Set<string> {
  return new Set(
    google.keywords
      .filter((k) => k.status === 'ENABLED' && !k.negative)
      .map((k) => normalize(k.text)),
  );
}

/** G05: terms that spend more than a result is worth and convert nothing → EXACT negatives
 *  on their campaign. One card per campaign, at most 20 negatives across the account. */
function g05NegativeTerms(run: Run, google: GoogleSignals, target: number, currency: string) {
  const keywords = activeKeywordTexts(google);
  const candidates = google.search_terms
    .filter(
      (t) =>
        t.status === 'NONE' &&
        t.totals.conversions === 0 &&
        t.totals.spend > target &&
        !isInactiveCampaign(run, t.campaign_id),
    )
    .sort((a, b) => b.totals.spend - a.totals.spend || a.term.localeCompare(b.term));
  const picked: typeof candidates = [];
  for (const t of candidates) {
    if (keywords.has(normalize(t.term))) {
      run.abstain('G05', t.campaign_id, `"${t.term}" is also an active keyword; never excluded.`);
      continue;
    }
    if (!NegativeTermSchema.safeParse({ text: t.term, matchType: 'EXACT' }).success) {
      run.abstain(
        'G05',
        t.campaign_id,
        `"${t.term}" is over Google's 80-character or 10-word keyword limit; it cannot be a negative.`,
      );
      continue;
    }
    if (picked.length >= G05_MAX_NEGATIVES_PER_CYCLE) {
      run.abstain(
        'G05',
        t.campaign_id,
        `"${t.term}" waits for the next cycle: ${G05_MAX_NEGATIVES_PER_CYCLE} negatives is the most one cycle proposes.`,
      );
      continue;
    }
    picked.push(t);
  }
  const byCampaign = new Map<string, typeof picked>();
  for (const t of picked)
    byCampaign.set(t.campaign_id, [...(byCampaign.get(t.campaign_id) ?? []), t]);
  const days = run.windowDays;
  for (const [campaignId, terms] of byCampaign) {
    const campaignName = run.name(campaignId, 'campaign');
    const spend = terms.reduce((sum, t) => sum + t.totals.spend, 0);
    const list = terms
      .map(
        (t) =>
          `"${t.term}" (${formatMoney(t.totals.spend, currency, { distinguishFrom: target })})`,
      )
      .join(', ');
    // Each term cost MORE than the target: the target prints with the decimals that tell it
    // from the cheapest of them, so no term reads as a tie with the figure it exceeded.
    const targetText = formatMoney(target, currency, {
      distinguishFrom: terms.map((t) => t.totals.spend),
    });
    run.recommend({
      rule: 'G05',
      platform: 'google_ads',
      entity: run.ref('google_ads', 'campaign', 'campaign', campaignId, campaignName),
      subject_key: 'negatives',
      severity: 'medium',
      platform_card: {
        variant: 'google_negative_terms',
        campaign_name: campaignName,
        currency,
        window_days: days,
        terms: terms.map((t) => ({
          term: t.term,
          spend: cents(t.totals.spend),
          clicks: t.totals.clicks,
          conversions: t.totals.conversions,
        })),
        savings_per_day: cents(spend / days),
        match_type: 'EXACT',
      },
      action: {
        kind: 'add_negatives',
        ref: run.ref('google_ads', 'campaign', 'campaign', campaignId, campaignName),
        terms: terms.map((t) => ({ text: t.term, matchType: 'EXACT' })),
        scope: 'campaign',
      },
      reason:
        terms.length === 1
          ? `The search term ${list} in ${campaignName} cost more than the ${targetText} target in ${days} days with no conversions. Add it as an exact negative.`
          : `${terms.length} search terms in ${campaignName} each cost more than the ${targetText} target in ${days} days with no conversions, ${formatMoney(spend, currency)} together: ${list}. Add them as exact negatives.`,
    });
  }
}

/** Promote: a term that converts at or under target and is not a keyword yet → an EXACT
 *  keyword in its ad group. */
function promoteTerms(run: Run, google: GoogleSignals, target: number, currency: string) {
  const keywords = activeKeywordTexts(google);
  const seen = new Set<string>();
  for (const t of google.search_terms) {
    if (t.status === 'ADDED' || t.status === 'ADDED_EXCLUDED' || t.status === 'EXCLUDED') continue;
    if (isInactiveCampaign(run, t.campaign_id)) continue;
    if (t.totals.conversions < PROMOTE_MIN_CONVERSIONS) continue;
    const cost = t.totals.spend / t.totals.conversions;
    if (cost > target) continue;
    const key = normalize(t.term);
    if (keywords.has(key)) continue;
    if (!t.ad_group_id) {
      run.abstain(
        'G05_promote',
        t.campaign_id,
        `"${t.term}" has no ad group (PMax); it cannot become a keyword.`,
      );
      continue;
    }
    if (!NegativeTermSchema.safeParse({ text: t.term, matchType: 'EXACT' }).success) {
      run.abstain('G05_promote', t.ad_group_id, `"${t.term}" is over Google's keyword limits.`);
      continue;
    }
    if (seen.has(`${t.ad_group_id}|${key}`)) continue;
    seen.add(`${t.ad_group_id}|${key}`);
    const campaignName = run.name(t.campaign_id, 'campaign');
    const adGroupName = run.name(t.ad_group_id, 'ad group');
    const adGroup = run.ref('google_ads', 'group', 'ad_group', t.ad_group_id, adGroupName);
    run.recommend({
      rule: 'G05_promote',
      platform: 'google_ads',
      entity: adGroup,
      subject_key: key,
      severity: 'low',
      platform_card: {
        variant: 'google_promote_term',
        campaign_name: campaignName,
        ad_group_name: adGroupName,
        term: t.term,
        currency,
        window_days: run.windowDays,
        conversions: t.totals.conversions,
        cost_per_result: cents(cost) > 0 ? cents(cost) : null,
        matched_keyword: t.matched_keyword,
      },
      action: { kind: 'add_keyword', ref: adGroup, keyword: { text: t.term, matchType: 'EXACT' } },
      reason: `"${t.term}" brought ${t.totals.conversions} conversions in ${run.windowDays} days at ${formatMoney(cost, currency, { distinguishFrom: target })} each, at or under the ${formatMoney(target, currency, { distinguishFrom: cost })} target, and is not a keyword yet. Add it as an exact keyword to ${adGroupName}.`,
    });
  }
}

/** G07: move the Google Ads target CPA — a BID SETTING on the platform, cost-cap-like — 10% so
 *  it serves the portfolio's CPA goal, the cost Continuum optimizes up to. The two are never the
 *  same number: the goal is never pushed to Google, and the bid setting is never defined as the
 *  goal. Up when the campaign buys well under the goal and loses auctions on rank (never past
 *  the goal); down when it pays well over the goal, or over it at all while Google's target
 *  already sits above the goal. No goal in the account currency ⇒ abstain by name. */
function g07BidTarget(run: Run, google: GoogleSignals, kpiField: keyof WindowMetrics) {
  const now = Date.parse(run.context.now);
  const goal = run.target;
  for (const b of google.bid_targets) {
    if (b.strategy !== 'target_cpa' && b.strategy !== 'maximize_conversions') continue;
    const campaignName = run.name(b.campaign_id, 'campaign');
    const snapshot = run.snapshot(b.campaign_id);
    // A paused campaign has no target worth moving; it is not a finding to abstain on.
    if (snapshot && INACTIVE.has((snapshot.primaryStatus ?? '').toUpperCase())) continue;
    if (b.system_status === 'PAUSED') continue;
    if (b.target_cpa === null || !(b.target_cpa > 0)) {
      if (b.strategy === 'maximize_conversions') {
        run.abstain(
          'G07',
          b.campaign_id,
          `${campaignName} bids Maximize Conversions with no Google Ads target CPA (bid setting); there is no bid target to move.`,
        );
      }
      continue;
    }
    const currency = run.currency;
    if (!currency) {
      run.abstain(
        'G07',
        b.campaign_id,
        `${campaignName}: the account currency is unknown, so its Google Ads target CPA (bid setting) is not priced.`,
      );
      continue;
    }
    if (goal === null) {
      run.abstain(
        'G07',
        b.campaign_id,
        `${campaignName}: no portfolio CPA goal in ${currency}, so its Google Ads target CPA (bid setting) is not moved.`,
      );
      continue;
    }
    if (b.system_status !== 'ENABLED') {
      const learning = (b.system_status ?? '').startsWith('LEARNING');
      run.abstain(
        'G07',
        b.campaign_id,
        learning
          ? `${campaignName}'s bid strategy is ${b.system_status}; its Google Ads target CPA waits until it has learned.`
          : `${campaignName}'s bid strategy status is ${b.system_status ?? 'unknown'}, not ENABLED; its Google Ads target CPA is not touched.`,
      );
      continue;
    }
    const sinceChange =
      b.last_changed_at === null
        ? null
        : Math.floor((now - Date.parse(b.last_changed_at)) / DAY_MS);
    if (sinceChange !== null && sinceChange < G07_COOLDOWN_DAYS) {
      run.abstain(
        'G07',
        b.campaign_id,
        `${campaignName}'s Google Ads target CPA changed ${sinceChange} days ago; Smart Bidding relearns for ${G07_COOLDOWN_DAYS}.`,
      );
      continue;
    }
    if (!snapshot) {
      run.abstain('G07', b.campaign_id, `${campaignName} has no 14-day read this cycle.`);
      continue;
    }
    const d14 = snapshot.windows.d14;
    const conversions = results(d14, kpiField);
    if (conversions <= 0) {
      run.abstain(
        'G07',
        b.campaign_id,
        `${campaignName} has no conversions in 14 days to price against the portfolio CPA goal.`,
      );
      continue;
    }
    const bidSetting = b.target_cpa;
    const actual = d14.spend / conversions;
    const ratio = actual / goal;
    const rankLost = d14.delivery?.rankLostImpressionShare;
    const pays = `${campaignName} pays ${formatMoney(actual, currency, { distinguishFrom: goal })} per conversion over 14 days`;
    // The goal is compared against what the campaign pays and, once there is one, the proposed
    // bid target: it prints with the decimals that tell it from both.
    const goalTextAgainst = (...others: number[]): string =>
      `the portfolio CPA goal of ${formatMoney(goal, currency, { distinguishFrom: [actual, ...others] })}`;
    const goalText = goalTextAgainst();
    const settingText = `Google Ads target CPA (bid setting)`;
    let direction: 'raise' | 'lower' | null = null;
    if (ratio < G07_RAISE_BELOW) {
      if (rankLost === undefined) {
        run.abstain(
          'G07',
          b.campaign_id,
          `${pays}, under ${goalText}, but its rank-lost impression share was not read.`,
        );
        continue;
      }
      if (rankLost > G07_RANK_LOST_ABOVE) direction = 'raise';
    } else if (ratio > G07_LOWER_ABOVE || (actual > goal && bidSetting > goal)) {
      direction = 'lower';
    }
    if (!direction) continue;
    const proposed = cents(bidSetting * (direction === 'raise' ? 1 + G07_STEP : 1 - G07_STEP));
    if (direction === 'raise' && proposed > goal) {
      run.abstain(
        'G07',
        b.campaign_id,
        `${pays}, under ${goalTextAgainst(proposed)}, but raising its ${settingText} 10% to ${formatMoney(proposed, currency, { distinguishFrom: goal })} would put it above ${goalTextAgainst(proposed)}; the bid target is not raised past the goal.`,
      );
      continue;
    }
    const campaign = run.ref('google_ads', 'campaign', 'campaign', b.campaign_id, campaignName);
    run.recommend({
      rule: 'G07',
      platform: 'google_ads',
      entity: campaign,
      subject_key: 'bid_target',
      severity: 'medium',
      platform_card: {
        variant: 'google_bid_target',
        campaign_name: campaignName,
        currency,
        strategy: 'target_cpa',
        current_target: bidSetting,
        actual: cents(actual),
        proposed_target: proposed,
        window_days: 14,
        days_since_last_change: sinceChange,
        portfolio_goal: goal,
      },
      action: {
        kind: 'set_bid_target',
        ref: campaign,
        field: 'target_cpa_micros',
        expected: Math.round(bidSetting * 1_000_000),
        target: Math.round(proposed * 1_000_000),
      },
      reason:
        direction === 'raise'
          ? `${pays}, ${Math.round((1 - ratio) * 100)}% under ${goalTextAgainst(proposed)}, and loses ${pct(rankLost ?? 0)} of impressions to rank. Its ${settingText} is ${formatMoney(bidSetting, currency)}: raise the Google Ads bid target 10% to ${formatMoney(proposed, currency, { distinguishFrom: goal })}, still under the portfolio goal.`
          : `${pays}, over ${goalText} (${ratio.toFixed(2)}×). Its ${settingText} of ${formatMoney(bidSetting, currency)} lets Google pay that: lower the Google Ads bid target 10% to ${formatMoney(proposed, currency)}.`,
    });
  }
}

/** G11: pause a low-Quality-Score keyword that spends over target with no conversions —
 *  never the last active keyword of its ad group. Delegates the judgement to g11LowQualityKeyword. */
function g11Keywords(run: Run, google: GoogleSignals, target: number, currency: string) {
  const active = new Map<string, number>();
  for (const k of google.keywords) {
    if (k.status === 'ENABLED' && !k.negative)
      active.set(k.ad_group_id, (active.get(k.ad_group_id) ?? 0) + 1);
  }
  const window = `the last ${run.windowDays} days`;
  const ordered = google.keywords
    .filter((k) => !k.negative && !isInactiveCampaign(run, k.campaign_id))
    .sort(
      (a, b) => b.totals.spend - a.totals.spend || a.criterion_id.localeCompare(b.criterion_id),
    );
  for (const k of ordered) {
    const verdict = g11LowQualityKeyword(
      {
        id: k.criterion_id,
        text: k.text,
        status: k.status,
        qualityScore: k.quality_score,
        spend: k.totals.spend,
        conversions: k.totals.conversions,
        window,
      },
      target,
      currency,
    );
    if (!verdict.fires || k.quality_score === null) continue;
    const remaining = active.get(k.ad_group_id) ?? 0;
    const adGroupName = run.name(k.ad_group_id, 'ad group');
    if (remaining <= 1) {
      run.abstain(
        'G11',
        k.ad_group_id,
        `"${k.text}" (Quality Score ${k.quality_score}) is the last active keyword of ${adGroupName}; pausing it would stop the ad group.`,
      );
      continue;
    }
    active.set(k.ad_group_id, remaining - 1);
    const campaignName = run.name(k.campaign_id, 'campaign');
    run.recommend({
      rule: 'G11',
      platform: 'google_ads',
      entity: run.ref('google_ads', 'group', 'ad_group', k.ad_group_id, adGroupName),
      subject_key: k.criterion_id,
      severity: 'medium',
      platform_card: {
        variant: 'google_low_quality_keyword',
        campaign_name: campaignName,
        ad_group_name: adGroupName,
        keyword: k.text,
        match_type: k.match_type,
        quality_score: k.quality_score,
        currency,
        spend: cents(k.totals.spend),
        conversions: k.totals.conversions,
        window_days: run.windowDays,
      },
      action: {
        kind: 'set_status',
        ref: run.ref('google_ads', 'ad', 'keyword', `${k.ad_group_id}~${k.criterion_id}`, k.text),
        expected: 'active',
        target: 'paused',
      },
      reason: `${verdict.reason} Pause it; ${adGroupName} keeps ${remaining - 1} active ${remaining - 1 === 1 ? 'keyword' : 'keywords'}.`,
    });
  }
}

const INACTIVE = new Set(['PAUSED', 'REMOVED', 'ENDED', 'NOT_ELIGIBLE']);

/** A campaign read this cycle as paused, removed, ended or not eligible. Its search terms and
 *  keywords are history, not something to change: G05 proposed negatives for a campaign paused
 *  since 10-12 every cycle (G8 F5). Not read is not inactive. */
const isInactiveCampaign = (run: Run, campaignId: string): boolean =>
  INACTIVE.has((run.snapshot(campaignId)?.primaryStatus ?? '').toUpperCase());

/** G18 (coverage half): a serving PMax asset group rated POOR or AVERAGE that Google says is
 *  missing assets → the PMax card, one per campaign. No write: assets are made in Studio. */
function pmaxCoverage(run: Run, google: GoogleSignals) {
  const byCampaign = new Map<string, GoogleSignals['asset_groups']>();
  for (const g of google.asset_groups) {
    if (g.ad_strength !== 'POOR' && g.ad_strength !== 'AVERAGE') continue;
    if (g.missing.length === 0) continue;
    if (INACTIVE.has((g.primary_status ?? '').toUpperCase())) continue;
    const campaign = run.snapshot(g.campaign_id);
    if (!campaign) {
      run.abstain(
        'G18_pmax_coverage',
        g.campaign_id,
        `asset group ${g.name}: its campaign was not read this cycle.`,
      );
      continue;
    }
    if (INACTIVE.has((campaign.primaryStatus ?? '').toUpperCase())) continue;
    byCampaign.set(g.campaign_id, [...(byCampaign.get(g.campaign_id) ?? []), g]);
  }
  for (const [campaignId, groups] of byCampaign) {
    const campaignName = run.name(campaignId, 'campaign');
    run.recommend({
      rule: 'G18_pmax_coverage',
      platform: 'google_ads',
      entity: run.ref('google_ads', 'campaign', 'campaign', campaignId, campaignName),
      subject_key: 'coverage',
      severity: 'low',
      platform_card: {
        variant: 'google_pmax_asset_group',
        campaign_name: campaignName,
        asset_groups: groups.map((g) => ({
          name: g.name,
          ad_strength: g.ad_strength,
          missing: g.missing,
        })),
      },
      action: null,
      reason: groups
        .map(
          (g) =>
            `${g.name} in ${campaignName} has ${g.ad_strength} ad strength and is missing ${g.missing.join(', ')}.`,
        )
        .join(' '),
    });
  }
}

// ---------------------------------------------------------------------------
// G7: the creative and fatigue families on Google.
// ---------------------------------------------------------------------------

/** At most this many assets on one asset group's card: the most wasteful first. */
export const G18_MAX_ASSETS_PER_CARD = 5;

type GoogleAd = NonNullable<GoogleSignals['ads']>[number];
type GooglePmaxAsset = NonNullable<GoogleSignals['pmax_assets']>[number];

const conversionsText = (n: number): string =>
  `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'conversion' : 'conversions'}`;

/** The enabled ads of each ad group of a campaign this cycle read, two or more: one ad competes
 *  with nothing. A group whose campaign is not this portfolio's is left out by name. */
function adGroupsToCompare(run: Run, rule: 'G09' | 'G10', google: GoogleSignals) {
  const byGroup = new Map<string, GoogleAd[]>();
  for (const ad of google.ads ?? []) {
    if (ad.status !== 'ENABLED') continue;
    byGroup.set(ad.ad_group_id, [...(byGroup.get(ad.ad_group_id) ?? []), ad]);
  }
  const groups: { adGroupId: string; ads: GoogleAd[]; siblings: CreativeSibling[] }[] = [];
  for (const [adGroupId, ads] of byGroup) {
    if (ads.length < 2) continue;
    if (!run.snapshot(ads[0]!.campaign_id)) {
      run.abstain(
        rule,
        adGroupId,
        `${ads[0]!.ad_group_name}: its campaign was not read this cycle.`,
      );
      continue;
    }
    const siblings = ads.map((ad) => ({
      id: ad.ad_id,
      label: ad.label,
      spend: ad.totals.spend,
      conversions: ad.totals.conversions,
    }));
    groups.push({ adGroupId, ads, siblings });
  }
  return groups;
}

/** G09 (C1): pause the ad that drags its ad group — zero conversions past the target, or most of
 *  the group's spend at LAGGARD_COST_MULTIPLE × the group's best ad. One per group per cycle, so
 *  the group always keeps an enabled ad. */
function g09AdDrag(run: Run, google: GoogleSignals, target: number, currency: string) {
  for (const { adGroupId, ads, siblings } of adGroupsToCompare(run, 'G09', google)) {
    const drag = draggingSiblings(siblings, g09Thresholds(target))[0];
    if (!drag) continue;
    const ad = ads.find((a) => a.ad_id === drag.sibling.id)!;
    const winner = drag.winner;
    const remaining = ads.length - 1;
    const share = Math.round(drag.spendShare * 100);
    const what =
      drag.costPerResult === null
        ? `spent ${formatMoney(ad.totals.spend, currency)} (${share}% of the group's spend) with no conversion in the last ${run.windowDays} days`
        : `takes ${share}% of the group's spend at ${formatMoney(drag.costPerResult, currency)} per conversion, ${(drag.costPerResult / winner.costPerResult).toFixed(2)}× its best ad`;
    run.recommend({
      rule: 'G09',
      platform: 'google_ads',
      entity: run.ref('google_ads', 'group', 'ad_group', adGroupId, ad.ad_group_name),
      subject_key: ad.ad_id,
      severity: 'medium',
      platform_card: {
        variant: 'google_ad_drag',
        campaign_name: run.name(ad.campaign_id, 'campaign'),
        ad_group_name: ad.ad_group_name,
        ad_label: ad.label,
        currency,
        window_days: run.windowDays,
        spend: cents(ad.totals.spend),
        spend_share: drag.spendShare,
        conversions: ad.totals.conversions,
        cost_per_result: drag.costPerResult === null ? null : cents(drag.costPerResult),
        winner: { label: winner.label, cost_per_result: cents(winner.costPerResult) },
        ads_remaining: remaining,
      },
      action: {
        kind: 'set_status',
        ref: run.ref('google_ads', 'ad', 'ad', `${adGroupId}~${ad.ad_id}`, ad.label),
        expected: 'active',
        target: 'paused',
      },
      reason: `"${ad.label}" in ${ad.ad_group_name} ${what}, while "${winner.label}" converts at ${formatMoney(winner.costPerResult, currency)}. Pause it; the group keeps ${plural(remaining, 'enabled ad', 'enabled ads')}.`,
    });
  }
}

/** G10 (C2): the winner of an ad group worth a variation, with the texts Google rates BEST in
 *  it. No write: the new ad is written in Google Ads. */
function g10AdWinner(run: Run, google: GoogleSignals, currency: string) {
  for (const { adGroupId, ads, siblings } of adGroupsToCompare(run, 'G10', google)) {
    const found = winnerToVary(siblings);
    if (!found) continue;
    const ad = ads.find((a) => a.ad_id === found.winner.id)!;
    const best = ad.best_assets;
    run.recommend({
      rule: 'G10',
      platform: 'google_ads',
      entity: run.ref('google_ads', 'group', 'ad_group', adGroupId, ad.ad_group_name),
      subject_key: ad.ad_id,
      severity: 'low',
      platform_card: {
        variant: 'google_ad_winner',
        campaign_name: run.name(ad.campaign_id, 'campaign'),
        ad_group_name: ad.ad_group_name,
        currency,
        window_days: run.windowDays,
        winner: {
          label: found.winner.label,
          cost_per_result: cents(found.winner.costPerResult),
          conversions: found.winner.conversions,
        },
        comparator: {
          label: found.comparator.label,
          cost_per_result: cents(found.comparator.costPerResult),
        },
        best_assets: best,
      },
      action: null,
      reason: `"${found.winner.label}" is the best ad in ${ad.ad_group_name}: ${formatMoney(found.winner.costPerResult, currency)} per conversion on ${conversionsText(found.winner.conversions)}, against ${formatMoney(found.comparator.costPerResult, currency)} for "${found.comparator.label}". Write a new ad from it in Google Ads${best.length > 0 ? `, keeping what Google rates best: ${best.map((text) => `"${text}"`).join(', ')}` : ''}.`,
    });
  }
}

const assetLabel = (a: GooglePmaxAsset): string =>
  a.text ?? `${a.field_type.toLowerCase().replace(/_/g, ' ')} ${a.asset_id}`;

/** G18_pmax_assets: in each PMax asset group, the assets that drag their field type, measured
 *  against the best asset of the same type (Google's per-asset metrics). One card per asset
 *  group; no write — the replacement is made and reviewed before the old asset goes. */
function g18PmaxAssets(run: Run, google: GoogleSignals, target: number, currency: string) {
  const byKind = new Map<string, GooglePmaxAsset[]>();
  for (const a of google.pmax_assets ?? []) {
    const key = `${a.asset_group_id}~${a.field_type}`;
    byKind.set(key, [...(byKind.get(key) ?? []), a]);
  }
  const byGroup = new Map<
    string,
    { asset: GooglePmaxAsset; verdict: ReturnType<typeof draggingSiblings>[number] }[]
  >();
  for (const assets of byKind.values()) {
    if (assets.length < 2) continue;
    const siblings = assets.map((a) => ({
      id: a.asset_id,
      label: assetLabel(a),
      spend: a.totals.spend,
      conversions: a.totals.conversions,
    }));
    for (const verdict of draggingSiblings(siblings, pmaxAssetThresholds(target))) {
      const asset = assets.find((a) => a.asset_id === verdict.sibling.id)!;
      byGroup.set(asset.asset_group_id, [
        ...(byGroup.get(asset.asset_group_id) ?? []),
        { asset, verdict },
      ]);
    }
  }
  for (const [assetGroupId, found] of byGroup) {
    const first = found[0]!.asset;
    if (!run.snapshot(first.campaign_id)) {
      run.abstain(
        'G18_pmax_assets',
        assetGroupId,
        `${first.asset_group_name}: its campaign was not read this cycle.`,
      );
      continue;
    }
    const wasted = (x: (typeof found)[number]) =>
      x.verdict.costPerResult === null
        ? x.asset.totals.spend
        : x.asset.totals.spend - x.asset.totals.conversions * x.verdict.winner.costPerResult;
    const shown = [...found]
      .sort((a, b) => wasted(b) - wasted(a) || a.asset.asset_id.localeCompare(b.asset.asset_id))
      .slice(0, G18_MAX_ASSETS_PER_CARD);
    const campaignName = run.name(first.campaign_id, 'campaign');
    // A PMax campaign's one asset group often carries the campaign's own name.
    const where =
      first.asset_group_name === campaignName
        ? campaignName
        : `${first.asset_group_name} (${campaignName})`;
    const said = shown.map(({ asset, verdict }) => {
      const kind = asset.field_type.toLowerCase().replace(/_/g, ' ');
      const cost =
        verdict.costPerResult === null
          ? `spent ${formatMoney(asset.totals.spend, currency)} with no conversion`
          : `costs ${formatMoney(verdict.costPerResult, currency)} per conversion`;
      return `the ${kind} "${verdict.sibling.label}" ${cost}, while "${verdict.winner.label}" converts at ${formatMoney(verdict.winner.costPerResult, currency)}`;
    });
    run.recommend({
      rule: 'G18_pmax_assets',
      platform: 'google_ads',
      entity: run.ref('google_ads', 'group', 'asset_group', assetGroupId, first.asset_group_name),
      subject_key: 'assets',
      severity: 'medium',
      platform_card: {
        variant: 'google_pmax_assets',
        campaign_name: campaignName,
        asset_group_name: first.asset_group_name,
        currency,
        window_days: run.windowDays,
        assets: shown.map(({ asset, verdict }) => ({
          field_type: asset.field_type,
          label: verdict.sibling.label,
          spend: cents(asset.totals.spend),
          conversions: asset.totals.conversions,
          cost_per_result: verdict.costPerResult === null ? null : cents(verdict.costPerResult),
          best_of_kind: {
            label: verdict.winner.label,
            cost_per_result: cents(verdict.winner.costPerResult),
          },
        })),
      },
      action: null,
      reason: `In ${where}, over the last ${run.windowDays} days: ${said.join('; ')}. Make replacements first, then remove these in Google Ads.`,
    });
  }
}

/** G23 (F2): a campaign pushed to an audience that sees it too often while each conversion
 *  gets dearer. Read-only: the audience is widened or rotated in Google Ads. */
function g23AudienceSaturation(run: Run, google: GoogleSignals, currency: string) {
  for (const a of google.audience ?? []) {
    const campaign = run.snapshot(a.campaign_id);
    if (!campaign) continue;
    const verdict = g23Saturation(a, campaign.windows, run.context.kpiField);
    if (!verdict.fires) continue;
    const name = run.name(a.campaign_id, 'campaign');
    const rise = Math.round((verdict.costPerResultNow / verdict.costPerResultBefore - 1) * 100);
    run.recommend({
      rule: 'G23',
      platform: 'google_ads',
      entity: run.ref('google_ads', 'campaign', 'campaign', a.campaign_id, name),
      subject_key: 'audience',
      severity: 'medium',
      platform_card: {
        variant: 'google_audience_saturation',
        campaign_name: name,
        channel_type: a.channel_type,
        frequency: Math.round(verdict.frequency * 10) / 10,
        frequency_cap: G23_FREQUENCY_CAP,
        unique_users: a.unique_users_7d,
        currency,
        cost_per_result_now: cents(verdict.costPerResultNow),
        cost_per_result_before: cents(verdict.costPerResultBefore),
      },
      action: null,
      reason: `The same people saw ${name} ${verdict.frequency.toFixed(1)} times in the last 7 days (the cap is ${G23_FREQUENCY_CAP}), and a result now costs ${formatMoney(verdict.costPerResultNow, currency)} over 3 days against ${formatMoney(verdict.costPerResultBefore, currency)} over 14 (+${rise}%). The audience is saturated: widen or rotate it in Google Ads.`,
    });
  }
}

type GoogleDelivery = NonNullable<GoogleSignals['delivery']>[number];

/** A campaign that is not meant to serve: ended, paused, removed, not started, or with no
 *  budget of its own. Its silence is not a delivery problem. */
const SHOULD_NOT_SERVE = new Set(['ENDED', 'PAUSED', 'REMOVED', 'PENDING']);
const shouldServe = (c: GoogleDelivery): boolean =>
  !SHOULD_NOT_SERVE.has(c.primary_status.toUpperCase()) && (c.budget_per_day ?? 0) > 0;
const isDarkCampaign = (c: GoogleDelivery): boolean =>
  shouldServe(c) && c.dark_days >= DARK_DAYS_THRESHOLD;
const disapproved = (c: GoogleDelivery) =>
  c.disapproved_ads.filter((ad) => ad.approval_status === 'DISAPPROVED');

/** Google's own words for why a campaign is not serving: its primary-status reasons, its
 *  serving status when that is not SERVING (Easy Fit 2026 reads ELIGIBLE with no reason and
 *  SUSPENDED here), and the policy topics of the ads Google refused. */
function googleReasons(c: GoogleDelivery): string[] {
  const serving = (c.serving_status ?? '').toUpperCase();
  const refused = disapproved(c);
  const reasons = [
    ...(serving && serving !== 'SERVING' ? [`SERVING_STATUS_${serving}`] : []),
    ...c.primary_status_reasons,
    ...refused.flatMap((ad) => ad.topics),
  ];
  if (refused.length > 0 && reasons.length === 0) reasons.push('HAS_ADS_DISAPPROVED');
  return [...new Set(reasons)];
}

/** The objective's word for one result, for the cards that print a cost per result. */
const RESULT_WORDS: Partial<Record<keyof WindowMetrics, string>> = {
  leads: 'leads',
  purchases: 'purchases',
  signups: 'sign-ups',
  conversations: 'conversations',
  appInstalls: 'installs',
  landingPageViews: 'landing page views',
  addToCarts: 'add to carts',
  clicks: 'clicks',
  impressions: 'impressions',
};

/** G03 (escenario 07): a Search campaign losing impressions to budget. The card says what is
 *  lost and what a result costs; with a proposal it carries the set_budget a person approves,
 *  in the budget's minor units, read from the very budget the snapshot holds. A shared budget
 *  is never changed in place, a campaign that loses nothing to budget is not news, and a dark
 *  or Google-suspended one shows no ad: more budget for it is the wrong advice. */
function g03BudgetLimited(run: Run, google: GoogleSignals) {
  const { objective, kpiField, cpaTarget } = run.context;
  const campaigns = run.context.snapshots.filter(
    (s, index, all) =>
      s.platform === 'google_ads' &&
      s.level === 'campaign' &&
      s.accountId === run.signals.account_id &&
      !INACTIVE.has((s.primaryStatus ?? '').toUpperCase()) &&
      all.findIndex((other) => other.id === s.id) === index,
  );
  if (campaigns.length === 0) return;
  if (!objective) {
    if (campaigns.some(isBudgetConstrained))
      run.abstain('G03', null, 'no portfolio objective; the budget step is unknown.');
    return;
  }
  const resultLabel = RESULT_WORDS[kpiField] ?? 'results';
  // Dark for days, or suspended by Google now (Easy Fit 2026: ELIGIBLE, serving SUSPENDED, two
  // days without an ad when G03 proposed 320 → 400, G8 F8): either way it shows no ad.
  const blocked = new Map<string, string>();
  for (const c of google.delivery ?? []) {
    if (isDarkCampaign(c)) blocked.set(c.campaign_id, `has shown no ad for ${c.dark_days} days`);
    else if ((c.serving_status ?? '').toUpperCase() === 'SUSPENDED')
      blocked.set(c.campaign_id, 'is suspended by Google (serving status SUSPENDED)');
  }
  for (const s of campaigns) {
    const why = blocked.get(s.id);
    if (why !== undefined) {
      if (isBudgetConstrained(s))
        run.abstain('G03', s.id, `${s.name ?? s.id} ${why}; its delivery comes first.`);
      continue;
    }
    const verdict = g03BudgetLimitedRaise(s, { objective, kpiField, cpaTarget, historyDays: null });
    const card = googleBudgetLimitedCard(s, verdict, { kpiField, resultLabel, daysLimited: null });
    if (!card) {
      if (verdict.outcome === 'refusal' && verdict.refusal === 'held')
        run.abstain('G03', s.id, verdict.reason);
      continue;
    }
    const campaignName = s.name ?? s.id;
    const ref = run.ref('google_ads', 'campaign', 'campaign', s.id, campaignName);
    run.recommend({
      rule: 'G03',
      platform: 'google_ads',
      entity: ref,
      subject_key: 'budget',
      severity: verdict.outcome === 'proposal' ? 'medium' : 'low',
      platform_card: card,
      action:
        verdict.outcome === 'proposal'
          ? {
              kind: 'set_budget',
              ref,
              budget: s.budget,
              expectedMinor: s.budget.minor,
              targetMinor: Math.round(verdict.to * currencyMinorOffset(s.budget.currency)),
            }
          : null,
      reason: verdict.reason,
    });
  }
}

/** G12: a campaign that should serve and does not — dark three days or more with budget, or
 *  carrying ads Google refused. When EVERY campaign that should serve is dark at once the
 *  cause is the account (billing, payment, suspension), so it is ONE account card, not one
 *  per campaign saying the same thing (escenario 20). Read-only: the fix is in Google Ads. */
function g12Delivery(run: Run, google: GoogleSignals) {
  const delivery = google.delivery ?? [];
  const d2 = run.context.d2EntityIds ?? new Set<string>();
  const currency = run.currency;
  const serving = delivery.filter(shouldServe);
  const dark = serving.filter(isDarkCampaign);
  if (serving.length > 1 && dark.length === serving.length) {
    if (dark.every((c) => d2.has(c.campaign_id))) {
      run.abstain(
        'G12',
        null,
        'every dark campaign already carries the D2 card; no account card on top.',
      );
      return;
    }
    const reasons = [...new Set(dark.flatMap(googleReasons))];
    if (reasons.length === 0) {
      run.abstain(
        'G12',
        null,
        `all ${dark.length} campaigns are dark and Google names no reason; nothing to quote.`,
      );
      return;
    }
    const budget = cents(dark.reduce((sum, c) => sum + (c.budget_per_day ?? 0), 0));
    const darkDays = Math.min(...dark.map((c) => c.dark_days));
    const longest = Math.max(...dark.map((c) => c.dark_days));
    const anchor = [...dark].sort(
      (a, b) =>
        (b.budget_per_day ?? 0) - (a.budget_per_day ?? 0) ||
        a.campaign_id.localeCompare(b.campaign_id),
    )[0]!;
    const refused = dark.reduce((n, c) => n + disapproved(c).length, 0);
    const budgetText = currency
      ? `${formatMoney(budget, currency)}/day`
      : `${cents(budget).toFixed(2)}/day`;
    run.recommend({
      rule: 'G12',
      platform: 'google_ads',
      entity: run.ref(
        'google_ads',
        'campaign',
        'campaign',
        anchor.campaign_id,
        anchor.campaign_name,
      ),
      subject_key: 'delivery_account',
      severity: 'high',
      platform_card: {
        variant: 'google_delivery_issue',
        campaign_name: anchor.campaign_name,
        reasons,
        dark_days: darkDays,
        currency,
        budget_per_day: budget,
        disapproved_ads: refused,
        account_wide: true,
      },
      action: null,
      reason: `This account has ${dark.length} campaigns that should be serving, with ${budgetText} of budget, and none showed an ad in the last ${plural(darkDays, 'day', 'days')}${longest > darkDays ? ` (the oldest for ${longest})` : ''}. Google says: ${reasons.join(', ')}. One cause for the whole account — check billing and the account's status in Google Ads.`,
    });
    return;
  }
  for (const c of delivery) {
    const refused = disapproved(c);
    const isDark = isDarkCampaign(c);
    if (!isDark && refused.length === 0) continue;
    if (d2.has(c.campaign_id)) {
      run.abstain(
        'G12',
        c.campaign_id,
        `${c.campaign_name} already carries the D2 card; no second delivery card.`,
      );
      continue;
    }
    const reasons = googleReasons(c);
    if (reasons.length === 0) {
      run.abstain(
        'G12',
        c.campaign_id,
        `${c.campaign_name} has shown no ad for ${plural(c.dark_days, 'day', 'days')} with budget, and Google names no reason; nothing to quote.`,
      );
      continue;
    }
    const what = isDark
      ? `is ${c.primary_status} with ${currency ? formatMoney(c.budget_per_day ?? 0, currency) : cents(c.budget_per_day ?? 0).toFixed(2)}/day of budget and showed no ad for ${plural(c.dark_days, 'day', 'days')}`
      : `has ${plural(refused.length, 'ad', 'ads')} Google disapproved`;
    run.recommend({
      rule: 'G12',
      platform: 'google_ads',
      entity: run.ref('google_ads', 'campaign', 'campaign', c.campaign_id, c.campaign_name),
      subject_key: 'delivery',
      severity: isDark ? 'high' : 'medium',
      platform_card: {
        variant: 'google_delivery_issue',
        campaign_name: c.campaign_name,
        reasons,
        dark_days: c.dark_days,
        currency,
        budget_per_day: c.budget_per_day,
        disapproved_ads: refused.length,
        account_wide: false,
      },
      action: null,
      reason: `${c.campaign_name} ${what}. Google says: ${reasons.join(', ')}. Fix it in Google Ads; nothing here changes it.`,
    });
  }
}

// ---------------------------------------------------------------------------
// TikTok
// ---------------------------------------------------------------------------

/** Linear-interpolated quantile, q in 0..1. */
function quantile(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

function sum(days: readonly CreativeDay[], pick: (d: CreativeDay) => number): number {
  return days.reduce((acc, d) => acc + pick(d), 0);
}

function byDate(creative: TikTokCreative): CreativeDay[] {
  return [...creative.days].sort((a, b) => a.date.localeCompare(b.date));
}

/** T1: a creative whose 2-second hold is under the portfolio's lower quartile, once it has
 *  2,000 impressions — from day one, before its CPA means anything. */
function t1HookRetention(run: Run, tiktok: TikTokSignals) {
  const judged = tiktok.creatives
    .map((c) => {
      const impressions = sum(c.days, (d) => d.impressions);
      return {
        c,
        impressions,
        hold: impressions > 0 ? sum(c.days, (d) => d.video_watched_2s) / impressions : 0,
      };
    })
    .filter((x) => x.impressions >= T1_MIN_IMPRESSIONS);
  if (judged.length < T1_MIN_CREATIVES) {
    if (tiktok.creatives.length > 0) {
      run.abstain(
        'T1',
        null,
        `${plural(judged.length, 'creative has', 'creatives have')} ${T1_MIN_IMPRESSIONS.toLocaleString('en-US')} impressions or more; a lower quartile needs ${T1_MIN_CREATIVES}.`,
      );
    }
    return;
  }
  const q1 = quantile(
    judged.map((x) => x.hold).sort((a, b) => a - b),
    0.25,
  );
  for (const { c, impressions, hold } of judged) {
    if (hold >= q1) continue;
    const adGroupName = run.name(c.ad_group_id, 'ad group');
    const daysLive = c.days.filter((d) => d.impressions > 0).length;
    run.recommend({
      rule: 'T1',
      platform: 'tiktok_ads',
      entity: run.ref('tiktok_ads', 'group', 'ad_group', c.ad_group_id, adGroupName),
      subject_key: c.ad_id,
      severity: 'medium',
      platform_card: {
        variant: 'tiktok_hook_retention',
        ad_group_name: adGroupName,
        creative_name: c.name,
        hold_2s: hold,
        portfolio_hold_2s: q1,
        impressions,
        days_live: daysLive,
      },
      action: null,
      reason: `Only ${pct(hold)} of the ${impressions.toLocaleString('en-US')} impressions of "${c.name}" were watched past 2 seconds, under the portfolio's lower quartile of ${pct(q1)}. Change its first 2 seconds.`,
    });
  }
}

function ctr(days: readonly CreativeDay[]): number {
  const impressions = sum(days, (d) => d.impressions);
  return impressions > 0 ? sum(days, (d) => d.clicks) / impressions : 0;
}

/** Daily reach, read as impressions over that day's frequency. Null when any day lacks it. */
function reach(days: readonly CreativeDay[]): number | null {
  let total = 0;
  for (const d of days) {
    if (d.impressions === 0) continue;
    if (d.frequency === null || d.frequency <= 0) return null;
    total += d.impressions / d.frequency;
  }
  return total;
}

/** T3: TikTok's own three fatigue signals at once — CPA over target, spend under its 7-day
 *  average three days running, and reach in the last 7 days growing under 5%. */
function t3Fatigue(run: Run, tiktok: TikTokSignals, target: number | null) {
  for (const c of tiktok.creatives) {
    const days = byDate(c);
    const delivered = days.filter((d) => d.impressions > 0).length;
    if (days.length < 14 || delivered < 14) {
      run.abstain(
        'T3',
        c.ad_id,
        `"${c.name}" has ${plural(delivered, 'day', 'days')} of delivery; fatigue compares two full 7-day halves.`,
      );
      continue;
    }
    if (target === null) {
      run.abstain(
        'T3',
        c.ad_id,
        `"${c.name}": no target cost per result in the account currency to judge its CPA against.`,
      );
      continue;
    }
    const last7 = days.slice(-7);
    const prev7 = days.slice(-14, -7);
    const spend7 = sum(last7, (d) => d.spend);
    const results7 = sum(last7, (d) => d.results);
    const cpaOver = results7 > 0 ? spend7 / results7 > target : spend7 > target;
    const average = spend7 / 7;
    const falling = last7.slice(-T3_FALLING_DAYS).every((d) => d.spend < average);
    const reachNow = reach(last7);
    const reachBefore = reach(prev7);
    if (reachNow === null || reachBefore === null || reachBefore === 0) {
      run.abstain(
        'T3',
        c.ad_id,
        `"${c.name}": frequency was not read every day, so its reach is unknown.`,
      );
      continue;
    }
    const growth = reachNow / reachBefore - 1;
    if (!(cpaOver && falling && growth < T3_REACH_GROWTH_BELOW)) continue;
    const adGroupName = run.name(c.ad_group_id, 'ad group');
    const ctrNow = ctr(last7);
    const ctrBefore = ctr(prev7);
    const replacement = tiktok.creatives
      .filter((o) => o.ad_group_id === c.ad_group_id && o.ad_id !== c.ad_id)
      .map((o) => ({ name: o.name, ctr: ctr(byDate(o).slice(-7)) }))
      .filter((o) => o.ctr > ctrNow)
      .sort((a, b) => b.ctr - a.ctr)[0];
    const frequency = last7[last7.length - 1]!.frequency;
    const currency = run.currency!;
    run.recommend({
      rule: 'T3',
      platform: 'tiktok_ads',
      entity: run.ref('tiktok_ads', 'group', 'ad_group', c.ad_group_id, adGroupName),
      subject_key: c.ad_id,
      severity: 'medium',
      platform_card: {
        variant: 'tiktok_creative_fatigue',
        ad_group_name: adGroupName,
        creative_name: c.name,
        ctr_now: ctrNow,
        ctr_before: ctrBefore,
        days: 7,
        frequency: frequency && frequency > 0 ? frequency : null,
        replacement: replacement ?? null,
      },
      action: null,
      reason: `"${c.name}" is tiring: ${results7 > 0 ? `${formatMoney(spend7 / results7, currency, { distinguishFrom: target })} per result` : `${formatMoney(spend7, currency, { distinguishFrom: target })} with no results`} in 7 days against a ${formatMoney(target, currency, { distinguishFrom: results7 > 0 ? spend7 / results7 : spend7 })} target, spend under its ${formatMoney(average, currency)} daily average ${T3_FALLING_DAYS} days running, and ${growth < 0 ? `reach down ${pct(-growth)}` : `reach up only ${pct(growth)}`} on the week before. Add 1–2 new creatives to ${adGroupName}; do not open another ad group.`,
    });
  }
}

const ACTIVE_TIKTOK = (s: MultiPlatformSnapshot): boolean =>
  !INACTIVE.has((s.primaryStatus ?? '').toUpperCase()) &&
  !['DISABLE', 'DELETE', 'ADGROUP_STATUS_DISABLE'].includes((s.primaryStatus ?? '').toUpperCase());

/** T5: a fresh organic post in the brand's top decile of views, not yet promoted → a Spark
 *  Ad candidate in the account's best active ad group. */
function t5SparkCandidate(run: Run, tiktok: TikTokSignals, kpiField: keyof WindowMetrics) {
  const now = Date.parse(run.context.now);
  // The account as it stood at `now`: a post published later is not part of its history.
  const posts = tiktok.organic_posts.filter((p) => Date.parse(p.posted_at) <= now);
  if (posts.length === 0) return;
  if (posts.length < T5_MIN_POSTS) {
    run.abstain(
      'T5',
      null,
      `${posts.length} organic posts read; a 90th percentile needs ${T5_MIN_POSTS}.`,
    );
    return;
  }
  const views = posts.map((p) => p.views).sort((a, b) => a - b);
  const p90 = quantile(views, T5_PERCENTILE / 100);
  const sparked = new Set(
    tiktok.creatives.map((c) => c.tiktok_item_id).filter((id): id is string => !!id),
  );
  const fresh = posts.filter(
    (p) =>
      now - Date.parse(p.posted_at) <= T5_FRESH_HOURS * 3_600_000 && now >= Date.parse(p.posted_at),
  );
  if (fresh.length === 0) {
    run.abstain('T5', null, `no organic post was published in the last ${T5_FRESH_HOURS} hours.`);
    return;
  }
  const groups = run.context.snapshots
    // A Spark Ad is a new ad in a manual ad group; Smart+ ad groups take no hand-added ads.
    .filter(
      (s) =>
        s.platform === 'tiktok_ads' &&
        s.level === 'group' &&
        s.automation === 'manual' &&
        ACTIVE_TIKTOK(s),
    )
    .map((s) => ({ s, results: results(s.windows.d7, kpiField), spend: s.windows.d7.spend }))
    .sort((a, b) => {
      if (b.results !== a.results) return b.results - a.results;
      const ca = a.results > 0 ? a.spend / a.results : Number.POSITIVE_INFINITY;
      const cb = b.results > 0 ? b.spend / b.results : Number.POSITIVE_INFINITY;
      return ca - cb || a.s.id.localeCompare(b.s.id);
    });
  const home = groups[0]?.s;
  for (const p of fresh) {
    if (p.views < p90) continue;
    if (p.promoted || sparked.has(p.post_id)) continue;
    if (!home) {
      run.abstain(
        'T5',
        p.post_id,
        `"${p.caption.slice(0, 40)}" is in the top decile, but the account has no active TikTok ad group to run a Spark Ad in.`,
      );
      continue;
    }
    if (p.engagement_rate === null) {
      run.abstain('T5', p.post_id, `post ${p.post_id}: its engagement rate was not read.`);
      continue;
    }
    const percentile = Math.round((views.filter((v) => v <= p.views).length / views.length) * 100);
    const homeName = home.name ?? `ad group ${home.id}`;
    const caption = p.caption.trim() || `post ${p.post_id}`;
    run.recommend({
      rule: 'T5',
      platform: 'tiktok_ads',
      entity: run.ref('tiktok_ads', 'group', 'ad_group', home.id, homeName),
      subject_key: p.post_id,
      severity: 'low',
      platform_card: {
        variant: 'tiktok_spark_candidate',
        post_caption: caption,
        post_id: p.post_id,
        views: p.views,
        engagement_rate: p.engagement_rate,
        account_percentile: percentile,
        target_ad_group_name: homeName,
      },
      action: null,
      // The caption stays on the card: it is the client's own copy and may carry any symbol.
      reason: `Organic post ${p.post_id} reached ${p.views.toLocaleString('en-US')} views within ${T5_FRESH_HOURS} hours, at or above the account's 90th percentile (${Math.round(p90).toLocaleString('en-US')}). Ask the creator for its Spark code and run it in ${homeName}.`,
    });
  }
}

/** The multiple of CPA TikTok documents for a goal (tiktok.html §2.12): 20× for installs,
 *  10× for a deep conversion, 50× for goals without one. Null ⇒ unknown goal, no guess. */
export function tiktokLearningMultiple(goal: string | null): 10 | 20 | 50 | null {
  if (!goal) return null;
  const g = goal.toUpperCase();
  if (['INSTALL', 'APP_INSTALL'].includes(g)) return 20;
  if (
    ['CONVERT', 'CONVERSION', 'VALUE', 'IN_APP_EVENT', 'LEAD_GENERATION', 'PRODUCT_SALES'].includes(
      g,
    )
  )
    return 10;
  if (
    [
      'CLICK',
      'TRAFFIC',
      'REACH',
      'SHOW',
      'VIDEO_VIEW',
      'ENGAGEMENT',
      'FOLLOWERS',
      'PROFILE_VIEWS',
      'CONVERSATION',
      'LANDING_PAGE_VIEW',
    ].includes(g)
  )
    return 50;
  return null;
}

/** T7: an ad group budget under what TikTok's learning needs — the goal's multiple of the
 *  target CPA, and always the 20 USD × verification-ratio floor. */
function t7BudgetBelowLearning(
  run: Run,
  tiktok: TikTokSignals,
  target: number | null,
  kpiField: keyof WindowMetrics,
) {
  const currency = run.currency;
  for (const g of tiktok.ad_groups) {
    const snapshot = run.snapshot(g.ad_group_id);
    const name = run.name(g.ad_group_id, 'ad group');
    if (!snapshot) {
      run.abstain('T7', g.ad_group_id, `${name}: its budget was not read this cycle.`);
      continue;
    }
    if (!ACTIVE_TIKTOK(snapshot)) continue;
    if (snapshot.budget.minor === 0 || snapshot.budget.ownerRef.id !== g.ad_group_id) continue;
    if (!currency || snapshot.budget.currency !== currency) {
      run.abstain(
        'T7',
        g.ad_group_id,
        `${name}: the budget currency does not match the account's.`,
      );
      continue;
    }
    const budget = snapshot.budget.minor / currencyMinorOffset(currency);
    const multiple = tiktokLearningMultiple(g.optimization_goal);
    const ratio = TIKTOK_BUDGET_VERIFICATION_RATIO[currency];
    const floor = ratio === undefined ? null : TIKTOK_MIN_ADGROUP_BUDGET_USD * ratio;
    if (floor === null)
      run.abstain(
        'T7',
        g.ad_group_id,
        `${name}: TikTok's minimum for ${currency} is not in the verification table; the floor is not checked.`,
      );
    if (multiple === null)
      run.abstain(
        'T7',
        g.ad_group_id,
        `${name}: optimization goal ${g.optimization_goal ?? 'unknown'} has no documented learning multiple.`,
      );
    if (multiple !== null && target === null)
      run.abstain(
        'T7',
        g.ad_group_id,
        `${name}: no target cost per result in ${currency}, so the learning multiple is not priced.`,
      );
    const byMultiple = multiple !== null && target !== null ? multiple * target : null;
    const required = Math.max(byMultiple ?? 0, floor ?? 0);
    if (required === 0 || budget >= required) continue;
    const d7 = snapshot.windows.d7;
    const resultsSoFar = results(d7, kpiField);
    const cost = resultsSoFar > 0 ? cents(d7.spend / resultsSoFar) : null;
    const why =
      byMultiple !== null && budget < byMultiple
        ? `${multiple}× the ${formatMoney(target!, currency)} target for ${g.optimization_goal}`
        : `TikTok's ${formatMoney(floor!, currency, { distinguishFrom: budget })} minimum (${formatMoney(TIKTOK_MIN_ADGROUP_BUDGET_USD, 'USD')} × ${ratio})`;
    run.recommend({
      rule: 'T7',
      platform: 'tiktok_ads',
      entity: run.ref('tiktok_ads', 'group', 'ad_group', g.ad_group_id, name),
      subject_key: 'budget',
      severity: 'medium',
      platform_card: {
        variant: 'tiktok_budget_below_learning',
        ad_group_name: name,
        currency,
        budget_per_day: cents(budget),
        cost_per_result: cost && cost > 0 ? cost : null,
        required_multiple: multiple ?? 1,
        required_budget_per_day: cents(required),
        results_so_far: resultsSoFar,
      },
      action: null,
      reason: `${name} has ${formatMoney(budget, currency, { distinguishFrom: required })}/day, under ${why}: ${formatMoney(required, currency, { distinguishFrom: budget })}/day. It will not leave learning on this budget — raise it or consolidate ad groups.`,
    });
  }
}

/** T12: an ad group counting results in a different window from Meta's 7-day click / 1-day
 *  view cannot be compared with Meta — a card, and G27 leaves it out. */
function t12AttributionWindow(run: Run, tiktok: TikTokSignals) {
  if (!run.context.crossPlatformComparison) return;
  for (const g of tiktok.ad_groups) {
    const name = run.name(g.ad_group_id, 'ad group');
    if (g.click_attribution_window_days === null || g.view_attribution_window_days === null) {
      run.abstain('T12', g.ad_group_id, `${name}: its attribution window was not read.`);
      continue;
    }
    if (
      g.click_attribution_window_days === META_ATTRIBUTION.click_window_days &&
      g.view_attribution_window_days === META_ATTRIBUTION.view_window_days
    ) {
      continue;
    }
    run.comparisonExclusions.push({
      platform: 'tiktok_ads',
      entityId: g.ad_group_id,
      reason: 'attribution_mismatch',
    });
    run.recommend({
      rule: 'T12',
      platform: 'tiktok_ads',
      entity: run.ref('tiktok_ads', 'group', 'ad_group', g.ad_group_id, name),
      subject_key: 'attribution',
      severity: 'low',
      platform_card: {
        variant: 'tiktok_attribution_window',
        ad_group_name: name,
        click_window_days: g.click_attribution_window_days,
        view_window_days: g.view_attribution_window_days,
        compared_to: { platform: 'meta', ...META_ATTRIBUTION },
      },
      action: null,
      reason: `${name} counts results up to ${plural(g.click_attribution_window_days, 'day', 'days')} after a click and ${plural(g.view_attribution_window_days, 'day', 'days')} after a view; Meta counts 7 and 1. It is left out of the comparison between platforms until the windows match.`,
    });
  }
}

/** Statuses that mean the advertiser stopped the ad group, not TikTok. */
const TIKTOK_STOPPED_BY_US = /DISABLE|DELETE|CAMPAIGN_DISABLE|TIME_DONE|NOT_START/;

/** T11 (tiktok.html §4 rules 07 and 20): an ad group TikTok is not delivering — dark three
 *  days or more with budget — or one whose ads TikTok's review refused, with TikTok's status
 *  and its review reasons and suggestion quoted. Read-only. */
function t11Delivery(run: Run, tiktok: TikTokSignals) {
  const d2 = run.context.d2EntityIds ?? new Set<string>();
  for (const g of tiktok.delivery ?? []) {
    const status = g.secondary_status ?? '';
    if (TIKTOK_STOPPED_BY_US.test(status)) continue;
    const isDark = (g.budget_per_day ?? 0) > 0 && g.dark_days >= DARK_DAYS_THRESHOLD;
    if (!isDark && g.rejected_ads.length === 0) continue;
    if (d2.has(g.ad_group_id)) {
      run.abstain(
        'T11',
        g.ad_group_id,
        `${g.ad_group_name} already carries the D2 card; no second delivery card.`,
      );
      continue;
    }
    const review = g.rejected_ads
      .map(
        (ad) =>
          `${ad.reasons.join('; ') || 'no reason given'}${ad.suggestion ? ` (TikTok suggests: ${ad.suggestion})` : ''}`,
      )
      .join(' ');
    const what = isDark
      ? `showed no ad for ${plural(g.dark_days, 'day', 'days')} with budget${status ? `; TikTok reports ${status}` : ''}`
      : `is delivering, but TikTok's review refused ${plural(g.rejected_ads.length, 'ad', 'ads')}`;
    run.recommend({
      rule: 'T11',
      platform: 'tiktok_ads',
      entity: run.ref('tiktok_ads', 'group', 'ad_group', g.ad_group_id, g.ad_group_name),
      subject_key: 'delivery',
      severity: isDark ? 'high' : 'medium',
      platform_card: {
        variant: 'tiktok_delivery_issue',
        ad_group_name: g.ad_group_name,
        secondary_status: g.secondary_status,
        dark_days: g.dark_days,
        rejected_ads: g.rejected_ads.map((ad) => ({
          reasons: ad.reasons,
          suggestion: ad.suggestion,
        })),
      },
      action: null,
      reason: `${g.ad_group_name} ${what}.${review ? ` Review: ${review}` : ''} Fix it in TikTok Ads Manager; nothing here changes it.`,
    });
  }
}

/** When G12 found the whole account dark, its one account card is the account's only
 *  finding this cycle (escenario 20): a coverage gap, a negative term or a weak hook on an
 *  account that shows no ad at all is advice for later, and beside the account card it reads
 *  as if the account were serving. Each one is kept as a named abstention, never dropped. */
function holdBackForDarkAccount(run: Run) {
  const accountCard = run.recommendations.find(
    (r) => r.platform_card.variant === 'google_delivery_issue' && r.platform_card.account_wide,
  );
  if (!accountCard) return;
  const held = run.recommendations.filter((r) => r !== accountCard);
  run.recommendations.splice(0, run.recommendations.length, accountCard);
  for (const r of held) {
    run.abstentions.push({
      rule: r.rule,
      entityId: r.entity.id,
      suppressedBy: accountCard.rule,
      reason: `${r.entity.name ?? r.entity.id}: held back while the whole account shows no ad (the G12 account card speaks for it). ${r.reason}`,
    });
  }
}

/**
 * The platform-only rules over one account's signals, recommend-only. Pure and synchronous:
 * a null google or tiktok block yields nothing for that platform, and every rule that lacks
 * an input it needs abstains by name instead of guessing.
 */
export function evaluatePlatformSignals(
  signals: PlatformSignals,
  context: PlatformSignalsContext,
): PlatformSignalsEvaluation {
  const run = new Run(signals, context);
  const target = run.target;
  const currency = run.currency;
  if (signals.google) {
    const google = signals.google;
    if (target !== null && currency) {
      g05NegativeTerms(run, google, target, currency);
      promoteTerms(run, google, target, currency);
      g11Keywords(run, google, target, currency);
      g09AdDrag(run, google, target, currency);
      g18PmaxAssets(run, google, target, currency);
    } else {
      const why = `no target cost per result in ${currency ?? 'the account currency'}`;
      if (google.search_terms.length + google.keywords.length > 0) {
        for (const rule of ['G05', 'G05_promote', 'G11'] as const)
          run.abstain(rule, null, `${why}; search terms and keywords are not priced.`);
      }
      if ((google.ads ?? []).length > 0)
        run.abstain('G09', null, `${why}; an ad's spend has no floor to pass.`);
      if ((google.pmax_assets ?? []).length > 0)
        run.abstain('G18_pmax_assets', null, `${why}; an asset's spend has no floor to pass.`);
    }
    if (currency) {
      g10AdWinner(run, google, currency);
      g23AudienceSaturation(run, google, currency);
    } else if ((google.ads ?? []).length + (google.audience ?? []).length > 0) {
      for (const rule of ['G10', 'G23'] as const)
        run.abstain(rule, null, 'the account reports no currency; no cost is printed without one.');
    }
    g03BudgetLimited(run, google);
    g07BidTarget(run, google, context.kpiField);
    pmaxCoverage(run, google);
    g12Delivery(run, google);
  }
  if (signals.tiktok) {
    const tiktok = signals.tiktok;
    t1HookRetention(run, tiktok);
    t3Fatigue(run, tiktok, target);
    t5SparkCandidate(run, tiktok, context.kpiField);
    t7BudgetBelowLearning(run, tiktok, target, context.kpiField);
    t12AttributionWindow(run, tiktok);
    t11Delivery(run, tiktok);
  }
  holdBackForDarkAccount(run);
  return {
    recommendations: run.recommendations,
    abstentions: run.abstentions,
    comparisonExclusions: run.comparisonExclusions,
  };
}
