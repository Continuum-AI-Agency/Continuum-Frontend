import type { useTranslations } from 'next-intl';
import { localizeNodeOptionCopy } from '@/CampaignCanvas/types/nodeOptionPresentation';
import type { UiLocale } from '@/i18n/config';

type ScaffoldText = ReturnType<typeof useTranslations<'scale'>>;
const scaffoldCopyKeys = {
  'Composed from your ad-naming schema, like the ad set name.': 'scaffoldDetail_89c7bd235b',
  'This may exist on Meta without a recorded id. A human must read the ad account before anything is retried — a retry would create duplicates.':
    'this_may_exist_on_meta_without_a_recorded_id__d199591',
  Unconfirmed: 'scaffoldDetail_3229d16ca6',
  Failed: 'failed_031a8f0',
  Active: 'active_9234069',
  Activating: 'scaffoldDetail_d7b77185af',
  'Created (paused)': 'created_paused_43e735c',
  Creating: 'scaffoldDetail_3b951ebd7c',
  'Not created': 'not_created_1d18277',
  'Optimizing for': 'optimizing_for_2378092',
  Funnel: 'scaffoldDetail_fc063af055',
  Placement: 'scaffoldDetail_4df9939944',
  'Meta id': 'scaffoldDetail_12b0559fe9',
  'Creative id': 'scaffoldDetail_1e96b8128f',
  'Placeholder budget': 'scaffoldDetail_47769b2c83',
  'Compiled from the audience group this ad set points at.': 'scaffoldDetail_262774eb42',
  'Group attached, targeting not compiled yet': 'scaffoldDetail_07467db337',
  'Its audiences are not published to Meta yet, so no targeting could be compiled. The build step will refuse until they are.':
    'scaffoldDetail_7e85f331d7',
  'Declared on the scaffold version; it cannot vary per node.': 'scaffoldDetail_65d3b1a417',
  'uploaded to Meta': 'scaffoldDetail_f513ddaddf',
  'attached, not uploaded': 'scaffoldDetail_b8d8bcdc19',
  'Not attached yet': 'scaffoldDetail_5c7a75f593',
  'Attach one before the populate step.': 'scaffoldDetail_c66a23686a',
  'Composed from your brand ad-naming schema and asserted to round-trip. Editing it by hand would break the link back to the components in analytics.':
    'scaffoldDetail_4114c0bcc4',
  'No measured CPA on this account, so build uses the placeholder budget.':
    'scaffoldDetail_477f7da74a',
  "Sized at propose time from the account's measured CPA.": 'scaffoldDetail_33a018bb97',
  'A pure function of the optimization goal \u2014 it is not chosen separately.':
    'scaffoldDetail_e760bc4ba6',
  'Computed from the optimization goal at build time.': 'scaffoldDetail_1b67218331',
  'Compiled from an audience group at build time.': 'scaffoldDetail_a8f348f6a9',
  'Derived from your brand setup and the campaign objective. Shown for review; it is not edited here.':
    'scaffoldDetail_1b37ed33e0',
  Status: 'status_920e413',
  'Ad set': 'ad_set_639a64f',
  Product: 'product_fb9ef89',
  Angle: 'angle_1968034',
  Optimization: 'scaffoldDetail_72244ea575',
  Billing: 'scaffoldDetail_3ac8bbca9a',
  Targeting: 'targeting_dfa4ae5',
  Ads: 'ads_9210f3b',

  'App promotion': 'scaffoldCopy_c0b2a5b322',
  'Meta insights': 'scaffoldCopy_6120417f2f',
  'Meta minimum': 'scaffoldCopy_6a05ad1b82',
  'Meta reach estimate': 'scaffoldCopy_244338197c',
  'Angle evidence': 'scaffoldCopy_b1503739b9',
  Derived: 'scaffoldCopy_10809b749b',
  'Edited on canvas': 'scaffoldCopy_10159e293f',
  Measured: 'scaffoldCopy_9298c8f4b3',
  Edited: 'scaffoldCopy_7117f08071',
  'Broad targeting': 'scaffoldCopy_ad5c99ed03',
  Sales: 'canvasOption_2',
  Leads: 'leads_2f10a26',
  Engagement: 'canvasOption_1',
  Awareness: 'canvasOption_0',
  Traffic: 'traffic_4876efb',
  'Audience group': 'audience_group_8171c17',
  Budget: 'optimizer_moduleBudget',
  Objective: 'objective_3b20adc',
  Audience: 'optimizer_moduleAudience',
  Creative: 'creative_2c7e633',
  Optimizer: 'optimizer_2ee6172',
  'This version predates one-click deploy. Open it on the canvas and save it as a new version to deploy it.':
    'this_version_predates_one_click_deploy_open_i_929d1e5',
  'This version was proposed before one-click deploy existed. Ask Jaina to propose it again.':
    'this_version_was_proposed_before_one_click_de_e2dec70',
  Name: 'name_dcd1d52',
  'Campaign budget (CBO)': 'campaign_budget_cbo_b9adab7',
  'Ad set budgets (ABO)': 'ad_set_budgets_abo_0dd9a54',
  'Campaign daily budget': 'campaign_daily_budget_6d17831',
  'Bid strategy': 'bid_strategy_43f45e0',
  'Optimization goal': 'optimization_goal_b5f886f',
  'Optimization event': 'optimization_event_e58c5e6',
  'From the objective': 'from_the_objective_cda1f7f',
  Pixel: 'pixel_5817280',
  "The account's pixel": 'the_account_s_pixel_2e0ceb1',
  'Daily budget': 'daily_budget_7b0a1f0',
  Location: 'location_15b6197',
  'From the audience group': 'from_the_audience_group_c64b220',
  Placements: 'placements_af9851e',
  Schedule: 'schedule_f4830a1',
  Image: 'image_1aa4cb0',
  Video: 'video_d534be8',
  Carousel: 'carousel_37219fb',
  'Primary text': 'primary_text_ecf5b5b',
  Headline: 'headline_c5f5a4c',
  URL: 'url_e7a241d',
  'URL tags (UTM)': 'url_tags_utm_1ff3616',
  None: 'none_dc937b5',
  'Not set yet': 'not_set_yet_488c9a6',
  'Set by the campaign': 'set_by_the_campaign_ab9c93e',
} as const;
export function localizeScaffoldCopy(source: string, translate: ScaffoldText): string {
  return Object.hasOwn(scaffoldCopyKeys, source)
    ? translate(scaffoldCopyKeys[source as keyof typeof scaffoldCopyKeys])
    : source;
}

/** A campaign copy's audience: the contract's English label, or its words in the UI language. */
const copiedAudienceLabel = (sourceAdSetName: string, translate?: ScaffoldText): string =>
  translate
    ? translate('copied_from_name_111b01f', { name: sourceAdSetName })
    : paidScaffoldCopiedAudienceLabel(sourceAdSetName);

// What the scaffold card SAYS, derived in one pure place from the typed plan and the node rows.
//
// The plan (`PaidScaffoldPlan`, the same object the proposal frame carries and
// `manifest.plan` persists) is the authority on what was decided and why. The rows are the
// authority on what is attached right now — creative is attached AFTER propose, so "has this ad
// got a creative" is a row question, never a plan one. Both are read here so the card, its test
// and the bench all grade one derivation.

import {
  effectiveFieldProvenance,
  type FieldProvenance,
  type PaidScaffoldAudience,
  type PaidScaffoldBidPlan,
  type PaidScaffoldEvidence,
  type PaidScaffoldEvidenceMetric,
  type PaidScaffoldPlan,
  paidScaffoldCopiedAudienceLabel,
} from '@continuum/contracts';
import {
  bidStrategyLabel,
  conversionEventLabel,
  OPTIMIZATION_GOALS,
  placementLabels,
} from '@/CampaignCanvas/types/nodeOptions';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import {
  openingDailyBudgetOf,
  type PaidScaffoldNodeRow,
  type ScaffoldTree,
  scaffoldBlockersOf,
  targetingSummary,
} from '@/lib/paid-media/scaffoldTree';
import { formatCampaignBudgetShare, formatDailyBudget } from './scaffoldBudget';

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_SALES: 'Sales',
  OUTCOME_LEADS: 'Leads',
  OUTCOME_ENGAGEMENT: 'Engagement',
  OUTCOME_AWARENESS: 'Awareness',
  OUTCOME_TRAFFIC: 'Traffic',
  OUTCOME_APP_PROMOTION: 'App promotion',
};

export const objectiveLabel = (
  objective: string | null | undefined,
  translate?: ScaffoldText,
): string => {
  if (!objective) return '—';
  const label = OBJECTIVE_LABELS[objective] ?? objective;
  return translate && OBJECTIVE_LABELS[objective] ? localizeScaffoldCopy(label, translate) : label;
};

const SOURCE_LABELS: Record<string, string> = {
  meta_insights: 'Meta insights',
  meta_minimum_budgets: 'Meta minimum',
  meta_reachestimate: 'Meta reach estimate',
  audience_group: 'Audience group',
  angle_evidence: 'Angle evidence',
  derived: 'Derived',
  user: 'Edited on canvas',
};

export const sourceLabel = (source: string, translate?: ScaffoldText): string => {
  const label = SOURCE_LABELS[source];
  return label
    ? translate
      ? localizeScaffoldCopy(label, translate)
      : label
    : source.replace(/_/g, ' ');
};

/** `last_30d` → `last 30d`. The window is shown as given, never re-derived. */
export const windowLabel = (window: string | null, translate?: ScaffoldText): string | null => {
  if (!window) return null;
  const days = /^last_(\d+)d$/.exec(window);
  return days && translate
    ? translate('scaffoldWindowDays', { count: Number(days[1]) })
    : window.replace(/_/g, ' ');
};

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const localizedNumbers = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: UiLocale, compact = false): Intl.NumberFormat {
  if (locale === 'en') return compact ? COMPACT : NUMBER;
  const key = `${locale}:${compact}`;
  let formatter = localizedNumbers.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      ...(compact ? { notation: 'compact' } : {}),
      maximumFractionDigits: compact ? 1 : 2,
    });
    localizedNumbers.set(key, formatter);
  }
  return formatter;
}

/** A 3-letter upper-case unit is a currency; anything else prints beside the number. */
export const formatMetricValue = (
  metric: PaidScaffoldEvidenceMetric,
  locale: UiLocale = 'en',
): string => {
  const { value, unit } = metric;
  if (typeof value === 'string') return unit ? `${value} ${unit}` : value;
  if (unit && /^[A-Z]{3}$/.test(unit)) return formatCurrency(value, unit, locale);
  const shown =
    Math.abs(value) >= 100_000
      ? numberFormat(locale, true).format(value)
      : numberFormat(locale).format(value);
  return unit ? `${shown} ${unit}` : shown;
};

export const DECISION_LABELS: Record<PaidScaffoldEvidence['decision'], string> = {
  budget: 'Budget',
  objective: 'Objective',
  audience: 'Audience',
  creative: 'Creative',
  optimizer: 'Optimizer',
};

export const PROVENANCE_LABELS: Record<PaidScaffoldEvidence['provenance'], string> = {
  server: 'Measured',
  model: 'Jaina',
  user: 'Edited',
};

export const formatReach = (
  reach: { lower: number; upper: number } | null,
  translate?: ScaffoldText,
  locale: UiLocale = 'en',
): string | null => {
  if (!reach) return null;
  const lower = numberFormat(locale, true).format(reach.lower),
    upper = numberFormat(locale, true).format(reach.upper);
  return translate
    ? translate('scaffoldReachRange', { lower, upper, count: reach.upper })
    : `${lower}–${upper} people`;
};

/** One audience as the card lists it, with every ad set it feeds. */
export type AudienceLine = {
  key: string;
  name: string;
  kind: PaidScaffoldAudience['kind'];
  summary: string | null;
  members: string[];
  memberCount: number;
  reach: string | null;
  adSets: string[];
};

/** Distinct audiences — a group shared by three ad sets is ONE audience, listed once. */
export const audienceLinesOf = (
  plan: PaidScaffoldPlan,
  translate?: ScaffoldText,
  locale: UiLocale = 'en',
): AudienceLine[] => {
  const byKey = new Map<string, AudienceLine>();
  for (const adSet of plan.adsets) {
    const audience = adSet.audience;
    const key =
      audience.kind === 'group'
        ? `group:${audience.group_version_id}`
        : audience.kind === 'copied'
          ? `copied:${audience.source_adset_id}`
          : `broad:${audience.targeting_summary}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.adSets.push(adSet.name);
      continue;
    }
    byKey.set(key, {
      key,
      name:
        audience.kind === 'group'
          ? (audience.group_name ??
            (translate ? localizeScaffoldCopy('Audience group', translate) : 'Audience group'))
          : audience.kind === 'copied'
            ? copiedAudienceLabel(audience.source_adset_name, translate)
            : translate
              ? localizeScaffoldCopy('Broad targeting', translate)
              : 'Broad targeting',
      kind: audience.kind,
      summary: audience.targeting_summary,
      members: audience.kind === 'group' ? audience.members.map((member) => member.label) : [],
      memberCount: audience.kind === 'group' ? audience.member_count : 0,
      reach: formatReach(audience.reach, translate, locale),
      adSets: [adSet.name],
    });
  }
  return [...byKey.values()];
};

/** One ad's creative as the card shows it: the rows first (current), the plan second. */
export type CreativeTile = {
  pathKey: string;
  adName: string;
  format: 'image' | 'video' | 'carousel' | null;
  thumbnails: string[];
  /**
   * The still to sign when no thumbnail is stored — true of every creative a canvas save
   * or an attach placed, since only a deploy records one. Never a video: its signed URL is
   * the film, not a picture.
   */
  previewAssetId: string | null;
  cardCount: number;
  /** A campaign copy's ad: the source ad's own Meta creative, which it is created on. */
  reusedCreativeId: string | null;
};

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const thumbOf = (record: Record<string, unknown>): string | null =>
  readString(record, 'thumbnail_url') ??
  readString(record, 'thumbnailUrl') ??
  (readString(record, 'kind') === 'video' ? null : readString(record, 'url'));

export const creativeTilesOf = (
  tree: ScaffoldTree | null,
  plan: PaidScaffoldPlan | null,
): CreativeTile[] => {
  const planned = new Map((plan?.ads ?? []).map((ad) => [ad.path_key, ad]));
  const ads = tree?.adSets.flatMap((adSet) => adSet.ads) ?? [];
  if (ads.length === 0) {
    return (plan?.ads ?? []).map((ad) => ({
      pathKey: ad.path_key,
      adName: ad.name,
      format: ad.creative?.format ?? null,
      thumbnails: [],
      previewAssetId:
        ad.creative && ad.creative.format !== 'video'
          ? (ad.creative.cards[0]?.asset_id ?? null)
          : null,
      cardCount: ad.creative?.cards.length ?? 0,
      reusedCreativeId: null,
    }));
  }
  return ads.map((ad) => {
    const media = ad.creativeMedia ?? {};
    const cards = Array.isArray(media.cards)
      ? media.cards.filter(
          (card): card is Record<string, unknown> => typeof card === 'object' && card !== null,
        )
      : [];
    const kind = readString(media, 'kind');
    const plannedCreative = planned.get(ad.pathKey)?.creative ?? null;
    const attached = Boolean(ad.creativeAssetId || ad.creativeMedia);
    const format: CreativeTile['format'] =
      kind === 'carousel' || kind === 'video' || kind === 'image'
        ? kind
        : attached
          ? 'image'
          : (plannedCreative?.format ?? null);
    return {
      pathKey: ad.pathKey,
      adName: ad.name,
      format: attached ? format : null,
      thumbnails: (cards.length > 0 ? cards.map(thumbOf) : [thumbOf(media)]).filter(
        (url): url is string => Boolean(url),
      ),
      previewAssetId:
        attached && format !== 'video'
          ? (cards.map((card) => readString(card, 'asset_id')).find(Boolean) ??
            ad.creativeAssetId ??
            null)
          : null,
      cardCount: cards.length > 0 ? cards.length : attached ? 1 : 0,
      reusedCreativeId: ad.sourceCreativeId ?? null,
    };
  });
};

/** The six figures on the strip. `null` renders as a named absence, never as zero. */
export type ScaffoldSummary = {
  objective: string;
  dailyBudgetMinorUnits: number | null;
  /** CBO: the figure is the campaign's one budget, not a sum over ad sets. */
  budgetHeldByCampaign: boolean;
  currency: string | null;
  conversionsPerDay: number | null;
  cpa: number | null;
  audiences: number;
  creatives: number;
  ads: number;
  optimizer: string | null;
};

const optimizerLabel = (plan: PaidScaffoldPlan, translate?: ScaffoldText): string => {
  const { apply_mode: mode, autopilot_scopes: scopes } = plan.optimizer_enrollment;
  const autopilotOn = Object.values(scopes).some(Boolean);
  return translate
    ? translate('scaffoldOptimizerMode', { mode, enabled: String(autopilotOn) })
    : `${mode === 'recommend' ? 'Recommend' : 'Observe'} · autopilot ${autopilotOn ? 'on' : 'off'}`;
};

export const scaffoldSummaryOf = (
  plan: PaidScaffoldPlan | null,
  tree: ScaffoldTree | null,
  fallbackCurrency: string | null,
  translate?: ScaffoldText,
  locale: UiLocale = 'en',
): ScaffoldSummary => {
  const tiles = creativeTilesOf(tree, plan);
  if (plan) {
    return {
      objective: objectiveLabel(plan.objective, translate),
      dailyBudgetMinorUnits: plan.expected.daily_budget_minor_units,
      budgetHeldByCampaign: plan.budget_mode === 'cbo',
      currency: plan.expected.currency ?? plan.currency ?? fallbackCurrency,
      conversionsPerDay: plan.expected.conversions_per_day,
      cpa: plan.expected.cpa,
      audiences: audienceLinesOf(plan, translate, locale).length,
      creatives: tiles.filter((tile) => tile.format !== null || tile.reusedCreativeId).length,
      ads: tiles.length,
      optimizer: optimizerLabel(plan, translate),
    };
  }
  const objective = tree?.campaign?.choices.objective ?? null;
  const budget = tree ? openingDailyBudgetOf(tree) : null;
  const groups = new Set(
    (tree?.adSets ?? [])
      .map((adSet) => adSet.derived.audienceGroupVersionId)
      .filter((id): id is string => Boolean(id)),
  );
  return {
    objective: objectiveLabel(objective, translate),
    dailyBudgetMinorUnits: budget && budget.placeholders === 0 ? budget.totalMinorUnits : null,
    budgetHeldByCampaign: Boolean(tree?.campaign?.budget),
    currency: fallbackCurrency,
    conversionsPerDay: null,
    cpa: null,
    audiences: groups.size,
    creatives: tiles.filter((tile) => tile.format !== null || tile.reusedCreativeId).length,
    ads: tiles.length,
    optimizer: null,
  };
};

/** Something that keeps "Deploy paused" disabled, said in the words a person acts on. */
export type DeployBlocker = { code: string; message: string };

export const deployBlockersOf = (params: {
  plan: PaidScaffoldPlan | null;
  /** False until the version row has been read — absence of a plan means nothing before that. */
  planLoaded: boolean;
  tree: ScaffoldTree | null;
  contentHash: string | null;
  translate?: ScaffoldText;
}): DeployBlocker[] => {
  const { plan, planLoaded, tree, contentHash, translate } = params;
  const blockers: DeployBlocker[] = [];
  if (planLoaded && !plan) {
    // The deploy compiles from the typed plan; the Backend refuses a version without one.
    blockers.push({
      code: 'no_plan',
      message: translate
        ? localizeScaffoldCopy(
            'This version predates one-click deploy. Open it on the canvas and save it as a new version to deploy it.',
            translate,
          )
        : 'This version predates one-click deploy. Open it on the canvas and save it as a new version to deploy it.',
    });
  }
  if (!contentHash) {
    blockers.push({
      code: 'no_content_hash',
      message: translate
        ? localizeScaffoldCopy(
            'This version was proposed before one-click deploy existed. Ask Jaina to propose it again.',
            translate,
          )
        : 'This version was proposed before one-click deploy existed. Ask Jaina to propose it again.',
    });
  }
  // One line per distinct refusal: the compiler raises the same one per ad set, and a list that
  // repeats itself reads as more wrong than it is.
  const repeats = new Map<string, { code: string; message: string; count: number }>();
  for (const blocker of plan?.blockers ?? []) {
    const key = `${blocker.code}:${blocker.message}`;
    const seen = repeats.get(key);
    if (seen) seen.count += 1;
    else repeats.set(key, { code: blocker.code, message: blocker.message, count: 1 });
  }
  for (const { code, message, count } of repeats.values()) {
    blockers.push({
      code,
      message:
        count > 1
          ? translate
            ? translate('scaffoldRepeatedBlocker', { message, count })
            : `${message} (${count} ad sets)`
          : message,
    });
  }
  if (tree) {
    const { adSetsWithoutAudience, adsWithoutCreative } = scaffoldBlockersOf(tree);
    if (adSetsWithoutAudience.length > 0) {
      const named = adSetsWithoutAudience.slice(0, 3).join(', ');
      const more = adSetsWithoutAudience.length - 3;
      blockers.push({
        code: 'adset_without_audience',
        message: translate
          ? translate('scaffoldAudienceBlocker', {
              count: adSetsWithoutAudience.length,
              names: named,
              more: Math.max(0, more),
            })
          : `${adSetsWithoutAudience.length} ad set${adSetsWithoutAudience.length === 1 ? ' has' : 's have'} no audience (${named}${more > 0 ? ` +${more} more` : ''}). Pick a published audience group or broad targeting on the canvas.`,
      });
    }
    if (adsWithoutCreative > 0) {
      blockers.push({
        code: 'ad_without_creative',
        message: translate
          ? translate('scaffoldCreativeBlocker', { count: adsWithoutCreative })
          : `${adsWithoutCreative} ad${adsWithoutCreative === 1 ? ' has' : 's have'} no creative attached. Add one from the Library on the canvas.`,
      });
    }
  }
  return blockers;
};

// ---------------------------------------------------------------------------
// Every field, with who supplied it (P5)
// ---------------------------------------------------------------------------

/** One field as the card lists it. `value` is already worded; `key` is the draft-node key. */
export type ScaffoldFieldLine = {
  key: string;
  label: string;
  value: string;
  provenance: FieldProvenance;
};

export type ScaffoldFieldGroup = {
  pathKey: string;
  level: PaidScaffoldNodeRow['level'];
  name: string;
  lines: ScaffoldFieldLine[];
};

/** What a field with no value reads as — the open question its 'Jaina asks' pill names. */
export const NOT_SET = 'Not set yet';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const DATE_TIME = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const localizedDateTimes = new Map<UiLocale, Intl.DateTimeFormat>();

const dateTimeLabel = (iso: string, locale: UiLocale): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (locale === 'en') return DATE_TIME.format(date);
  let formatter = localizedDateTimes.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
    localizedDateTimes.set(locale, formatter);
  }
  return formatter.format(date);
};

/** "Starts Jan 1, 2099, 12:00 PM · no end date". Null on both ends is the default, said in words. */
export const scheduleLabel = (
  start: string | null,
  end: string | null,
  translate?: ScaffoldText,
  locale: UiLocale = 'en',
): string => {
  const starts = start
    ? translate
      ? translate('starts_date_2b2a96f', { date: dateTimeLabel(start, locale) })
      : `Starts ${dateTimeLabel(start, locale)}`
    : translate
      ? translate('starts_when_activated_efdf093')
      : 'Starts when activated';
  const ends = end
    ? translate
      ? translate('ends_date_c41d279', { date: dateTimeLabel(end, locale) })
      : `ends ${dateTimeLabel(end, locale)}`
    : translate
      ? translate('no_end_date_4cde242')
      : 'no end date';
  return `${starts} · ${ends}`;
};

/** A bid as one phrase: the strategy, then the amount or floor it needs. Null = uncapped. */
export const bidLabel = (
  bid: Pick<PaidScaffoldBidPlan, 'strategy' | 'bid_amount_minor_units' | 'roas_floor'> | null,
  currency: string | null,
  translate?: ScaffoldText,
  locale: UiLocale = 'en',
): string => {
  const label = bidStrategyLabel(bid?.strategy);
  const strategy = translate ? localizeNodeOptionCopy(label, translate) : label;
  if (typeof bid?.bid_amount_minor_units === 'number') {
    return `${strategy} · ${formatCurrency(bid.bid_amount_minor_units / 100, currency, locale)}`;
  }
  if (typeof bid?.roas_floor === 'number') return `${strategy} · ${bid.roas_floor}x`;
  return strategy;
};

const goalLabel = (goal: string | null, translate?: ScaffoldText): string | null => {
  const label = goal ? OPTIMIZATION_GOALS.find((entry) => entry.value === goal)?.label : undefined;
  if (!label) return goal;
  return translate ? localizeNodeOptionCopy(label, translate) : label;
};

/** A pixel event as a person reads it, in the UI language when a translator is given. */
const eventLabel = (event: string | null | undefined, translate?: ScaffoldText): string | null => {
  const label = conversionEventLabel(event);
  return label && translate ? localizeNodeOptionCopy(label, translate) : label;
};

/** Advantage+ or the manual surfaces, flattened the way the table and the canvas say them. */
const placementLabelOf = (payload: Record<string, unknown>, translate?: ScaffoldText): string => {
  const placement = asRecord(payload.placement);
  const strings = (key: string) =>
    Array.isArray(placement[key])
      ? (placement[key] as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : [];
  const labels =
    placement.mode === 'manual'
      ? placementLabels({
          placementMode: 'manual',
          publisherPlatforms: strings('publisher_platforms'),
          facebookPositions: strings('facebook_positions'),
          instagramPositions: strings('instagram_positions'),
          devicePlatforms: strings('device_platforms'),
        })
      : [];
  // A row with no placement choice builds on Meta's automatic placement.
  return labels.length > 0
    ? labels
        .map((label) => (translate ? localizeNodeOptionCopy(label, translate) : label))
        .join(', ')
    : 'Advantage+';
};

const FORMAT_LABELS = { image: 'Image', video: 'Video', carousel: 'Carousel' } as const;

/**
 * The card's field list: campaign, then each ad set followed by its ads. Values are the ROWS'
 * (what the version holds now; creative is attached after propose, so only a row knows it),
 * falling back to the plan for a row read before the P5 columns existed — the same precedence
 * the canvas hydrates with, so the card and the canvas agree on every value.
 *
 * Provenance is `effectiveFieldProvenance(recorded, hasValue)`. `hasValue` is whether the
 * field holds an ANSWER, which is not the same as non-null: a null bid is "lowest cost, no
 * cap", a null schedule is "starts when activated", a null event is "from the objective" —
 * decisions with a meaning. Only a null that leaves a hole (no budget figure, no audience, no
 * creative, no copy) is an open question Jaina asks.
 */
export const scaffoldFieldGroupsOf = (params: {
  plan: PaidScaffoldPlan | null;
  rows: readonly PaidScaffoldNodeRow[] | null;
  currency: string | null;
  /** Words the lines in the UI language; without it they read in English. */
  translate?: ScaffoldText;
  locale?: UiLocale;
}): ScaffoldFieldGroup[] => {
  const { plan, currency, translate } = params;
  const locale = params.locale ?? 'en';
  const word = (source: string): string =>
    translate ? localizeScaffoldCopy(source, translate) : source;
  const planAdSets = new Map((plan?.adsets ?? []).map((entry) => [entry.path_key, entry]));
  const planAds = new Map((plan?.ads ?? []).map((entry) => [entry.path_key, entry]));
  // No rows yet (a live frame before the read lands): the plan's own nodes, values and all.
  const rows: readonly Partial<PaidScaffoldNodeRow>[] =
    params.rows && params.rows.length > 0
      ? params.rows
      : plan
        ? [
            { level: 'campaign', pathKey: 'c0', name: '' },
            ...plan.adsets.flatMap((adSet) => [
              { level: 'adset' as const, pathKey: adSet.path_key, name: adSet.name },
              ...plan.ads
                .filter((ad) => ad.adset_path_key === adSet.path_key)
                .map((ad) => ({ level: 'ad' as const, pathKey: ad.path_key, name: ad.name })),
            ]),
          ]
        : [];
  const campaignRow = rows.find((row) => row.level === 'campaign');
  const cbo = (campaignRow?.budgetMode ?? plan?.budget_mode) === 'cbo';
  const campaignBid: PaidScaffoldBidPlan | null = (() => {
    const strategy = campaignRow?.bidStrategy ?? plan?.campaign_bid?.strategy ?? null;
    return strategy
      ? {
          strategy,
          bid_amount_minor_units:
            campaignRow?.bidAmountMinorUnits ?? plan?.campaign_bid?.bid_amount_minor_units ?? null,
          roas_floor: campaignRow?.roasFloor ?? plan?.campaign_bid?.roas_floor ?? null,
        }
      : null;
  })();

  const groupOf = (row: Partial<PaidScaffoldNodeRow>): ScaffoldFieldGroup => {
    const recorded = row.fieldProvenance ?? {};
    const lines: ScaffoldFieldLine[] = [];
    const add = (
      key: string,
      label: string,
      value: string | null,
      hasValue: boolean = value !== null,
      provenanceKeys: readonly string[] = [key],
    ) => {
      const stored = provenanceKeys.map((entry) => recorded[entry]).find(Boolean);
      lines.push({
        key,
        label,
        value: value ?? word(NOT_SET),
        provenance: effectiveFieldProvenance(stored, hasValue),
      });
    };
    const payload = asRecord(row.payload);
    const pathKey = row.pathKey ?? '';
    const name = row.name ?? '';
    add('name', word('Name'), name || null);

    if (row.level === 'campaign') {
      const objective = plan?.objective ?? (payload.objective as string | undefined) ?? null;
      add('objective', word('Objective'), objective ? objectiveLabel(objective, translate) : null);
      add(
        'budget_mode',
        word('Budget'),
        word(cbo ? 'Campaign budget (CBO)' : 'Ad set budgets (ABO)'),
        true,
      );
      if (cbo) {
        const figure =
          row.campaignDailyBudgetMinorUnits ?? plan?.campaign_daily_budget_minor_units ?? null;
        add(
          'campaign_daily_budget_minor_units',
          word('Campaign daily budget'),
          figure === null ? null : formatDailyBudget(figure, currency, translate, locale),
        );
        add(
          'bid_strategy',
          word('Bid strategy'),
          bidLabel(campaignBid, currency, translate, locale),
          true,
        );
      }
    }

    if (row.level === 'adset') {
      const planAdSet = planAdSets.get(pathKey);
      add(
        'optimization_goal',
        word('Optimization goal'),
        goalLabel(
          planAdSet?.optimization_goal ?? (payload.optimization_goal as string) ?? null,
          translate,
        ),
      );
      const promoted = planAdSet?.promoted_object ?? {};
      const event = eventLabel(row.customEventType, translate);
      const derivedEvent = eventLabel(promoted.custom_event_type, translate);
      add(
        'custom_event_type',
        word('Optimization event'),
        event ??
          (derivedEvent
            ? translate
              ? translate('event_from_the_objective_c4644c7', { event: derivedEvent })
              : `${derivedEvent} (from the objective)`
            : word('From the objective')),
        true,
      );
      add(
        'pixel_id',
        word('Pixel'),
        row.pixelId ?? promoted.pixel_id ?? word("The account's pixel"),
        true,
      );
      if (cbo) {
        add(
          'daily_budget_minor_units',
          word('Daily budget'),
          formatCampaignBudgetShare(
            {
              adSetCount: rows.filter((entry) => entry.level === 'adset').length,
              campaignDailyBudgetMinorUnits:
                campaignRow?.campaignDailyBudgetMinorUnits ??
                plan?.campaign_daily_budget_minor_units ??
                null,
            },
            currency,
            translate,
            locale,
          ),
          true,
        );
        const ownCap =
          typeof row.bidAmountMinorUnits === 'number'
            ? formatCurrency(row.bidAmountMinorUnits / 100, currency, locale)
            : null;
        add(
          'bid_strategy',
          word('Bid strategy'),
          ownCap === null
            ? word('Set by the campaign')
            : translate
              ? translate('set_by_the_campaign_own_cap_amount_fb3d1b1', { amount: ownCap })
              : `Set by the campaign · own cap ${ownCap}`,
          true,
        );
      } else {
        const figure = row.dailyBudgetMinorUnits ?? planAdSet?.daily_budget_minor_units ?? null;
        add(
          'daily_budget_minor_units',
          word('Daily budget'),
          figure === null ? null : formatDailyBudget(figure, currency, translate, locale),
        );
        const bid: PaidScaffoldBidPlan | null = row.bidStrategy
          ? {
              strategy: row.bidStrategy,
              bid_amount_minor_units: row.bidAmountMinorUnits ?? null,
              roas_floor: row.roasFloor ?? null,
            }
          : (planAdSet?.bid ?? null);
        add('bid_strategy', word('Bid strategy'), bidLabel(bid, currency, translate, locale), true);
      }
      const audience = planAdSet?.audience;
      const groupVersion =
        audience?.kind === 'group'
          ? audience.group_version_id
          : (payload.audience_group_version_id as string | undefined);
      const copied = audience?.kind === 'copied' ? audience : null;
      const broad =
        !copied && (audience?.kind === 'broad' || (!groupVersion && Boolean(payload.targeting)));
      const audienceKey = groupVersion ? 'audience_group_version_id' : 'broad_targeting';
      const audienceKeys = ['audience_group_version_id', 'broad_targeting'];
      add(
        audienceKey,
        word('Audience'),
        groupVersion
          ? audience?.kind === 'group'
            ? (audience.group_name ?? word('Audience group'))
            : word('Audience group')
          : copied
            ? copiedAudienceLabel(copied.source_adset_name, translate)
            : broad
              ? word('Broad targeting')
              : null,
        undefined,
        [audienceKey, ...audienceKeys],
      );
      const location =
        audience?.targeting_summary ?? targetingSummary(payload.targeting, translate, locale);
      add(
        'location',
        word('Location'),
        location ?? (groupVersion ? word('From the audience group') : null),
        undefined,
        [audienceKey, ...audienceKeys],
      );
      add('placement_mode', word('Placements'), placementLabelOf(payload, translate), true);
      add(
        'start_time',
        word('Schedule'),
        scheduleLabel(
          row.startTime ?? planAdSet?.schedule?.start_time ?? null,
          row.endTime ?? planAdSet?.schedule?.end_time ?? null,
          translate,
          locale,
        ),
        true,
        ['start_time', 'end_time'],
      );
    }

    if (row.level === 'ad') {
      const planAd = planAds.get(pathKey);
      const media = asRecord(row.creativeMedia);
      const kind = media.kind;
      const cards = Array.isArray(media.cards) ? media.cards.length : 0;
      const format =
        kind === 'carousel' || kind === 'video' || kind === 'image'
          ? kind
          : row.creativeAssetId
            ? 'image'
            : (planAd?.creative?.format ?? null);
      const cardCount = cards || planAd?.creative?.cards.length || 0;
      const reused =
        typeof payload.source_creative_id === 'string' ? payload.source_creative_id : null;
      add(
        'creative',
        word('Creative'),
        reused
          ? translate
            ? translate('the_source_ad_s_creative_id_469cba4', { id: reused })
            : `The source ad's creative · ${reused}`
          : format
            ? format === 'carousel'
              ? translate
                ? translate('carousel_count_plural_one_card_other_cards_8226239', {
                    count: cardCount,
                  })
                : `Carousel · ${cardCount} card${cardCount === 1 ? '' : 's'}`
              : word(FORMAT_LABELS[format])
            : null,
      );
      const creative = asRecord(payload.creative);
      const text = (key: string) =>
        typeof creative[key] === 'string' && (creative[key] as string).trim()
          ? (creative[key] as string)
          : null;
      add('message', word('Primary text'), text('message'));
      add('headline', word('Headline'), text('headline'));
      add('link', word('URL'), text('link_url') ?? text('link'));
      add(
        'url_tags',
        word('URL tags (UTM)'),
        row.urlTags ?? planAd?.url_tags ?? word('None'),
        true,
      );
    }

    return { pathKey, level: row.level ?? 'ad', name, lines };
  };

  return rows.map(groupOf);
};

const scaffoldChoiceWords: Readonly<Record<string, string>> = {
  OFFSITE_CONVERSIONS: 'Website conversions',
  CONVERSIONS: 'Website conversions',
  VALUE: 'Conversion value',
  LANDING_PAGE_VIEWS: 'Landing page views',
  LINK_CLICKS: 'Link clicks',
  LEAD_GENERATION: 'Leads',
  QUALITY_LEAD: 'Quality leads',
  CONVERSATIONS: 'Conversations',
  POST_ENGAGEMENT: 'Post engagement',
  PAGE_LIKES: 'Page likes',
  EVENT_RESPONSES: 'Event responses',
  THRUPLAY: 'ThruPlays',
  AD_RECALL_LIFT: 'Ad recall lift',
  REACH: 'Reach',
  IMPRESSIONS: 'Impressions',
};
export function scaffoldChoiceLabel(value: string, translate: ScaffoldText): string {
  return Object.hasOwn(OBJECTIVE_LABELS, value)
    ? objectiveLabel(value, translate)
    : scaffoldChoiceWords[value]
      ? localizeNodeOptionCopy(scaffoldChoiceWords[value], translate)
      : value;
}
