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

export const objectiveLabel = (objective: string | null | undefined): string =>
  objective ? (OBJECTIVE_LABELS[objective] ?? objective) : '—';

const SOURCE_LABELS: Record<string, string> = {
  meta_insights: 'Meta insights',
  meta_minimum_budgets: 'Meta minimum',
  meta_reachestimate: 'Meta reach estimate',
  audience_group: 'Audience group',
  angle_evidence: 'Angle evidence',
  derived: 'Derived',
  user: 'Edited on canvas',
};

export const sourceLabel = (source: string): string =>
  SOURCE_LABELS[source] ?? source.replace(/_/g, ' ');

/** `last_30d` → `last 30d`. The window is shown as given, never re-derived. */
export const windowLabel = (window: string | null): string | null =>
  window ? window.replace(/_/g, ' ') : null;

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** A 3-letter upper-case unit is a currency; anything else prints beside the number. */
export const formatMetricValue = (metric: PaidScaffoldEvidenceMetric): string => {
  const { value, unit } = metric;
  if (typeof value === 'string') return unit ? `${value} ${unit}` : value;
  if (unit && /^[A-Z]{3}$/.test(unit)) return formatCurrency(value, unit);
  const shown = Math.abs(value) >= 100_000 ? COMPACT.format(value) : NUMBER.format(value);
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

export const formatReach = (reach: { lower: number; upper: number } | null): string | null =>
  reach ? `${COMPACT.format(reach.lower)}–${COMPACT.format(reach.upper)} people` : null;

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
export const audienceLinesOf = (plan: PaidScaffoldPlan): AudienceLine[] => {
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
          ? (audience.group_name ?? 'Audience group')
          : audience.kind === 'copied'
            ? paidScaffoldCopiedAudienceLabel(audience.source_adset_name)
            : 'Broad targeting',
      kind: audience.kind,
      summary: audience.targeting_summary,
      members: audience.kind === 'group' ? audience.members.map((member) => member.label) : [],
      memberCount: audience.kind === 'group' ? audience.member_count : 0,
      reach: formatReach(audience.reach),
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

const optimizerLabel = (plan: PaidScaffoldPlan): string => {
  const { apply_mode: mode, autopilot_scopes: scopes } = plan.optimizer_enrollment;
  const autopilotOn = Object.values(scopes).some(Boolean);
  return `${mode === 'recommend' ? 'Recommend' : 'Observe'} · autopilot ${autopilotOn ? 'on' : 'off'}`;
};

export const scaffoldSummaryOf = (
  plan: PaidScaffoldPlan | null,
  tree: ScaffoldTree | null,
  fallbackCurrency: string | null,
): ScaffoldSummary => {
  const tiles = creativeTilesOf(tree, plan);
  if (plan) {
    return {
      objective: objectiveLabel(plan.objective),
      dailyBudgetMinorUnits: plan.expected.daily_budget_minor_units,
      budgetHeldByCampaign: plan.budget_mode === 'cbo',
      currency: plan.expected.currency ?? plan.currency ?? fallbackCurrency,
      conversionsPerDay: plan.expected.conversions_per_day,
      cpa: plan.expected.cpa,
      audiences: audienceLinesOf(plan).length,
      creatives: tiles.filter((tile) => tile.format !== null || tile.reusedCreativeId).length,
      ads: tiles.length,
      optimizer: optimizerLabel(plan),
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
    objective: objectiveLabel(objective),
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
}): DeployBlocker[] => {
  const { plan, planLoaded, tree, contentHash } = params;
  const blockers: DeployBlocker[] = [];
  if (planLoaded && !plan) {
    // The deploy compiles from the typed plan; the Backend refuses a version without one.
    blockers.push({
      code: 'no_plan',
      message:
        'This version predates one-click deploy. Open it on the canvas and save it as a new version to deploy it.',
    });
  }
  if (!contentHash) {
    blockers.push({
      code: 'no_content_hash',
      message:
        'This version was proposed before one-click deploy existed. Ask Jaina to propose it again.',
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
    blockers.push({ code, message: count > 1 ? `${message} (${count} ad sets)` : message });
  }
  if (tree) {
    const { adSetsWithoutAudience, adsWithoutCreative } = scaffoldBlockersOf(tree);
    if (adSetsWithoutAudience.length > 0) {
      const named = adSetsWithoutAudience.slice(0, 3).join(', ');
      const more = adSetsWithoutAudience.length - 3;
      blockers.push({
        code: 'adset_without_audience',
        message: `${adSetsWithoutAudience.length} ad set${adSetsWithoutAudience.length === 1 ? ' has' : 's have'} no audience (${named}${more > 0 ? ` +${more} more` : ''}). Pick a published audience group or broad targeting on the canvas.`,
      });
    }
    if (adsWithoutCreative > 0) {
      blockers.push({
        code: 'ad_without_creative',
        message: `${adsWithoutCreative} ad${adsWithoutCreative === 1 ? ' has' : 's have'} no creative attached. Add one from the Library on the canvas.`,
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

const dateTimeLabel = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
};

/** "Starts Jan 1, 2099, 12:00 PM · no end date". Null on both ends is the default, said in words. */
export const scheduleLabel = (start: string | null, end: string | null): string =>
  `${start ? `Starts ${dateTimeLabel(start)}` : 'Starts when activated'} · ${
    end ? `ends ${dateTimeLabel(end)}` : 'no end date'
  }`;

/** A bid as one phrase: the strategy, then the amount or floor it needs. Null = uncapped. */
export const bidLabel = (
  bid: Pick<PaidScaffoldBidPlan, 'strategy' | 'bid_amount_minor_units' | 'roas_floor'> | null,
  currency: string | null,
): string => {
  const strategy = bidStrategyLabel(bid?.strategy);
  if (typeof bid?.bid_amount_minor_units === 'number') {
    return `${strategy} · ${formatCurrency(bid.bid_amount_minor_units / 100, currency)}`;
  }
  if (typeof bid?.roas_floor === 'number') return `${strategy} · ${bid.roas_floor}x`;
  return strategy;
};

const goalLabel = (goal: string | null): string | null =>
  goal ? (OPTIMIZATION_GOALS.find((entry) => entry.value === goal)?.label ?? goal) : null;

/** Advantage+ or the manual surfaces, flattened the way the table and the canvas say them. */
const placementLabelOf = (payload: Record<string, unknown>): string => {
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
  return labels.length > 0 ? labels.join(', ') : 'Advantage+';
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
}): ScaffoldFieldGroup[] => {
  const { plan, currency } = params;
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
        value: value ?? NOT_SET,
        provenance: effectiveFieldProvenance(stored, hasValue),
      });
    };
    const payload = asRecord(row.payload);
    const pathKey = row.pathKey ?? '';
    const name = row.name ?? '';
    add('name', 'Name', name || null);

    if (row.level === 'campaign') {
      const objective = plan?.objective ?? (payload.objective as string | undefined) ?? null;
      add('objective', 'Objective', objective ? objectiveLabel(objective) : null);
      add('budget_mode', 'Budget', cbo ? 'Campaign budget (CBO)' : 'Ad set budgets (ABO)', true);
      if (cbo) {
        const figure =
          row.campaignDailyBudgetMinorUnits ?? plan?.campaign_daily_budget_minor_units ?? null;
        add(
          'campaign_daily_budget_minor_units',
          'Campaign daily budget',
          figure === null ? null : formatDailyBudget(figure, currency),
        );
        add('bid_strategy', 'Bid strategy', bidLabel(campaignBid, currency), true);
      }
    }

    if (row.level === 'adset') {
      const planAdSet = planAdSets.get(pathKey);
      add(
        'optimization_goal',
        'Optimization goal',
        goalLabel(planAdSet?.optimization_goal ?? (payload.optimization_goal as string) ?? null),
      );
      const promoted = planAdSet?.promoted_object ?? {};
      const event = conversionEventLabel(row.customEventType);
      const derivedEvent = conversionEventLabel(promoted.custom_event_type);
      add(
        'custom_event_type',
        'Optimization event',
        event ?? (derivedEvent ? `${derivedEvent} (from the objective)` : 'From the objective'),
        true,
      );
      add('pixel_id', 'Pixel', row.pixelId ?? promoted.pixel_id ?? "The account's pixel", true);
      if (cbo) {
        add(
          'daily_budget_minor_units',
          'Daily budget',
          formatCampaignBudgetShare(
            {
              adSetCount: rows.filter((entry) => entry.level === 'adset').length,
              campaignDailyBudgetMinorUnits:
                campaignRow?.campaignDailyBudgetMinorUnits ??
                plan?.campaign_daily_budget_minor_units ??
                null,
            },
            currency,
          ),
          true,
        );
        const ownCap =
          typeof row.bidAmountMinorUnits === 'number'
            ? ` · own cap ${formatCurrency(row.bidAmountMinorUnits / 100, currency)}`
            : '';
        add('bid_strategy', 'Bid strategy', `Set by the campaign${ownCap}`, true);
      } else {
        const figure = row.dailyBudgetMinorUnits ?? planAdSet?.daily_budget_minor_units ?? null;
        add(
          'daily_budget_minor_units',
          'Daily budget',
          figure === null ? null : formatDailyBudget(figure, currency),
        );
        const bid: PaidScaffoldBidPlan | null = row.bidStrategy
          ? {
              strategy: row.bidStrategy,
              bid_amount_minor_units: row.bidAmountMinorUnits ?? null,
              roas_floor: row.roasFloor ?? null,
            }
          : (planAdSet?.bid ?? null);
        add('bid_strategy', 'Bid strategy', bidLabel(bid, currency), true);
      }
      const audience = planAdSet?.audience;
      const groupVersion =
        audience?.kind === 'group'
          ? audience.group_version_id
          : (payload.audience_group_version_id as string | undefined);
      const copied = audience?.kind === 'copied' ? audience : null;
      const broad =
        !copied &&
        (audience?.kind === 'broad' || (!groupVersion && Boolean(payload.targeting)));
      const audienceKey = groupVersion ? 'audience_group_version_id' : 'broad_targeting';
      const audienceKeys = ['audience_group_version_id', 'broad_targeting'];
      add(
        audienceKey,
        'Audience',
        groupVersion
          ? audience?.kind === 'group'
            ? (audience.group_name ?? 'Audience group')
            : 'Audience group'
          : copied
            ? paidScaffoldCopiedAudienceLabel(copied.source_adset_name)
            : broad
              ? 'Broad targeting'
              : null,
        undefined,
        [audienceKey, ...audienceKeys],
      );
      const location = audience?.targeting_summary ?? targetingSummary(payload.targeting);
      add(
        'location',
        'Location',
        location ?? (groupVersion ? 'From the audience group' : null),
        undefined,
        [audienceKey, ...audienceKeys],
      );
      add('placement_mode', 'Placements', placementLabelOf(payload), true);
      add(
        'start_time',
        'Schedule',
        scheduleLabel(
          row.startTime ?? planAdSet?.schedule?.start_time ?? null,
          row.endTime ?? planAdSet?.schedule?.end_time ?? null,
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
      const reused = typeof payload.source_creative_id === 'string' ? payload.source_creative_id : null;
      add(
        'creative',
        'Creative',
        reused
          ? `The source ad's creative · ${reused}`
          : format
            ? format === 'carousel'
              ? `Carousel · ${cardCount} card${cardCount === 1 ? '' : 's'}`
              : FORMAT_LABELS[format]
            : null,
      );
      const creative = asRecord(payload.creative);
      const text = (key: string) =>
        typeof creative[key] === 'string' && (creative[key] as string).trim()
          ? (creative[key] as string)
          : null;
      add('message', 'Primary text', text('message'));
      add('headline', 'Headline', text('headline'));
      add('link', 'URL', text('link_url') ?? text('link'));
      add('url_tags', 'URL tags (UTM)', row.urlTags ?? planAd?.url_tags ?? 'None', true);
    }

    return { pathKey, level: row.level ?? 'ad', name, lines };
  };

  return rows.map(groupOf);
};
