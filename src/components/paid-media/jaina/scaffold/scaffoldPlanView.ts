// What the scaffold card SAYS, derived in one pure place from the typed plan and the node rows.
//
// The plan (`PaidScaffoldPlan`, the same object the proposal frame carries and
// `manifest.plan` persists) is the authority on what was decided and why. The rows are the
// authority on what is attached right now — creative is attached AFTER propose, so "has this ad
// got a creative" is a row question, never a plan one. Both are read here so the card, its test
// and the bench all grade one derivation.

import type {
  PaidScaffoldAudience,
  PaidScaffoldEvidence,
  PaidScaffoldEvidenceMetric,
  PaidScaffoldPlan,
} from '@continuum/contracts';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import {
  openingDailyBudgetOf,
  type ScaffoldTree,
  scaffoldBlockersOf,
} from '@/lib/paid-media/scaffoldTree';

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
        : `broad:${audience.targeting_summary}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.adSets.push(adSet.name);
      continue;
    }
    byKey.set(key, {
      key,
      name:
        audience.kind === 'group' ? (audience.group_name ?? 'Audience group') : 'Broad targeting',
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
  cardCount: number;
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
      cardCount: ad.creative?.cards.length ?? 0,
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
      cardCount: cards.length > 0 ? cards.length : attached ? 1 : 0,
    };
  });
};

/** The six figures on the strip. `null` renders as a named absence, never as zero. */
export type ScaffoldSummary = {
  objective: string;
  dailyBudgetMinorUnits: number | null;
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
      currency: plan.expected.currency ?? plan.currency ?? fallbackCurrency,
      conversionsPerDay: plan.expected.conversions_per_day,
      cpa: plan.expected.cpa,
      audiences: audienceLinesOf(plan).length,
      creatives: tiles.filter((tile) => tile.format !== null).length,
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
    currency: fallbackCurrency,
    conversionsPerDay: null,
    cpa: null,
    audiences: groups.size,
    creatives: tiles.filter((tile) => tile.format !== null).length,
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
