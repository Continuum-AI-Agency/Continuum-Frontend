// ---------------------------------------------------------------------------
// The P8 account detectors (docs/jaina-google-goals/projects/P8-google-per-account.md,
// detalles.html §6): fifteen ideas first seen on Vivo 47, Easy Fit and Pink Elephant, written
// as patterns so each one fires on ANY Google account that shows it and stays silent on the
// others. Every finding is recommend-only — a `google_account_finding` card with no action —
// and on an account the client runs (profile.client_executes) the card says so and offers no
// control at all.
//
// Inputs are the optional P8 blocks of the google signals (platform-signals.ts): a detector
// whose block was not read abstains by name. The term lists (brand, competitors), the course
// lines and the checklist come from the account profile the edge attaches — stored by the
// team or inferred by the edge — never from a constant here.
//
// Registered from signalRules.ts (one call in evaluatePlatformSignals, after the platform
// rules): two detectors hold back a platform rule they contradict, as named abstentions —
// capped_budget_locked holds G03's raise while the primary conversion is inflated, and
// pmax_rescue_or_pause speaks for G18_pmax_coverage on the same campaign.
// ---------------------------------------------------------------------------

import {
  formatMoney,
  type GoogleAccountIdea,
  type GoogleAccountProfileSignal,
  type PlatformCard,
  type PlatformSignals,
} from '@continuum/contracts';
import type {
  PlatformSignalRecommendation,
  PlatformSignalRule,
  PlatformSignalSeverity,
  Run,
} from './signalRules';

type Google = NonNullable<PlatformSignals['google']>;
type Campaign = NonNullable<Google['campaigns']>[number];
type ConversionAction = NonNullable<Google['conversion_actions']>[number];
type SearchTerm = Google['search_terms'][number];
type FindingCard = Extract<PlatformCard, { variant: 'google_account_finding' }>;

/** The rule each idea persists as (`signal:<rule>`), in the order they run. */
export const ACCOUNT_DETECTOR_RULES = {
  inflated_primary_conversion: 'acct_inflated_primary_conversion',
  brand_vs_nonbrand: 'acct_brand_vs_nonbrand',
  capped_budget_locked: 'acct_capped_budget_locked',
  pmax_rescue_or_pause: 'acct_pmax_rescue_or_pause',
  quality_score_by_service: 'acct_quality_score_by_service',
  continuity_calendar: 'acct_continuity_calendar',
  paused_beat_active: 'acct_paused_beat_active',
  conversion_value_map: 'acct_conversion_value_map',
  competitor_terms: 'acct_competitor_terms',
  google_recommendations_filtered: 'acct_google_recommendations_filtered',
  client_executes_checklist: 'acct_client_executes_checklist',
  device_split: 'acct_device_split',
  intent_negatives: 'acct_intent_negatives',
  course_line_split: 'acct_course_line_split',
  lead_to_sale_funnel: 'acct_lead_to_sale_funnel',
} as const satisfies Record<GoogleAccountIdea, string>;

type AccountRule = (typeof ACCOUNT_DETECTOR_RULES)[GoogleAccountIdea];

/** V1: Google must report at least this many conversions before their mix is judged … */
export const INFLATED_MIN_REPORTED = 20;
/** … and attention events (GA4 engagement) must be at least this share of them. */
export const INFLATED_MIN_ENGAGEMENT_SHARE = 0.3;
/** V2: brand terms bought inside campaigns that also buy new demand, over this share of the
 *  search-term spend. A campaign whose terms are at least BRAND_OWN_CAMPAIGN brand already
 *  stands on its own and is left out. */
export const BRAND_MIN_SHARE = 0.3;
export const BRAND_OWN_CAMPAIGN = 0.9;
/** V3: a campaign losing at least this share of its Search impressions to budget. */
export const CAPPED_MIN_BUDGET_LOST = 0.5;
/** V4: a PMax costing this multiple of its target per conversion … */
export const PMAX_RESCUE_MULTIPLE = 3;
/** … while it loses this much to rank, or its asset groups rate POOR or AVERAGE. */
export const PMAX_RESCUE_RANK_LOST = 0.5;
/** V5 / P5: Quality Score at or under this is "the page does not match". */
export const LOW_QUALITY_SCORE = 3;
/** V5: low-QS keywords need this share of keyword spend, over at least two keywords. */
export const LOW_QS_MIN_SPEND_SHARE = 0.1;
/** E1: a run of this many dark days after the account first served. */
export const DARK_RUN_MIN_DAYS = 2;
/** E2: a paused campaign with this many conversions in 60 days … */
export const PAUSED_WINNER_MIN_CONVERSIONS = 30;
/** … at no more than this share of the active campaigns' cost per conversion. */
export const PAUSED_WINNER_MAX_COST_RATIO = 0.5;
/** E3: a lead action with this many conversions that is not primary. */
export const VALUE_MAP_MIN_CONVERSIONS = 5;
/** E4: competitor terms worth a card: this share of the search-term spend. */
export const COMPETITOR_MIN_SHARE = 0.01;
/** E5: open Google recommendations worth triaging. */
export const GOOGLE_RECS_MIN_OPEN = 20;
/** P2: a device costing this multiple of the other per conversion … */
export const DEVICE_COST_MULTIPLE = 3;
/** … while taking at least this share of the spend, over this many conversions. */
export const DEVICE_MIN_SPEND_SHARE = 0.4;
export const DEVICE_MIN_CONVERSIONS = 5;
/** P3: off-intent terms worth a list: at least this many, at this share of term spend. */
export const INTENT_MIN_TERMS = 3;
export const INTENT_MIN_SHARE = 0.03;
/** P4: a line this far from its agreed share, with at least this much spend assigned. */
export const LINE_MAX_DEVIATION = 0.1;
export const LINE_MIN_ASSIGNED = 0.5;
/** P5: leads that become sales at this rate or less, with value under spend. */
export const FUNNEL_MAX_SALE_RATE = 0.2;
export const FUNNEL_MIN_LEADS = 3;

/** conversion_action.category values that are a lead (conversion-rule.ts LEAD_CATEGORIES). */
const LEAD_CATEGORIES = new Set([
  'SUBMIT_LEAD_FORM',
  'CONTACT',
  'PHONE_CALL_LEAD',
  'BOOK_APPOINTMENT',
  'REQUEST_QUOTE',
  'QUALIFIED_LEAD',
  'CONVERTED_LEAD',
  'IMPORTED_LEAD',
]);
const isLead = (a: ConversionAction) => LEAD_CATEGORIES.has(a.category ?? '') && !a.ga4_engagement;
const isSale = (a: ConversionAction) => a.category === 'PURCHASE' && !a.ga4_engagement;
const isOutcome = (a: ConversionAction) => isLead(a) || isSale(a) || a.category === 'SIGNUP';

// ---------------------------------------------------------------------------
// Text: terms are matched on whole words, case- and accent-blind.
// ---------------------------------------------------------------------------

export function normalizeTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Does `text` hold `phrase` as whole words (or, for a phrase of 5+ letters, glued)? */
export function mentions(text: string, phrase: string): boolean {
  const t = normalizeTerm(text);
  const p = normalizeTerm(phrase);
  if (!p) return false;
  if (` ${t} `.includes(` ${p} `)) return true;
  const glued = p.replace(/ /g, '');
  return glued.length >= 5 && t.replace(/ /g, '').includes(glued);
}

/** P3's off-intent themes: what a person who will never buy a course or a membership types.
 *  Reviewed against Pink Elephant's own negatives of 2026-10-28 (change history). */
export const OFF_INTENT_THEMES: readonly { theme: string; words: readonly string[] }[] = [
  {
    theme: 'Students and homework',
    words: [
      'que estudiar',
      'tesis',
      'tarea',
      'monografia',
      'ensayo',
      'resumen',
      'wikipedia',
      'significado',
      'definicion',
      'que es',
      'ejemplo',
      'ejemplos',
      'pdf',
      'ppt',
      'diapositivas',
      'plantilla',
      'formato',
    ],
  },
  {
    theme: 'Free and downloads',
    words: ['gratis', 'free', 'descargar', 'torrent', 'crack', 'serial', 'gratuito', 'gratuitos'],
  },
  {
    theme: 'Jobs and salaries',
    words: [
      'empleo',
      'empleos',
      'trabajo',
      'vacante',
      'vacantes',
      'bolsa de trabajo',
      'sueldo',
      'salario',
      'cuanto gana',
    ],
  },
  {
    theme: 'Generic course browsing',
    words: ['cursos disponibles', 'cursos online', 'cursos en linea', 'a los 50', 'a los 40'],
  },
  {
    theme: 'Support and how-to',
    words: ['tutorial', 'como configurar', 'soporte tecnico', 'reparacion', 'ayuda windows'],
  },
];

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

const sum = <T>(xs: readonly T[], pick: (x: T) => number): number =>
  xs.reduce((n, x) => n + pick(x), 0);
const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`;
const plural = (n: number, one: string, many: string): string =>
  `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? one : many}`;
const round2 = (v: number): number => Math.round(v * 100) / 100;

function money(run: Run, value: number): string {
  const c = run.currency;
  return c ? formatMoney(value, c) : value.toFixed(2);
}

function accountSpend(google: Google): number | null {
  if (google.campaigns) return sum(google.campaigns, (c) => c.totals.spend);
  if (google.account_daily) return sum(google.account_daily, (d) => d.spend);
  return null;
}

/** An account-wide card is filed under the account's largest campaign, which is stable from
 *  cycle to cycle, so the same finding updates one row instead of writing a new one. */
function anchorCampaign(google: Google): { id: string; name: string } | null {
  const campaigns = [...(google.campaigns ?? [])].sort(
    (a, b) => b.totals_60d.spend - a.totals_60d.spend || a.campaign_id.localeCompare(b.campaign_id),
  );
  const top = campaigns[0];
  if (top) return { id: top.campaign_id, name: top.name };
  const d = google.delivery?.[0];
  return d ? { id: d.campaign_id, name: d.campaign_name } : null;
}

function campaignName(run: Run, google: Google, id: string): string {
  return google.campaigns?.find((c) => c.campaign_id === id)?.name ?? run.name(id, 'campaign');
}

type CardBody = Omit<
  FindingCard,
  'variant' | 'idea' | 'currency' | 'window_days' | 'recommend_only' | 'campaign_name'
>;

class Detectors {
  readonly profile: GoogleAccountProfileSignal | undefined;
  readonly fired = new Set<AccountRule>();

  constructor(
    readonly run: Run,
    readonly google: Google,
  ) {
    this.profile = google.profile;
  }

  get recommendOnly(): boolean {
    return this.profile?.client_executes ?? false;
  }

  abstain(rule: AccountRule, entityId: string | null, reason: string): void {
    this.run.abstain(rule as PlatformSignalRule, entityId, reason);
  }

  emit(
    idea: GoogleAccountIdea,
    args: {
      campaign: { id: string; name: string } | null;
      subject: string;
      severity: PlatformSignalSeverity;
      reason: string;
      card: CardBody;
    },
  ): void {
    const rule = ACCOUNT_DETECTOR_RULES[idea];
    const anchor = args.campaign ?? anchorCampaign(this.google);
    if (!anchor) {
      this.abstain(rule, null, 'the account has no campaign to file the finding under.');
      return;
    }
    const before = this.run.recommendations.length;
    this.run.recommend({
      rule: rule as PlatformSignalRule,
      platform: 'google_ads',
      entity: this.run.ref('google_ads', 'campaign', 'campaign', anchor.id, anchor.name),
      subject_key: args.subject,
      severity: args.severity,
      platform_card: {
        variant: 'google_account_finding',
        idea,
        campaign_name: args.campaign?.name ?? null,
        currency: this.run.currency,
        window_days: this.run.windowDays,
        recommend_only: this.recommendOnly,
        ...args.card,
      },
      action: null,
      reason: this.recommendOnly
        ? `${args.reason} The client runs this account: this is a recommendation to hand over, nothing here changes it.`
        : args.reason,
    });
    if (this.run.recommendations.length > before) this.fired.add(rule);
  }

  /** Moves a platform rule's card for `campaignId` into a named abstention. */
  holdBack(rule: PlatformSignalRule, campaignId: string, by: AccountRule, why: string): void {
    const recs = this.run.recommendations;
    for (let i = recs.length - 1; i >= 0; i -= 1) {
      const r = recs[i] as PlatformSignalRecommendation;
      if (r.rule !== rule || r.entity.id !== campaignId) continue;
      recs.splice(i, 1);
      this.run.abstentions.push({
        rule,
        entityId: campaignId,
        suppressedBy: by as PlatformSignalRule,
        reason: `${r.entity.name ?? campaignId}: ${why} ${r.reason}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// V1 — inflated primary conversion.
// ---------------------------------------------------------------------------

type Inflation = { reported: number; engaged: number; real: number } | null;

function inflatedPrimary(d: Detectors): Inflation {
  const rule = ACCOUNT_DETECTOR_RULES.inflated_primary_conversion;
  const actions = d.google.conversion_actions;
  if (!actions) {
    d.abstain(rule, null, 'the conversion actions were not read this cycle.');
    return null;
  }
  const reportedOf = (a: ConversionAction) => sum(a.by_campaign, (c) => c.reported);
  const allOf = (a: ConversionAction) => sum(a.by_campaign, (c) => c.all);
  const reported = sum(actions, reportedOf);
  // What Google bids toward but is not a contact or a sale: GA4 attention events, and any
  // primary action whose category is not an outcome (directions, page views, engagements).
  const engagedActions = actions
    .filter((a) => (a.ga4_engagement || !isOutcome(a)) && reportedOf(a) > 0)
    .sort((a, b) => reportedOf(b) - reportedOf(a));
  const engaged = sum(engagedActions, reportedOf);
  const real = sum(actions.filter(isOutcome), allOf);
  if (reported < INFLATED_MIN_REPORTED) {
    d.abstain(
      rule,
      null,
      `Google reports ${plural(reported, 'conversion', 'conversions')}; under ${INFLATED_MIN_REPORTED} the mix says nothing.`,
    );
    return null;
  }
  const share = engaged / reported;
  if (share < INFLATED_MIN_ENGAGEMENT_SHARE) return null;

  const spend = accountSpend(d.google);
  const realActions = actions
    .filter((a) => isOutcome(a) && allOf(a) > 0)
    .sort((a, b) => allOf(b) - allOf(a));
  const notPrimary = realActions.filter((a) => a.primary_for_goal !== true);
  const facts = [
    { label: 'Conversions Google reports', value: reported.toFixed(0) },
    {
      label: 'Of them, visits and attention events',
      value: `${engaged.toFixed(0)} (${pct(share)})`,
    },
    { label: 'Real results (leads, sales)', value: real.toFixed(0) },
  ];
  if (spend !== null && spend > 0) {
    facts.push({ label: 'Reported cost per conversion', value: money(d.run, spend / reported) });
    facts.push({
      label: 'Real cost per result',
      value: real > 0 ? money(d.run, spend / real) : 'no real result',
    });
  }
  d.emit('inflated_primary_conversion', {
    campaign: null,
    subject: 'account',
    severity: 'high',
    reason: `${pct(share)} of the ${reported.toFixed(0)} conversions Google reports are visits or attention events (${engagedActions
      .slice(0, 3)
      .map((a) => `"${a.name}"`)
      .join(
        ', ',
      )}) marked primary. Only ${real.toFixed(0)} are leads or sales. Google bids toward what is primary, so it is buying visits. Our own reads already leave these events out; Google's bidding does not.`,
    card: {
      headline: 'Most of what Google calls a conversion is a visit',
      facts,
      bars: [
        {
          label: 'Visits and attention events',
          value: round2(engaged),
          share: round2(share),
          target_share: null,
          flagged: true,
        },
        {
          label: 'Leads and sales',
          value: round2(real),
          share: reported + real > 0 ? Math.min(1, round2(real / Math.max(reported, real))) : null,
          target_share: null,
          flagged: false,
        },
      ],
      unit: 'count',
      checklist: [
        ...engagedActions.slice(0, 3).map((a) => ({
          label: `Set "${a.name}" to secondary in Google Ads: it counts a visit, not a contact`,
          status: null,
          detail: null,
        })),
        ...notPrimary.slice(0, 2).map((a) => ({
          label: `Make "${a.name}" a primary conversion`,
          status: null,
          detail: `${allOf(a).toFixed(0)} in the window`,
        })),
        {
          label: 'Give the bidding two weeks to relearn before judging its cost',
          status: null,
          detail: null,
        },
      ],
      blocked: null,
    },
  });
  return { reported, engaged, real };
}

// ---------------------------------------------------------------------------
// V2 — brand vs non-brand.
// ---------------------------------------------------------------------------

function brandVsNonBrand(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.brand_vs_nonbrand;
  const brand = d.profile?.brand_terms ?? [];
  if (brand.length === 0) {
    d.abstain(rule, null, 'no brand terms are known for this account (profile not read).');
    return;
  }
  const terms = d.google.search_terms.filter((t) => t.totals.spend > 0);
  const total = sum(terms, (t) => t.totals.spend);
  if (total <= 0) {
    d.abstain(rule, null, 'no search term spent in the window.');
    return;
  }
  const isBrand = (t: SearchTerm) => brand.some((b) => mentions(t.term, b));
  const byCampaign = new Map<string, { brand: number; all: number }>();
  for (const t of terms) {
    const row = byCampaign.get(t.campaign_id) ?? { brand: 0, all: 0 };
    row.all += t.totals.spend;
    if (isBrand(t)) row.brand += t.totals.spend;
    byCampaign.set(t.campaign_id, row);
  }
  const mixed = [...byCampaign.entries()].filter(
    ([, r]) => r.brand > 0 && r.brand / r.all < BRAND_OWN_CAMPAIGN,
  );
  const mixedBrand = sum(mixed, ([, r]) => r.brand);
  const share = mixedBrand / total;
  if (share < BRAND_MIN_SHARE) return;
  const brandTerms = terms.filter(isBrand);
  const nonBrand = terms.filter((t) => !isBrand(t));
  const brandConv = sum(brandTerms, (t) => t.totals.conversions);
  const nonConv = sum(nonBrand, (t) => t.totals.conversions);
  const brandSpend = sum(brandTerms, (t) => t.totals.spend);
  const nonSpend = total - brandSpend;
  const cpr = (s: number, c: number) => (c > 0 ? money(d.run, s / c) : 'no conversion');
  const source = d.profile?.brand_terms_source === 'stored' ? 'set by the team' : 'inferred';
  d.emit('brand_vs_nonbrand', {
    campaign: null,
    subject: 'account',
    severity: 'medium',
    reason: `${pct(share)} of the search-term spend (${money(d.run, mixedBrand)}) buys people who typed the brand, inside ${plural(mixed.length, 'campaign', 'campaigns')} that also have to find new customers. Brand searches convert cheaply and crowd out the budget for new demand.`,
    card: {
      headline: `${pct(share)} of the spend buys people already looking for you`,
      facts: [
        {
          label: 'Brand spend',
          value: `${money(d.run, brandSpend)} · ${cpr(brandSpend, brandConv)} per conversion`,
        },
        {
          label: 'Non-brand spend',
          value: `${money(d.run, nonSpend)} · ${cpr(nonSpend, nonConv)} per conversion`,
        },
        { label: `Brand terms (${source})`, value: brand.slice(0, 6).join(', ') },
      ],
      bars: [
        {
          label: 'Brand',
          value: round2(brandSpend),
          share: round2(brandSpend / total),
          target_share: null,
          flagged: true,
        },
        {
          label: 'Non-brand',
          value: round2(nonSpend),
          share: round2(nonSpend / total),
          target_share: null,
          flagged: false,
        },
      ],
      unit: 'money',
      checklist: [
        {
          label: 'Move the brand terms into their own campaign with its own budget',
          status: null,
          detail: null,
        },
        {
          label: 'Add the brand terms as negatives in the non-brand campaigns',
          status: null,
          detail: brand.slice(0, 6).join(', '),
        },
        { label: 'Judge non-brand on its own cost per lead', status: null, detail: null },
      ],
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// V3 — budget-capped while the conversion is wrong: the raise waits for the fix.
// ---------------------------------------------------------------------------

function cappedBudgetLocked(d: Detectors, inflation: Inflation) {
  const rule = ACCOUNT_DETECTOR_RULES.capped_budget_locked;
  const campaigns = d.google.campaigns;
  if (!campaigns) {
    d.abstain(rule, null, 'the campaign block was not read this cycle.');
    return;
  }
  const capped = campaigns.filter(
    (c) =>
      c.status === 'ENABLED' &&
      c.totals.spend > 0 &&
      (c.budget_lost_impression_share ?? 0) >= CAPPED_MIN_BUDGET_LOST,
  );
  if (capped.length === 0) return;
  if (!inflation) {
    for (const c of capped)
      d.abstain(
        rule,
        c.campaign_id,
        `${c.name}: the conversion definition holds; G03 judges its budget.`,
      );
    return;
  }
  for (const c of capped) {
    const lost = c.budget_lost_impression_share ?? 0;
    const reportedCpr = c.totals.conversions > 0 ? c.totals.spend / c.totals.conversions : null;
    d.emit('capped_budget_locked', {
      campaign: { id: c.campaign_id, name: c.name },
      subject: 'capped_locked',
      severity: 'medium',
      reason: `${c.name} loses ${pct(lost)} of its impressions to budget, but the account's primary conversion counts visits: a bigger budget today buys more visits, not more leads. The raise waits until the conversion is fixed.`,
      card: {
        headline: `${pct(lost)} lost to budget — raise only after fixing the conversion`,
        facts: [
          { label: 'Lost to budget', value: pct(lost) },
          ...(c.budget_per_day !== null
            ? [{ label: 'Budget', value: `${money(d.run, c.budget_per_day)}/day` }]
            : []),
          ...(reportedCpr !== null
            ? [{ label: 'Reported cost per conversion', value: money(d.run, reportedCpr) }]
            : []),
        ],
        bars: [
          {
            label: 'Shown',
            value: round2(1 - lost),
            share: round2(1 - lost),
            target_share: null,
            flagged: false,
          },
          {
            label: 'Lost to budget',
            value: round2(lost),
            share: round2(lost),
            target_share: null,
            flagged: true,
          },
        ],
        unit: 'share',
        checklist: [
          {
            label: 'Fix the primary conversion first (the inflated-conversion card)',
            status: null,
            detail: null,
          },
          {
            label: 'Then let the budget card propose the raise against real leads',
            status: null,
            detail: null,
          },
        ],
        blocked: null,
      },
    });
    d.holdBack(
      'G03',
      c.campaign_id,
      rule,
      'held back while the primary conversion counts visits (capped_budget_locked).',
    );
  }
}

// ---------------------------------------------------------------------------
// V4 — rescue or pause a Performance Max that costs a multiple of its target.
// ---------------------------------------------------------------------------

function pmaxRescue(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.pmax_rescue_or_pause;
  const campaigns = d.google.campaigns;
  if (!campaigns) {
    d.abstain(rule, null, 'the campaign block was not read this cycle.');
    return;
  }
  for (const c of campaigns) {
    if (c.channel_type !== 'PERFORMANCE_MAX' || c.status !== 'ENABLED' || c.totals.spend <= 0)
      continue;
    const bid = d.google.bid_targets.find((b) => b.campaign_id === c.campaign_id);
    const target = bid?.target_cpa ?? d.run.target;
    if (target === null || target === undefined) {
      d.abstain(rule, c.campaign_id, `${c.name}: no target CPA on the campaign or the portfolio.`);
      continue;
    }
    const conv = c.totals.conversions;
    const cpr = conv > 0 ? c.totals.spend / conv : null;
    const tooDear =
      cpr === null
        ? c.totals.spend >= PMAX_RESCUE_MULTIPLE * target
        : cpr >= PMAX_RESCUE_MULTIPLE * target;
    if (!tooDear) continue;
    const groups = d.google.asset_groups.filter((g) => g.campaign_id === c.campaign_id);
    const weak = groups.filter((g) => g.ad_strength === 'POOR' || g.ad_strength === 'AVERAGE');
    const rankLost = c.rank_lost_impression_share ?? 0;
    if (weak.length === 0 && rankLost < PMAX_RESCUE_RANK_LOST) {
      d.abstain(
        rule,
        c.campaign_id,
        `${c.name}: dear, but its assets rate well and it does not lose to rank; the bid card judges it.`,
      );
      continue;
    }
    const missing = [...new Set(weak.flatMap((g) => g.missing))].slice(0, 5);
    const perDay = c.budget_per_day ?? c.totals.spend / d.run.windowDays;
    d.emit('pmax_rescue_or_pause', {
      campaign: { id: c.campaign_id, name: c.name },
      subject: 'pmax_rescue',
      severity: 'high',
      reason: `${c.name} costs ${cpr === null ? `${money(d.run, c.totals.spend)} with no conversion` : `${money(d.run, cpr)} per conversion`} against a target of ${money(d.run, target)}${weak.length ? `; its asset groups rate ${[...new Set(weak.map((g) => g.ad_strength))].join('/')}` : ''}${rankLost > 0 ? ` and it loses ${pct(rankLost)} to rank` : ''}. Rebuild its assets, or pause it and move its ${money(d.run, perDay)} a day.`,
      card: {
        headline: 'Rescue or pause this Performance Max',
        facts: [
          {
            label: 'Cost per conversion',
            value: cpr === null ? 'no conversion' : money(d.run, cpr),
          },
          { label: 'Target', value: money(d.run, target) },
          {
            label: 'Asset strength',
            value:
              groups.map((g) => `${g.name}: ${g.ad_strength ?? 'unknown'}`).join(' · ') ||
              'no asset group read',
          },
          { label: 'Lost to rank', value: pct(rankLost) },
        ],
        checklist: [
          {
            label: 'Option A — rebuild the assets with Jaina',
            status: null,
            detail: missing.length ? `Missing: ${missing.join(', ')}` : null,
          },
          {
            label: `Option B — pause it and move its ${money(d.run, perDay)}/day`,
            status: null,
            detail: null,
          },
        ],
        blocked: null,
      },
    });
    d.holdBack(
      'G18_pmax_coverage',
      c.campaign_id,
      rule,
      "the rescue-or-pause card speaks for this campaign's assets.",
    );
  }
}

// ---------------------------------------------------------------------------
// V5 / P5-QS — Quality Score by service: one landing page per service.
// ---------------------------------------------------------------------------

function lowQualityKeywords(google: Google) {
  return google.keywords.filter(
    (k) =>
      k.status === 'ENABLED' &&
      !k.negative &&
      k.quality_score !== null &&
      k.quality_score <= LOW_QUALITY_SCORE &&
      k.totals.spend > 0,
  );
}

function qualityScoreByService(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.quality_score_by_service;
  const keywordSpend = sum(d.google.keywords, (k) => k.totals.spend);
  if (keywordSpend <= 0) {
    d.abstain(rule, null, 'no keyword spent in the window.');
    return;
  }
  const low = lowQualityKeywords(d.google);
  const lowSpend = sum(low, (k) => k.totals.spend);
  if (low.length < 2 || lowSpend / keywordSpend < LOW_QS_MIN_SPEND_SHARE) return;
  const groups = new Map(d.google.ad_groups?.map((g) => [g.ad_group_id, g]) ?? []);
  const services = new Map<string, { name: string; spend: number; keywords: typeof low }>();
  for (const k of low) {
    const name = groups.get(k.ad_group_id)?.name ?? `Ad group ${k.ad_group_id}`;
    const row = services.get(k.ad_group_id) ?? { name, spend: 0, keywords: [] };
    row.spend += k.totals.spend;
    row.keywords.push(k);
    services.set(k.ad_group_id, row);
  }
  const ranked = [...services.entries()].sort((a, b) => b[1].spend - a[1].spend);
  const urls = new Set(
    ranked.flatMap(([id]) => groups.get(id)?.final_urls ?? []).map((u) => u.replace(/[?#].*$/, '')),
  );
  const sharedPage = d.google.ad_groups !== undefined && ranked.length >= 2 && urls.size <= 1;
  d.emit('quality_score_by_service', {
    campaign: null,
    subject: 'account',
    severity: 'medium',
    reason: `${plural(low.length, 'keyword', 'keywords')} with Quality Score ${LOW_QUALITY_SCORE} or less spent ${money(d.run, lowSpend)} (${pct(lowSpend / keywordSpend)} of the keyword spend) across ${plural(ranked.length, 'service', 'services')}${sharedPage ? ', and they all land on the same page' : ''}. A low score raises every click's price; a page and an ad group per service lifts it.`,
    card: {
      headline: 'Low Quality Score by service — one landing page per service',
      facts: ranked.slice(0, 5).map(([, s]) => ({
        label: s.name,
        value: `${s.keywords
          .sort((a, b) => b.totals.spend - a.totals.spend)
          .slice(0, 2)
          .map((k) => `"${k.text}" QS ${k.quality_score}`)
          .join(', ')} · ${money(d.run, s.spend)}`,
      })),
      bars: ranked.slice(0, 6).map(([, s]) => ({
        label: s.name,
        value: round2(s.spend),
        share: round2(s.spend / lowSpend),
        target_share: null,
        flagged: true,
      })),
      unit: 'money',
      checklist: [
        {
          label: 'Give each service its own landing page that answers the keyword',
          status: null,
          detail: sharedPage ? `Today every service lands on ${[...urls][0] ?? 'one page'}` : null,
        },
        {
          label: 'One ad group per service, with ads that name the service',
          status: null,
          detail: null,
        },
      ],
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// E1 — continuity calendar: days the account went dark after it started serving.
// ---------------------------------------------------------------------------

function continuityCalendar(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.continuity_calendar;
  const days = d.google.account_daily;
  if (!days) {
    d.abstain(rule, null, 'the daily account totals were not read this cycle.');
    return;
  }
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted.findIndex((x) => x.impressions > 0);
  if (first < 0) return;
  const runs: { from: string; to: string; length: number; ongoing: boolean }[] = [];
  let start = -1;
  for (let i = first; i <= sorted.length; i += 1) {
    const dark = i < sorted.length && (sorted[i]?.impressions ?? 0) === 0;
    if (dark && start < 0) start = i;
    if (!dark && start >= 0) {
      runs.push({
        from: sorted[start]!.date,
        to: sorted[i - 1]!.date,
        length: i - start,
        ongoing: i === sorted.length,
      });
      start = -1;
    }
  }
  // A run of Saturdays and Sundays only is an ad schedule (a B2B account that rests on the
  // weekend), not an outage.
  const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  const weekendOnly = (r: (typeof runs)[number]) => {
    for (
      let t = Date.parse(`${r.from}T00:00:00Z`);
      t <= Date.parse(`${r.to}T00:00:00Z`);
      t += 86_400_000
    ) {
      const day = weekday(new Date(t).toISOString().slice(0, 10));
      if (day !== 0 && day !== 6) return false;
    }
    return true;
  };
  const long = runs.filter((r) => r.length >= DARK_RUN_MIN_DAYS && !weekendOnly(r));
  if (long.length === 0) {
    if (runs.some(weekendOnly))
      d.abstain(rule, null, 'the only dark days are weekends: an ad schedule, not an outage.');
    return;
  }
  const accountCardOn = d.run.recommendations.some(
    (r) => r.platform_card.variant === 'google_delivery_issue' && r.platform_card.account_wide,
  );
  const ended = long.filter((r) => !r.ongoing || !accountCardOn);
  if (ended.length === 0) {
    d.abstain(rule, null, 'the account is dark now; the G12 account card speaks for it.');
    return;
  }
  const served = sorted.slice(first).filter((x) => x.impressions > 0);
  const perDay = served.length ? sum(served, (x) => x.conversions) / served.length : 0;
  const darkDays = sum(ended, (r) => r.length);
  const label = (r: (typeof ended)[number]) => (r.from === r.to ? r.from : `${r.from} → ${r.to}`);
  d.emit('continuity_calendar', {
    campaign: null,
    subject: 'account',
    severity: ended.some((r) => r.ongoing) ? 'high' : 'medium',
    reason: `The account showed no ad on ${plural(darkDays, 'day', 'days')} after it had started serving (${ended.map(label).join(', ')}). At its served-day average that is about ${(perDay * darkDays).toFixed(1)} conversions lost. Nothing raised an alarm while it happened.`,
    card: {
      headline: `Dark ${ended.map(label).join(', ')}`,
      facts: [
        { label: 'Dark days', value: String(darkDays) },
        { label: 'Conversions lost (served-day average)', value: (perDay * darkDays).toFixed(1) },
        ...ended.map((r) => ({ label: r.ongoing ? 'Still dark since' : 'Dark', value: label(r) })),
      ],
      bars: sorted.slice(first).map((x) => ({
        label: x.date.slice(5),
        value: round2(x.spend),
        share: null,
        target_share: null,
        flagged: x.impressions === 0,
      })),
      unit: 'money',
      checklist: [
        {
          label: 'Find the cause in the change history and billing (payment, budget, policy)',
          status: null,
          detail: null,
        },
        {
          label: 'This card fires again the day the account goes dark',
          status: null,
          detail: null,
        },
      ],
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// E2 — a paused campaign that beat the active ones.
// ---------------------------------------------------------------------------

function pausedBeatActive(d: Detectors, inflation: Inflation) {
  const rule = ACCOUNT_DETECTOR_RULES.paused_beat_active;
  const campaigns = d.google.campaigns;
  if (!campaigns) {
    d.abstain(rule, null, 'the campaign block was not read this cycle.');
    return;
  }
  const active = campaigns.filter((c) => c.status === 'ENABLED' && c.totals.spend > 0);
  const activeSpend = sum(active, (c) => c.totals.spend);
  const activeConv = sum(active, (c) => c.totals.conversions);
  if (active.length === 0) return;
  const activeCpr = activeConv > 0 ? activeSpend / activeConv : null;
  const winners = campaigns
    .filter(
      (c) => c.status === 'PAUSED' && c.totals_60d.conversions >= PAUSED_WINNER_MIN_CONVERSIONS,
    )
    .map((c) => ({ c, cpr: c.totals_60d.spend / c.totals_60d.conversions }))
    .filter(({ cpr }) => activeCpr === null || cpr <= PAUSED_WINNER_MAX_COST_RATIO * activeCpr)
    .sort((a, b) => a.cpr - b.cpr);
  const best = winners[0];
  if (!best) return;
  const rows = active
    .map((c) => ({
      c,
      cpr: c.totals.conversions > 0 ? c.totals.spend / c.totals.conversions : null,
    }))
    .sort((a, b) => b.c.totals.spend - a.c.totals.spend);
  const budget = sum(active, (c) => c.budget_per_day ?? 0);
  d.emit('paused_beat_active', {
    campaign: { id: best.c.campaign_id, name: best.c.name },
    subject: 'paused_winner',
    severity: 'medium',
    reason: `${best.c.name} is paused, yet over 60 days it bought ${best.c.totals_60d.conversions.toFixed(0)} conversions at ${money(d.run, best.cpr)} each, while the active campaigns cost ${activeCpr === null ? 'with no conversion' : `${money(d.run, activeCpr)} each`}.${inflation ? ' These are conversions as Google reports them; fix the primary conversion before you judge either.' : ''} Duplicate it, PAUSED, with today's budget, and review it before it runs.`,
    card: {
      headline: 'What worked best is paused',
      facts: [
        {
          label: `${best.c.name} (paused, 60 days)`,
          value: `${best.c.totals_60d.conversions.toFixed(0)} conv · ${money(d.run, best.cpr)} each`,
        },
        ...rows.slice(0, 3).map(({ c, cpr }) => ({
          label: `${c.name} (active)`,
          value:
            cpr === null
              ? `${money(d.run, c.totals.spend)} · no conversion`
              : `${money(d.run, cpr)} each`,
        })),
      ],
      bars: [
        {
          label: `${best.c.name} (paused)`,
          value: round2(best.cpr),
          share: null,
          target_share: null,
          flagged: false,
        },
        ...rows
          .filter((r) => r.cpr !== null)
          .slice(0, 3)
          .map(({ c, cpr }) => ({
            label: c.name,
            value: round2(cpr ?? 0),
            share: null,
            target_share: null,
            flagged: true,
          })),
      ],
      unit: 'money',
      checklist: [
        {
          label: `Duplicate ${best.c.name} PAUSED${budget > 0 ? ` with ${money(d.run, budget)}/day` : ''}`,
          status: null,
          detail: 'Review it, then approve it to run',
        },
      ],
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// E3 — conversion value map: which conversion counts, and what each is worth.
// ---------------------------------------------------------------------------

function conversionValueMap(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.conversion_value_map;
  const actions = d.google.conversion_actions;
  if (!actions) {
    d.abstain(rule, null, 'the conversion actions were not read this cycle.');
    return;
  }
  const allOf = (a: ConversionAction) => sum(a.by_campaign, (c) => c.all);
  const live = actions.filter((a) => allOf(a) > 0).sort((a, b) => allOf(b) - allOf(a));
  const primaries = live.filter((a) => a.primary_for_goal === true);
  const leadsNotPrimary = live.filter(
    (a) => isLead(a) && a.primary_for_goal !== true && allOf(a) >= VALUE_MAP_MIN_CONVERSIONS,
  );
  const values = new Set(live.map((a) => a.default_value ?? 0));
  const flatValues = live.length >= 3 && values.size === 1;
  if (leadsNotPrimary.length === 0 && !flatValues) return;
  const total = sum(live, allOf);
  d.emit('conversion_value_map', {
    campaign: null,
    subject: 'account',
    severity: 'medium',
    reason:
      `${leadsNotPrimary.length ? `${leadsNotPrimary.map((a) => `"${a.name}"`).join(', ')} ${leadsNotPrimary.length === 1 ? 'is a lead that is' : 'are leads that are'} not primary, while Google bids toward ${primaries.map((a) => `"${a.name}"`).join(', ') || 'nothing'}. ` : ''}${flatValues ? `All ${live.length} conversion actions carry the same value, so Google cannot tell a contact from a map click.` : ''}`.trim(),
    card: {
      headline: 'Which conversion is worth what',
      facts: [
        { label: 'Primary today', value: primaries.map((a) => a.name).join(', ') || 'none' },
        ...live.slice(0, 5).map((a) => ({
          label: a.name,
          value: `${allOf(a).toFixed(0)} · ${a.primary_for_goal ? 'primary' : 'secondary'} · value ${a.default_value ?? 'not set'}`,
        })),
      ],
      bars: live.slice(0, 6).map((a) => ({
        label: a.name,
        value: round2(allOf(a)),
        share: total > 0 ? round2(allOf(a) / total) : null,
        target_share: null,
        flagged: a.ga4_engagement || (isLead(a) && a.primary_for_goal !== true),
      })),
      unit: 'count',
      checklist: [
        ...leadsNotPrimary.map((a) => ({
          label: `Make "${a.name}" primary`,
          status: null,
          detail: null,
        })),
        {
          label:
            'Give each action its value to the business (a form, a WhatsApp chat, a map click)',
          status: null,
          detail: flatValues ? 'Today they are all valued the same' : null,
        },
        {
          label: 'Match the primaries to what the Optimizer counts as a result on Meta',
          status: null,
          detail: null,
        },
      ],
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// E4 / P3 — competitor terms and off-intent terms, as lists to paste.
// ---------------------------------------------------------------------------

const unexcluded = (t: SearchTerm) =>
  t.status !== 'EXCLUDED' &&
  t.status !== 'ADDED_EXCLUDED' &&
  t.totals.spend > 0 &&
  t.totals.conversions === 0;

function negativesProposedByG05(run: Run): Set<string> {
  const out = new Set<string>();
  for (const r of run.recommendations) {
    if (r.rule !== 'G05' || r.platform_card.variant !== 'google_negative_terms') continue;
    for (const t of r.platform_card.terms) out.add(normalizeTerm(t.term));
  }
  return out;
}

function competitorTerms(d: Detectors): Set<string> {
  const rule = ACCOUNT_DETECTOR_RULES.competitor_terms;
  const taken = new Set<string>();
  const competitors = d.profile?.competitor_terms ?? [];
  const brand = d.profile?.brand_terms ?? [];
  if (!d.profile) {
    d.abstain(rule, null, 'the account profile was not read; no competitor list.');
    return taken;
  }
  const total = sum(d.google.search_terms, (t) => t.totals.spend);
  if (competitors.length === 0 || total <= 0) return taken;
  const groups = new Map<string, SearchTerm[]>();
  for (const t of d.google.search_terms.filter(unexcluded)) {
    if (brand.some((b) => mentions(t.term, b))) continue;
    const name = competitors.find((c) => mentions(t.term, c));
    if (!name) continue;
    groups.set(name, [...(groups.get(name) ?? []), t]);
  }
  const spend = sum([...groups.values()].flat(), (t) => t.totals.spend);
  if (spend / total < COMPETITOR_MIN_SHARE) return taken;
  const g05 = negativesProposedByG05(d.run);
  const ranked = [...groups.entries()].sort(
    (a, b) => sum(b[1], (t) => t.totals.spend) - sum(a[1], (t) => t.totals.spend),
  );
  for (const [, terms] of ranked) for (const t of terms) taken.add(normalizeTerm(t.term));
  const covered = [...taken].filter((t) => g05.has(t)).length;
  const source =
    d.profile.competitor_terms_source === 'stored'
      ? 'set by the team'
      : 'inferred from the search terms';
  d.emit('competitor_terms', {
    campaign: null,
    subject: 'account',
    severity: 'medium',
    reason: `Searches for other brands (${ranked.map(([c]) => c).join(', ')}) spent ${money(d.run, spend)} with no conversion: people looking for a competitor rarely switch on an ad.${covered ? ` ${covered} of these terms are already in this cycle's negatives card.` : ''}`,
    card: {
      headline: 'Competitor searches spend and do not convert',
      facts: [
        { label: 'Spend on competitor searches', value: `${money(d.run, spend)} · 0 conversions` },
        ...ranked.slice(0, 4).map(([c, terms]) => ({
          label: c,
          value: `${money(
            d.run,
            sum(terms, (t) => t.totals.spend),
          )} · ${plural(terms.length, 'term', 'terms')}`,
        })),
        { label: `Competitor list (${source})`, value: competitors.slice(0, 8).join(', ') },
      ],
      negatives: ranked.map(([c, terms]) => ({
        theme: c,
        terms: [...new Set(terms.map((t) => t.term))].slice(0, 30),
      })),
      checklist: [
        {
          label: 'Add these as exact negatives on the campaigns that bought them',
          status: null,
          detail: covered ? `${covered} already proposed by the negatives card` : null,
        },
        {
          label: 'Correct the competitor list if a name is not a competitor',
          status: null,
          detail: null,
        },
      ],
      blocked: null,
    },
  });
  return taken;
}

function intentNegatives(d: Detectors, competitorTaken: ReadonlySet<string>) {
  const total = sum(d.google.search_terms, (t) => t.totals.spend);
  if (total <= 0) return;
  const brand = d.profile?.brand_terms ?? [];
  const groups = new Map<string, SearchTerm[]>();
  for (const t of d.google.search_terms.filter(unexcluded)) {
    if (competitorTaken.has(normalizeTerm(t.term))) continue;
    if (brand.some((b) => mentions(t.term, b))) continue;
    const theme = OFF_INTENT_THEMES.find((th) => th.words.some((w) => mentions(t.term, w)));
    if (!theme) continue;
    groups.set(theme.theme, [...(groups.get(theme.theme) ?? []), t]);
  }
  const terms = [...groups.values()].flat();
  const spend = sum(terms, (t) => t.totals.spend);
  if (terms.length < INTENT_MIN_TERMS || spend / total < INTENT_MIN_SHARE) return;
  const ranked = [...groups.entries()].sort(
    (a, b) => sum(b[1], (t) => t.totals.spend) - sum(a[1], (t) => t.totals.spend),
  );
  d.emit('intent_negatives', {
    campaign: null,
    subject: 'account',
    severity: 'medium',
    reason: `${plural(terms.length, 'search term', 'search terms')} from people who will not buy (${ranked.map(([th]) => th.toLowerCase()).join(', ')}) spent ${money(d.run, spend)} (${pct(spend / total)} of the term spend) with no conversion.`,
    card: {
      headline: 'Searches with the wrong intent — negative lists by theme',
      facts: ranked.map(([th, ts]) => ({
        label: th,
        value: `${money(
          d.run,
          sum(ts, (t) => t.totals.spend),
        )} · ${ts
          .sort((a, b) => b.totals.spend - a.totals.spend)
          .slice(0, 2)
          .map((t) => `"${t.term}"`)
          .join(', ')}`,
      })),
      negatives: ranked.map(([th, ts]) => ({
        theme: th,
        terms: [...new Set(ts.map((t) => t.term))].slice(0, 30),
      })),
      checklist: [
        {
          label: 'Paste each list as negatives (phrase match) on the Search campaigns',
          status: null,
          detail: null,
        },
      ],
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// E5 — Google's open recommendations, filtered by our rules. Read, never applied.
// ---------------------------------------------------------------------------

const RECS_WORTH =
  /ASSET|EXTENSION|AD_STRENGTH|RESPONSIVE_SEARCH_AD|ENHANCED_CONVERSIONS|CONVERSION_TRACKING|CALL_|SITELINK|CALLOUT/;
const RECS_BUDGET = /BUDGET/;
const RECS_DISCARD =
  /KEYWORD|BROAD_MATCH|DISPLAY_EXPANSION|SEARCH_PARTNERS|OPT_IN|AD_ROTATION|CUSTOM_AUDIENCE/;

function googleRecommendations(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.google_recommendations_filtered;
  const recs = d.google.recommendations;
  if (!recs) {
    d.abstain(rule, null, "Google's recommendations were not read this cycle.");
    return;
  }
  if (recs.length < GOOGLE_RECS_MIN_OPEN) return;
  const target = d.run.target;
  const dear = (campaignId: string | null): boolean => {
    const c = d.google.campaigns?.find((x) => x.campaign_id === campaignId);
    if (!c) return true;
    if (c.totals.conversions <= 0) return c.totals.spend > 0;
    const bid =
      d.google.bid_targets.find((b) => b.campaign_id === campaignId)?.target_cpa ?? target;
    return bid !== null && bid !== undefined && c.totals.spend / c.totals.conversions > bid;
  };
  const buckets = {
    worth: [] as typeof recs,
    conflict: [] as typeof recs,
    discard: [] as typeof recs,
    review: [] as typeof recs,
  };
  for (const r of recs) {
    if (RECS_BUDGET.test(r.type)) (dear(r.campaign_id) ? buckets.conflict : buckets.worth).push(r);
    else if (RECS_WORTH.test(r.type)) buckets.worth.push(r);
    else if (RECS_DISCARD.test(r.type)) buckets.discard.push(r);
    else buckets.review.push(r);
  }
  const byType = new Map<string, number>();
  for (const r of recs) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const worthTypes = [...new Set(buckets.worth.map((r) => r.type))];
  d.emit('google_recommendations_filtered', {
    campaign: null,
    subject: 'account',
    severity: 'low',
    reason: `Google has ${recs.length} open recommendations on this account. Passed through our rules: ${buckets.worth.length} worth doing, ${buckets.conflict.length} that would spend more where a result already costs more than the target, ${buckets.discard.length} to discard and ${buckets.review.length} to review. Nothing is applied from here.`,
    card: {
      headline: `${recs.length} Google recommendations, ${buckets.worth.length} worth it`,
      facts: top.map(([type, n]) => ({
        label: type.toLowerCase().replace(/_/g, ' '),
        value: String(n),
      })),
      bars: [
        {
          label: 'Worth it',
          value: buckets.worth.length,
          share: round2(buckets.worth.length / recs.length),
          target_share: null,
          flagged: false,
        },
        {
          label: 'Clash with the CPA goal',
          value: buckets.conflict.length,
          share: round2(buckets.conflict.length / recs.length),
          target_share: null,
          flagged: true,
        },
        {
          label: 'Discard',
          value: buckets.discard.length,
          share: round2(buckets.discard.length / recs.length),
          target_share: null,
          flagged: false,
        },
        {
          label: 'Review',
          value: buckets.review.length,
          share: round2(buckets.review.length / recs.length),
          target_share: null,
          flagged: false,
        },
      ],
      unit: 'count',
      checklist: worthTypes.slice(0, 5).map((type) => ({
        label: `Apply in Google Ads: ${type.toLowerCase().replace(/_/g, ' ')}`,
        status: null,
        detail: `${buckets.worth.filter((r) => r.type === type).length} open`,
      })),
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// P1 — the client-executes checklist, verified against change history.
// ---------------------------------------------------------------------------

function clientChecklist(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.client_executes_checklist;
  const profile = d.profile;
  if (!profile?.client_executes) return;
  if (profile.checklist.length === 0) {
    d.abstain(rule, null, 'the client runs this account but no checklist is stored for it.');
    return;
  }
  const changes = d.google.changes;
  const campaigns = d.google.campaigns ?? [];
  const adGroups = d.google.ad_groups ?? [];
  const items = profile.checklist.map((item) => {
    if (!changes) {
      return { label: item.label, status: null, detail: 'change history was not read this cycle' };
    }
    const v = item.verify;
    const isGroup = v.resource_type === 'AD_GROUP';
    const idOf = (ch: (typeof changes)[number]) => (isGroup ? ch.ad_group_id : ch.campaign_id);
    // An entity created after the agreement did not exist when it was agreed: nothing to undo.
    const createdAfter = new Set(
      changes
        .filter(
          (ch) =>
            ch.resource_type === v.resource_type &&
            ch.operation === 'CREATE' &&
            ch.changed_at.slice(0, 10) > item.agreed_on,
        )
        .map(idOf),
    );
    const targets = (
      isGroup
        ? adGroups
            .filter((g) =>
              v.name_contains ? mentions(g.name, v.name_contains) : g.status === 'ENABLED',
            )
            .map((g) => ({ id: g.ad_group_id, name: g.name }))
        : campaigns
            .filter((c) =>
              v.name_contains
                ? mentions(c.name, v.name_contains)
                : c.status === 'ENABLED' && c.channel_type === 'SEARCH',
            )
            .map((c) => ({ id: c.campaign_id, name: c.name }))
    ).filter((t) => v.name_contains || !createdAfter.has(t.id));
    const pattern = v.field_pattern ? new RegExp(v.field_pattern, 'i') : null;
    // Google names changed fields in camelCase (networkSettings.targetContentNetwork); a
    // pattern is written in the API's snake_case, so both spellings are tried.
    const fieldsOf = (fields: readonly string[]) =>
      `${fields.join(',')}|${fields.map((f) => f.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()).join(',')}`;
    // Removing a group stops it as surely as pausing it.
    const statusMatches = (status: string | null) =>
      !v.new_status ||
      status === v.new_status ||
      (v.new_status === 'PAUSED' && status === 'REMOVED');
    const matching = changes.filter(
      (ch) =>
        ch.resource_type === v.resource_type &&
        ch.changed_at.slice(0, 10) >= item.agreed_on &&
        (!pattern || pattern.test(fieldsOf(ch.changed_fields))) &&
        statusMatches(ch.new_status),
    );
    const done = targets.filter((t) => matching.some((ch) => idOf(ch) === t.id));
    if (targets.length === 0) {
      return {
        label: item.label,
        status: 'pending' as const,
        detail: v.name_contains
          ? `No ${isGroup ? 'ad group' : 'campaign'} named "${v.name_contains}" found`
          : 'Nothing to check it on',
      };
    }
    const status =
      done.length === targets.length
        ? ('done' as const)
        : done.length > 0
          ? ('partial' as const)
          : ('pending' as const);
    const last = matching
      .filter((ch) => done.some((t) => idOf(ch) === t.id))
      .map((ch) => ch.changed_at.slice(0, 10))
      .sort()
      .at(-1);
    return {
      label: item.label,
      status,
      detail:
        status === 'done'
          ? `Seen in change history on ${last}`
          : status === 'partial'
            ? `${done.length} of ${targets.length}: ${targets
                .filter((t) => !done.includes(t))
                .map((t) => t.name)
                .slice(0, 3)
                .join(', ')} still pending`
            : `Agreed ${item.agreed_on}; no matching change since`,
    };
  });
  const pending = items.filter((i) => i.status !== 'done').length;
  d.emit('client_executes_checklist', {
    campaign: null,
    subject: 'account',
    severity: pending > 0 ? 'medium' : 'low',
    reason: `Of the ${items.length} actions agreed with the client, ${items.length - pending} ${items.length - pending === 1 ? 'shows' : 'show'} in Google's change history and ${pending} ${pending === 1 ? 'does' : 'do'} not yet.`,
    card: {
      headline: `Client checklist: ${items.length - pending} of ${items.length} applied`,
      facts: [
        { label: 'Applied', value: String(items.filter((i) => i.status === 'done').length) },
        {
          label: 'Partly applied',
          value: String(items.filter((i) => i.status === 'partial').length),
        },
        { label: 'Pending', value: String(items.filter((i) => i.status === 'pending').length) },
      ],
      checklist: items,
      blocked: changes ? null : 'Change history was not read this cycle; statuses are unknown.',
    },
  });
}

// ---------------------------------------------------------------------------
// P2 — desktop vs mobile.
// ---------------------------------------------------------------------------

function deviceSplit(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.device_split;
  const rows = d.google.devices;
  if (!rows) {
    d.abstain(rule, null, 'the device split was not read this cycle.');
    return;
  }
  const by = new Map<string, { spend: number; clicks: number; conversions: number }>();
  for (const r of rows) {
    const row = by.get(r.device) ?? { spend: 0, clicks: 0, conversions: 0 };
    row.spend += r.totals.spend;
    row.clicks += r.totals.clicks;
    row.conversions += r.totals.conversions;
    by.set(r.device, row);
  }
  const mobile = by.get('MOBILE');
  const desktop = by.get('DESKTOP');
  if (!mobile || !desktop) return;
  const spend = sum([...by.values()], (x) => x.spend);
  if (mobile.conversions + desktop.conversions < DEVICE_MIN_CONVERSIONS || spend <= 0) return;
  const cpr = (x: { spend: number; conversions: number }) =>
    x.conversions > 0 ? x.spend / x.conversions : Number.POSITIVE_INFINITY;
  const [worse, better, worseName, betterName] =
    cpr(mobile) >= cpr(desktop)
      ? [mobile, desktop, 'Mobile', 'Desktop']
      : [desktop, mobile, 'Desktop', 'Mobile'];
  if (
    cpr(worse) < DEVICE_COST_MULTIPLE * cpr(better) ||
    worse.spend / spend < DEVICE_MIN_SPEND_SHARE
  )
    return;
  const text = (x: typeof mobile) =>
    `${x.clicks} clicks · ${x.conversions.toFixed(0)} conv · ${x.conversions > 0 ? `${money(d.run, x.spend / x.conversions)} each` : 'no conversion'}`;
  d.emit('device_split', {
    campaign: null,
    subject: 'account',
    severity: 'high',
    reason: `${worseName} takes ${pct(worse.spend / spend)} of the spend and converts ${worse.conversions.toFixed(0)} times; ${betterName.toLowerCase()} converts ${better.conversions.toFixed(0)} times on ${pct(better.spend / spend)}. Lower the ${worseName.toLowerCase()} bid adjustment, or bid more on ${betterName.toLowerCase()}.`,
    card: {
      headline: `${worseName} spends, ${betterName.toLowerCase()} converts`,
      facts: [
        { label: betterName, value: text(better) },
        { label: worseName, value: text(worse) },
      ],
      bars: [
        {
          label: betterName,
          value: round2(better.spend),
          share: round2(better.spend / spend),
          target_share: null,
          flagged: false,
        },
        {
          label: worseName,
          value: round2(worse.spend),
          share: round2(worse.spend / spend),
          target_share: null,
          flagged: true,
        },
      ],
      unit: 'money',
      checklist: [
        {
          label: `Set a ${worseName.toLowerCase()} bid adjustment of −50% to start`,
          status: null,
          detail: null,
        },
        {
          label: `Or raise the ${betterName.toLowerCase()} bid adjustment`,
          status: null,
          detail: null,
        },
      ],
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// P4 — spend per course line against the agreed split.
// ---------------------------------------------------------------------------

function courseLineSplit(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.course_line_split;
  const lines = d.profile?.course_lines;
  if (!lines || lines.length === 0) {
    d.abstain(rule, null, 'no course lines or agreed split are stored for this account.');
    return;
  }
  const campaigns = d.google.campaigns;
  if (!campaigns) {
    d.abstain(rule, null, 'the campaign block was not read this cycle.');
    return;
  }
  const lineOfName = (name: string) =>
    lines.find((l) => l.name_patterns.some((p) => mentions(name, p)));
  const spend = new Map<string, { spend: number; conversions: number }>(
    lines.map((l) => [l.id, { spend: 0, conversions: 0 }]),
  );
  let unassigned = 0;
  const groups = new Map(d.google.ad_groups?.map((g) => [g.ad_group_id, g]) ?? []);
  const add = (id: string, s: number, c: number) => {
    const row = spend.get(id)!;
    row.spend += s;
    row.conversions += c;
  };
  const mixed: string[] = [];
  for (const c of campaigns.filter((x) => x.totals.spend > 0)) {
    const byId = lines.find((l) => l.campaign_ids.includes(c.campaign_id));
    const line = byId ?? lineOfName(c.name);
    if (line) {
      add(line.id, c.totals.spend, c.totals.conversions);
      continue;
    }
    // A campaign that sells several lines is split by ad group name, on keyword spend.
    mixed.push(c.name);
    let assigned = 0;
    const byGroup = new Map<string, { spend: number; conversions: number }>();
    for (const k of d.google.keywords.filter(
      (k) => k.campaign_id === c.campaign_id && !k.negative,
    )) {
      const row = byGroup.get(k.ad_group_id) ?? { spend: 0, conversions: 0 };
      row.spend += k.totals.spend;
      row.conversions += k.totals.conversions;
      byGroup.set(k.ad_group_id, row);
    }
    for (const [groupId, totals] of byGroup) {
      const groupLine = lineOfName(groups.get(groupId)?.name ?? '');
      if (!groupLine) continue;
      add(groupLine.id, totals.spend, totals.conversions);
      assigned += totals.spend;
    }
    unassigned += Math.max(0, c.totals.spend - assigned);
  }
  const assignedTotal = sum([...spend.values()], (x) => x.spend);
  const total = assignedTotal + unassigned;
  if (total <= 0) return;
  if (assignedTotal / total < LINE_MIN_ASSIGNED) {
    d.abstain(
      rule,
      null,
      `only ${pct(assignedTotal / total)} of the spend maps to a course line; correct the line map.`,
    );
    return;
  }
  const rows = lines.map((l) => {
    const row = spend.get(l.id)!;
    return { line: l, ...row, share: row.spend / assignedTotal };
  });
  const off = rows.filter((r) => Math.abs(r.share - r.line.target_share) >= LINE_MAX_DEVIATION);
  if (off.length === 0) return;
  d.emit('course_line_split', {
    campaign: null,
    subject: 'account',
    severity: 'medium',
    reason: `Spend by course line is off the agreed split: ${off.map((r) => `${r.line.name} ${pct(r.share)} vs ${pct(r.line.target_share)}`).join('; ')}.${mixed.length ? ` ${mixed.join(', ')} mixes several lines in one campaign, split here by ad group.` : ''}`,
    card: {
      headline: 'Spend by course line vs the agreed split',
      facts: [
        ...rows.map((r) => ({
          label: r.line.name,
          value: `${money(d.run, r.spend)} · ${r.conversions.toFixed(0)} conv · ${r.conversions > 0 ? `${money(d.run, r.spend / r.conversions)} each` : 'no conversion'}`,
        })),
        ...(unassigned > 0
          ? [{ label: 'Not mapped to a line', value: money(d.run, unassigned) }]
          : []),
      ],
      bars: rows.map((r) => ({
        label: r.line.name,
        value: round2(r.spend),
        share: round2(r.share),
        target_share: r.line.target_share,
        flagged: off.includes(r),
      })),
      unit: 'money',
      checklist: [
        ...off.map((r) => ({
          label: `${r.share > r.line.target_share ? 'Lower' : 'Raise'} ${r.line.name} toward ${pct(r.line.target_share)}`,
          status: null,
          detail: `${pct(r.share)} today`,
        })),
        ...(mixed.length
          ? [
              {
                label: `Split ${mixed.join(', ')} so each line has its own budget`,
                status: null,
                detail: null,
              },
            ]
          : []),
      ],
      blocked: null,
    },
  });
}

// ---------------------------------------------------------------------------
// P5 — from lead to sale, plus the Quality Score of the core keywords.
// ---------------------------------------------------------------------------

export const FUNNEL_BLOCKED =
  'Lead → sale in GoHighLevel → WooCommerce: no connector exists yet (Backend, MCP and Supabase searched 2026-10-29). This card uses Google’s own sale conversion and GA4 when it is linked.';

function leadToSale(d: Detectors) {
  const rule = ACCOUNT_DETECTOR_RULES.lead_to_sale_funnel;
  const actions = d.google.conversion_actions;
  if (!actions) {
    d.abstain(rule, null, 'the conversion actions were not read this cycle.');
    return;
  }
  const allOf = (a: ConversionAction) => sum(a.by_campaign, (c) => c.all);
  const saleActions = actions.filter(isSale);
  if (saleActions.length === 0) {
    d.abstain(
      rule,
      null,
      'the account tracks no sale conversion; a lead cannot be followed to a sale.',
    );
    return;
  }
  const leads = sum(actions.filter(isLead), allOf);
  const sales = sum(saleActions, allOf);
  const value = sum(saleActions, (a) => sum(a.by_campaign, (c) => c.value));
  const spend = accountSpend(d.google) ?? 0;
  if (leads < FUNNEL_MIN_LEADS || spend <= 0) return;
  if (sales <= 0) {
    // Zero sales cannot tell "the leads do not buy" from "the sale is not measured".
    d.abstain(
      rule,
      null,
      `the sale action recorded nothing in the window beside ${leads.toFixed(0)} leads; check the sale tracking before judging the leads.`,
    );
    return;
  }
  const roas = value / spend;
  if (sales / leads > FUNNEL_MAX_SALE_RATE || roas >= 1) return;
  const clicks = d.google.campaigns ? sum(d.google.campaigns, (c) => c.totals.clicks) : null;
  const lowQs = lowQualityKeywords(d.google)
    .sort((a, b) => b.totals.spend - a.totals.spend)
    .slice(0, 3);
  d.emit('lead_to_sale_funnel', {
    campaign: null,
    subject: 'account',
    severity: 'high',
    reason: `${leads.toFixed(0)} leads became ${sales.toFixed(0)} ${sales === 1 ? 'sale' : 'sales'} worth ${money(d.run, value)} on ${money(d.run, spend)} of spend (ROAS ${roas.toFixed(2)}). The lead count looks fine; the leads do not buy.${lowQs.length ? ` Core keywords score low on Quality: ${lowQs.map((k) => `"${k.text}" QS ${k.quality_score}`).join(', ')}.` : ''}`,
    card: {
      headline: 'Leads that do not become sales',
      facts: [
        ...(clicks !== null ? [{ label: 'Clicks', value: String(clicks) }] : []),
        { label: 'Leads', value: leads.toFixed(0) },
        { label: 'Sales', value: `${sales.toFixed(0)} · ${money(d.run, value)}` },
        { label: 'ROAS', value: roas.toFixed(2) },
        ...lowQs.map((k) => ({ label: `"${k.text}"`, value: `QS ${k.quality_score}` })),
      ],
      bars: [
        ...(clicks !== null
          ? [{ label: 'Clicks', value: clicks, share: null, target_share: null, flagged: false }]
          : []),
        { label: 'Leads', value: round2(leads), share: null, target_share: null, flagged: false },
        { label: 'Sales', value: round2(sales), share: null, target_share: null, flagged: true },
      ],
      unit: 'count',
      checklist: [
        {
          label: 'Judge campaigns on sales, not leads, once the sale is measured',
          status: null,
          detail: null,
        },
        ...(lowQs.length
          ? [
              {
                label: 'One landing page per course for the low-score keywords',
                status: null,
                detail: lowQs.map((k) => k.text).join(', '),
              },
            ]
          : []),
      ],
      blocked: FUNNEL_BLOCKED,
    },
  });
}

// ---------------------------------------------------------------------------
// Entry point, called once from evaluatePlatformSignals after the platform rules.
// ---------------------------------------------------------------------------

const P8_BLOCKS = [
  'profile',
  'conversion_actions',
  'campaigns',
  'account_daily',
  'devices',
  'recommendations',
  'ad_groups',
  'changes',
] as const satisfies readonly (keyof Google)[];

/** Runs the fifteen P8 detectors over one Google account's signals. */
export function evaluateAccountDetectors(run: Run, google: Google): void {
  // A read from before P8 carries none of these blocks: nothing was asked, nothing to say.
  if (P8_BLOCKS.every((block) => google[block] === undefined)) return;
  const d = new Detectors(run, google);
  const inflation = inflatedPrimary(d);
  brandVsNonBrand(d);
  cappedBudgetLocked(d, inflation);
  pmaxRescue(d);
  qualityScoreByService(d);
  continuityCalendar(d);
  pausedBeatActive(d, inflation);
  conversionValueMap(d);
  const competitors = competitorTerms(d);
  googleRecommendations(d);
  clientChecklist(d);
  deviceSplit(d);
  intentNegatives(d, competitors);
  courseLineSplit(d);
  leadToSale(d);
}
