/**
 * One scaffold read -> the canvas graph.
 *
 * Pure: no React, no Supabase, no fetch. `jaina-activity-client.ts` does the reading,
 * this does the mapping, and `useCampaignStore.loadHydratedGraph` does the setting —
 * so the shape a hydrated node ends up with is testable without a browser.
 *
 * Structure comes from `buildScaffoldTree`, which the scaffold card already uses, so
 * the canvas and the card cannot disagree about what the tree IS. Only the per-node
 * DETAIL is read from the raw rows here: the tree drops `payload` on ads, and the ad
 * copy the canvas renders lives nowhere else.
 *
 * Every node carries `provenance`. That field is what makes a node a RECORD rather than
 * a draft — it is why the node chrome shows a gate instead of a delete affordance, and
 * why an edit to it marks the canvas dirty instead of persisting.
 */

import type {
  PaidScaffoldAdSetPlan,
  PaidScaffoldAudience,
  PaidScaffoldCreative,
  PaidScaffoldPlan,
} from '@continuum/contracts';
import {
  type AdData,
  type AdSetData,
  AUDIENCE_HANDLE_ID,
  type AudienceData,
  type CampaignCanvasEdge,
  type CampaignCanvasNode,
  type CampaignCanvasNodeData,
  type CampaignData,
  type CanvasNodeProvenance,
  type CarouselCard,
  type CreativeData,
  type PlacementMode,
} from '@/CampaignCanvas/types';
import { adFormatForCreativeType } from '@/CampaignCanvas/types/adCreativeCompatibility';
import { DEFAULT_OPTIMIZATION_GOAL } from '@/CampaignCanvas/types/nodeOptions';
import type {
  AudienceGroupRead,
  CanvasGate,
  CanvasScaffoldRead,
  ScaffoldGateName,
} from '@/lib/paid-media/jaina-activity-client';
import {
  buildScaffoldTree,
  type PaidScaffoldNodeRow,
  type ScaffoldAdRow,
  type ScaffoldAdSetRow,
  type ScaffoldNodeStatus,
} from '@/lib/paid-media/scaffoldTree';

/** What the store needs to know about where the graph on screen came from. */
export type CanvasHydration = {
  scaffoldId: string;
  scaffoldName: string;
  versionId: string;
  version: number;
  lifecycle: string;
  adAccountId: string;
  /** `paid_scaffold_versions.content_hash` of the version on screen. */
  contentHash: string;
  /** The version's typed plan; null for a version proposed before plans existed. */
  plan: PaidScaffoldPlan | null;
  /**
   * Every row of the version, keyed by row id (= a node's `provenance.sourceId`). The save
   * reads the keys no node edits from here — product/angle/concept keys, funnel stage,
   * target conversions — so node data carries only what a person can change.
   */
  sourceRows: Record<string, PaidScaffoldNodeRow>;
};

export type HydratedCanvasGraph = {
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
  hydration: CanvasHydration;
};

/*
 * Layout. Nodes are `w-sm` (384px) wide, so every horizontal step is at least that plus
 * a gap. Each ad set owns a block: its audience slot on the LEFT (an audience feeds an ad
 * set from the side), the ad set, and its ads spread beneath it. Blocks never share x.
 */
const NODE_WIDTH = 384;
const GAP = 56;
const SLOT = NODE_WIDTH + GAP;
const BLOCK_GAP = 120;
const ROW = 340;

/**
 * Which gate governs a node.
 *
 * The three gates are VERSION-scoped (`unique (version_id, gate)`), not per node, so
 * this is a mapping from what a node IS to which approval has to pass before it can
 * exist on Meta: `build` creates the campaign, ad sets and ads; `populate` attaches the
 * creative to an ad. `activate` governs the whole version and is surfaced through the
 * node's own status rather than pinned to one node.
 */
const gateForLevel = (
  level: 'campaign' | 'adset' | 'ad' | 'creative',
  gates: Partial<Record<ScaffoldGateName, CanvasGate>>,
): CanvasGate | null => (level === 'creative' ? gates.populate : gates.build) ?? null;

/**
 * The status the object has ON META, as opposed to the row's own lifecycle.
 *
 * Null until something was actually created there — a node with no Meta id has no Meta
 * status, and showing one would be an invention. After that the rule is the schema's
 * own: `created_status` carries a `check (created_status = 'PAUSED')`, so everything
 * this product creates lands paused and only the `activate` gate moves it.
 */
const metaStatusOf = (row: {
  status: ScaffoldNodeStatus;
  metaObjectId: string | null;
  metaCreativeId: string | null;
}): string | null => {
  if (!row.metaObjectId && !row.metaCreativeId) return null;
  return row.status === 'active' ? 'ACTIVE' : 'PAUSED';
};

const provenanceOf = (
  sourceId: string,
  pathKey: string,
  gate: CanvasGate | null,
  metaStatus: string | null,
): CanvasNodeProvenance => ({ sourceId, pathKey, gate, metaStatus });

const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/** Meta's `call_to_action_type` values overlap the canvas's own list but are not it. */
const CANVAS_CALL_TO_ACTIONS = new Set<AdData['callToAction']>([
  'LEARN_MORE',
  'SHOP_NOW',
  'SIGN_UP',
  'BOOK_NOW',
  'CONTACT_US',
  'DOWNLOAD',
]);

const callToActionOf = (creative: Record<string, unknown>): AdData['callToAction'] => {
  const value = readString(creative, 'call_to_action_type');
  return value && CANVAS_CALL_TO_ACTIONS.has(value as AdData['callToAction'])
    ? (value as AdData['callToAction'])
    : 'LEARN_MORE';
};

const OBJECTIVES = new Set<CampaignData['objective']>([
  'OUTCOME_SALES',
  'OUTCOME_LEADS',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_AWARENESS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_APP_PROMOTION',
]);

const objectiveOf = (payload: Record<string, unknown>): CampaignData['objective'] => {
  const value = readString(payload, 'objective');
  return value && OBJECTIVES.has(value as CampaignData['objective'])
    ? (value as CampaignData['objective'])
    : 'OUTCOME_ENGAGEMENT';
};

const node = (
  id: string,
  type: CampaignCanvasNode['type'],
  position: { x: number; y: number },
  data: CampaignCanvasNodeData,
): CampaignCanvasNode => ({ id, type, position, data, selected: false });

const edge = (
  source: string,
  target: string,
  targetHandle: string | null = null,
): CampaignCanvasEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  ...(targetHandle ? { targetHandle } : {}),
});

/** Countries, then regions, then cities — whatever the manifest actually named. */
const locationsOf = (targeting: Record<string, unknown>): string[] => {
  const geo = readRecord(targeting.geo_locations);
  const collect = (value: unknown, key?: string): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) =>
            typeof entry === 'string'
              ? entry
              : key
                ? readString(readRecord(entry), key)
                : undefined,
          )
          .filter((entry): entry is string => Boolean(entry))
      : [];
  return [...collect(geo.countries), ...collect(geo.regions, 'key'), ...collect(geo.cities, 'key')];
};

/** `[{ id, name }]` — the canvas shows the names, which is what a human recognises. */
const optionNames = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) => readString(readRecord(entry), 'name'))
        .filter((entry): entry is string => Boolean(entry))
    : [];

const gendersOf = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((entry): entry is 1 | 2 => entry === 1 || entry === 2) : [];

/** A published audience group version, as the node that feeds every ad set built from it. */
export const audienceDataFromGroup = (group: AudienceGroupRead): AudienceData => {
  const targeting = group.targeting;
  const ageMin = targeting.age_min;
  const ageMax = targeting.age_max;
  return {
    label: group.name,
    status: 'draft',
    validationStatus: 'valid',
    mode: 'group',
    audienceGroupId: group.id,
    ...(group.versionId ? { audienceGroupVersionId: group.versionId } : {}),
    locations: locationsOf(targeting),
    ...(typeof ageMin === 'number' ? { ageMin } : {}),
    ...(typeof ageMax === 'number' ? { ageMax } : {}),
    genders: gendersOf(targeting.genders),
    interests: optionNames(targeting.interests),
    behaviors: optionNames(targeting.behaviors),
    customAudiences: group.includedKeys,
    provenance: provenanceOf(group.id, group.versionId ?? group.id, group.gate, null),
  };
};

/** Explicit broad targeting, owned by one ad set: its provenance is the ad set's row. */
const broadAudienceData = (
  adSet: ScaffoldAdSetRow,
  gate: CanvasGate | null,
  targeting: { countries: string[]; ageMin?: number; ageMax?: number; genders: number[] },
): AudienceData => ({
  label: targeting.countries.length > 0 ? `Broad · ${targeting.countries.join(', ')}` : 'Broad',
  status: 'draft',
  validationStatus: 'valid',
  mode: 'broad',
  locations: targeting.countries,
  ...(typeof targeting.ageMin === 'number' ? { ageMin: targeting.ageMin } : {}),
  ...(typeof targeting.ageMax === 'number' ? { ageMax: targeting.ageMax } : {}),
  genders: targeting.genders,
  provenance: provenanceOf(adSet.id, `${adSet.pathKey}/audience`, gate, null),
});

const PLAN_GENDER_CODES = { male: 1, female: 2 } as const;

type ResolvedAudience = { nodeId: string; data: AudienceData };

/**
 * The one audience an ad set targets, from the version's plan when it has one and from
 * the row otherwise. `null` = the ad set targets nothing the canvas can show.
 */
const audienceForAdSet = (
  adSet: ScaffoldAdSetRow,
  planAudience: PaidScaffoldAudience | undefined,
  groups: readonly AudienceGroupRead[],
  gate: CanvasGate | null,
): ResolvedAudience | null => {
  const groupNode = (versionId: string, fallbackName: string | null): ResolvedAudience => {
    const group = groups.find((entry) => entry.versionId === versionId);
    if (group) return { nodeId: `audience:${group.id}`, data: audienceDataFromGroup(group) };
    // A version that is no longer the group's current one: still the ad set's targeting.
    return {
      nodeId: `audience-version:${versionId}`,
      data: {
        label: fallbackName ?? 'Audience group',
        status: 'draft',
        validationStatus: 'valid',
        mode: 'group',
        audienceGroupVersionId: versionId,
        locations: [],
        provenance: provenanceOf(versionId, versionId, null, null),
      },
    };
  };

  if (planAudience?.kind === 'group') {
    return groupNode(planAudience.group_version_id, planAudience.group_name);
  }
  if (planAudience?.kind === 'broad') {
    const { targeting } = planAudience;
    return {
      nodeId: `${adSet.id}:audience`,
      data: broadAudienceData(adSet, gate, {
        countries: targeting.countries,
        ageMin: targeting.age_min,
        ageMax: targeting.age_max,
        genders: (targeting.genders ?? []).map((gender) => PLAN_GENDER_CODES[gender]),
      }),
    };
  }

  if (adSet.derived.audienceGroupVersionId) {
    return groupNode(adSet.derived.audienceGroupVersionId, null);
  }
  const targeting = readRecord(adSet.derived.targeting);
  if (Object.keys(targeting).length === 0) return null;
  return {
    nodeId: `${adSet.id}:audience`,
    data: broadAudienceData(adSet, gate, {
      countries: locationsOf(targeting),
      ...(typeof targeting.age_min === 'number' ? { ageMin: targeting.age_min } : {}),
      ...(typeof targeting.age_max === 'number' ? { ageMax: targeting.age_max } : {}),
      genders: gendersOf(targeting.genders),
    }),
  };
};

const readStrings = (record: Record<string, unknown>, key: string): string[] => {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
};

/** `payload.placement` — Meta's placement choice — as the ad set's editable fields. */
const placementOf = (payload: Record<string, unknown>): Partial<AdSetData> => {
  const placement = readRecord(payload.placement);
  const mode = placement.mode;
  if (mode !== 'advantage_plus' && mode !== 'manual') return {};
  return {
    placementMode: mode as PlacementMode,
    publisherPlatforms: readStrings(placement, 'publisher_platforms'),
    facebookPositions: readStrings(placement, 'facebook_positions'),
    instagramPositions: readStrings(placement, 'instagram_positions'),
    devicePlatforms: readStrings(placement, 'device_platforms'),
  };
};

/** image | video for a stored card: its own `kind` if it has one, else the asset's media type. */
type AssetKinds = Readonly<Record<string, 'image' | 'video'>>;

const kindOf = (stored: string | undefined, assetId: string, assetKinds: AssetKinds) =>
  stored === 'video' || stored === 'image' ? stored : (assetKinds[assetId] ?? 'image');

const carouselCardsOf = (value: unknown, assetKinds: AssetKinds = {}): CarouselCard[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const card = readRecord(entry);
        const mediaId = readString(card, 'asset_id');
        if (!mediaId) return [];
        const thumbnailUrl = readString(card, 'thumbnail_url');
        const headline = readString(card, 'headline');
        const linkUrl = readString(card, 'link');
        return [
          {
            mediaId,
            kind: kindOf(readString(card, 'kind'), mediaId, assetKinds),
            ...(thumbnailUrl ? { thumbnailUrl } : {}),
            ...(headline ? { headline } : {}),
            ...(linkUrl ? { linkUrl } : {}),
          },
        ];
      })
    : [];

export type HydratedCreative = Pick<
  CreativeData,
  'label' | 'assetType' | 'mediaId' | 'assetUrl' | 'thumbnailUrl' | 'cards'
>;

/**
 * THE one place an ad's creative is read. Re-point it here when the persisted shape
 * moves; nothing else in hydration knows it.
 *
 * The version's plan wins when it carries a creative (it is what the version was saved
 * with). Otherwise the row's current attachment: `creative_asset_id` + `creative_media`
 * for a single asset, or `creative_media = { kind: 'carousel', cards: [...] }` for a
 * carousel the agent attached. The plan names assets only, so thumbnails are borrowed
 * from the row wherever the same asset appears there; a card without one renders a
 * placeholder tile. `null` = nothing attached, and no creative node is drawn.
 */
export function creativeFromRow(
  adRow: Pick<ScaffoldAdRow, 'creativeAssetId' | 'creativeMedia'>,
  planCreative: PaidScaffoldCreative | null = null,
  assetKinds: AssetKinds = {},
): HydratedCreative | null {
  const media = readRecord(adRow.creativeMedia);
  const kind = readString(media, 'kind');
  const label = readString(media, 'name') ?? 'Attached creative';
  const rowCards = carouselCardsOf(media.cards, assetKinds);

  const known = new Map<string, CarouselCard>(rowCards.map((card) => [card.mediaId, card]));
  const mediaThumbnail = readString(media, 'thumbnail_url');
  if (adRow.creativeAssetId && kind !== 'carousel') {
    known.set(adRow.creativeAssetId, {
      mediaId: adRow.creativeAssetId,
      kind: kindOf(kind, adRow.creativeAssetId, assetKinds),
      ...(mediaThumbnail ? { thumbnailUrl: mediaThumbnail } : {}),
    });
  }

  if (planCreative) {
    if (planCreative.format === 'carousel') {
      return {
        label,
        assetType: 'carousel',
        cards: planCreative.cards.map((card) => {
          const seen = known.get(card.asset_id);
          return {
            mediaId: card.asset_id,
            kind: seen?.kind ?? kindOf(undefined, card.asset_id, assetKinds),
            ...(seen?.thumbnailUrl ? { thumbnailUrl: seen.thumbnailUrl } : {}),
            ...(card.headline ? { headline: card.headline } : {}),
            ...(card.link ? { linkUrl: card.link } : {}),
          };
        }),
      };
    }
    const [card] = planCreative.cards;
    if (!card) return null;
    const seen = known.get(card.asset_id);
    const assetUrl =
      card.asset_id === adRow.creativeAssetId ? readString(media, 'url') : undefined;
    return {
      label,
      assetType: planCreative.format,
      mediaId: card.asset_id,
      ...(assetUrl ? { assetUrl } : {}),
      ...(seen?.thumbnailUrl ? { thumbnailUrl: seen.thumbnailUrl } : {}),
    };
  }

  if (kind === 'carousel') {
    return rowCards.length > 0 ? { label, assetType: 'carousel', cards: rowCards } : null;
  }
  if (!adRow.creativeAssetId) return null;
  const assetUrl = readString(media, 'url');
  return {
    label,
    assetType: kindOf(kind, adRow.creativeAssetId, assetKinds),
    mediaId: adRow.creativeAssetId,
    ...(assetUrl ? { assetUrl } : {}),
    ...(mediaThumbnail ? { thumbnailUrl: mediaThumbnail } : {}),
  };
}

export function buildHydratedCanvasGraph(read: CanvasScaffoldRead): HydratedCanvasGraph {
  const tree = buildScaffoldTree(read.tree.rows);
  const rowById = new Map<string, PaidScaffoldNodeRow>(read.tree.rows.map((row) => [row.id, row]));
  // Legacy reads (and fixtures) carry no plan; `?? null` keeps both shapes readable.
  const plan = read.plan ?? null;
  const planAdSetByPath = new Map<string, PaidScaffoldAdSetPlan>(
    (plan?.adsets ?? []).map((entry) => [entry.path_key, entry]),
  );
  const planCreativeByPath = new Map<string, PaidScaffoldCreative | null>(
    (plan?.ads ?? []).map((entry) => [entry.path_key, entry.creative]),
  );
  const currency = plan?.currency ?? 'USD';

  const nodes: CampaignCanvasNode[] = [];
  const edges: CampaignCanvasEdge[] = [];
  const placedAudienceIds = new Set<string>();
  const adSetXs: number[] = [];
  let cursorX = 0;

  tree.adSets.forEach((adSet) => {
    const audienceX = cursorX;
    const x = cursorX + SLOT;
    adSetXs.push(x);
    const row = rowById.get(adSet.id);
    const payload = row?.payload ?? {};
    const planAdSet = planAdSetByPath.get(adSet.pathKey);
    const budgetMinorUnits = planAdSet?.daily_budget_minor_units ?? adSet.dailyBudgetMinorUnits;
    const adSetGate = gateForLevel('adset', read.gates);
    const adSetData: AdSetData = {
      label: adSet.name,
      status: adSet.status === 'active' ? 'active' : 'draft',
      validationStatus: 'valid',
      optimizationGoal:
        planAdSet?.optimization_goal ??
        adSet.choices.optimizationGoal ??
        DEFAULT_OPTIMIZATION_GOAL,
      billingEvent: planAdSet?.billing_event ?? adSet.derived.billingEvent ?? 'IMPRESSIONS',
      // Jaina's opening budget: the plan's figure (already clamped to Meta's floor), else
      // the typed `daily_budget_minor_units` column. Null means no measured CPA: build uses
      // the Backend placeholder, shown as 0 rather than as a figure nobody derived.
      budgetType: 'DAILY',
      budgetAmount: typeof budgetMinorUnits === 'number' ? budgetMinorUnits / 100 : 0,
      budgetCurrency: currency,
      pacingType: adSet.choices.placement ?? [],
      ...placementOf(payload),
      ...(adSet.metaObjectId ? { metaId: adSet.metaObjectId } : {}),
      provenance: provenanceOf(
        adSet.id,
        adSet.pathKey,
        adSetGate,
        metaStatusOf({
          status: adSet.status,
          metaObjectId: adSet.metaObjectId,
          metaCreativeId: null,
        }),
      ),
    };
    nodes.push(node(adSet.id, 'ad-set', { x, y: ROW }, adSetData));
    if (tree.campaign) edges.push(edge(tree.campaign.id, adSet.id));

    // The audience enters from the side. A group several ad sets share is drawn once,
    // left of the first of them; the rest take an edge to it.
    const audience = audienceForAdSet(adSet, planAdSet?.audience, read.audiences, adSetGate);
    if (audience) {
      if (!placedAudienceIds.has(audience.nodeId)) {
        placedAudienceIds.add(audience.nodeId);
        nodes.push(node(audience.nodeId, 'audience', { x: audienceX, y: ROW }, audience.data));
      }
      edges.push(edge(audience.nodeId, adSet.id, AUDIENCE_HANDLE_ID));
    }

    adSet.ads.forEach((ad, adIndex) => {
      const adX = x + adIndex * SLOT;
      const adRow = rowById.get(ad.id);
      const creativePayload = readRecord(readRecord(adRow?.payload ?? {}).creative);
      const creative = creativeFromRow(
        ad,
        planCreativeByPath.get(ad.pathKey) ?? null,
        read.assetKinds,
      );
      const description = readString(creativePayload, 'description');
      const linkUrl =
        readString(creativePayload, 'link_url') ?? readString(creativePayload, 'link');
      const adData: AdData = {
        label: ad.name,
        status: ad.status === 'active' ? 'active' : 'draft',
        validationStatus: 'valid',
        adFormat: creative ? adFormatForCreativeType(creative.assetType) : 'IMAGE',
        primaryText: readString(creativePayload, 'message') ?? '',
        headline: readString(creativePayload, 'headline') ?? '',
        ...(description ? { description } : {}),
        callToAction: callToActionOf(creativePayload),
        ...(linkUrl ? { linkUrl } : {}),
        ...(ad.metaCreativeId ? { metaId: ad.metaCreativeId } : {}),
        provenance: provenanceOf(
          ad.id,
          ad.pathKey,
          gateForLevel('ad', read.gates),
          metaStatusOf({
            status: ad.status,
            metaObjectId: null,
            metaCreativeId: ad.metaCreativeId,
          }),
        ),
      };
      nodes.push(node(ad.id, 'ad', { x: adX, y: ROW * 2 }, adData));
      edges.push(edge(adSet.id, ad.id));

      // A creative node exists only once an asset was actually attached. Rendering an
      // empty one for every ad would show a graph the database does not have.
      if (!creative) return;
      const creativeNodeId = `${ad.id}:creative`;
      const creativeData: CreativeData = {
        ...creative,
        status: 'draft',
        validationStatus: 'valid',
        provenance: provenanceOf(
          creative.mediaId ?? creative.cards?.[0]?.mediaId ?? ad.id,
          `${ad.pathKey}/creative`,
          gateForLevel('creative', read.gates),
          null,
        ),
      };
      nodes.push(node(creativeNodeId, 'creative', { x: adX, y: ROW * 3 }, creativeData));
      edges.push(edge(ad.id, creativeNodeId));
    });

    const adsSpan = Math.max(1, adSet.ads.length) * SLOT - GAP;
    cursorX = x + Math.max(NODE_WIDTH, adsSpan) + BLOCK_GAP;
  });

  if (tree.campaign) {
    const row = rowById.get(tree.campaign.id);
    const payload = row?.payload ?? {};
    const planObjective = plan?.objective;
    const campaign: CampaignData = {
      label: tree.campaign.name,
      status: tree.campaign.status === 'active' ? 'active' : 'draft',
      validationStatus: 'valid',
      objective:
        planObjective && OBJECTIVES.has(planObjective as CampaignData['objective'])
          ? (planObjective as CampaignData['objective'])
          : objectiveOf(payload),
      buyingType: 'AUCTION',
      // The version's list is what the build applies.
      specialAdCategories: read.specialAdCategories,
      ...(tree.campaign.metaObjectId ? { metaId: tree.campaign.metaObjectId } : {}),
      provenance: provenanceOf(
        tree.campaign.id,
        tree.campaign.pathKey,
        gateForLevel('campaign', read.gates),
        metaStatusOf({
          status: tree.campaign.status,
          metaObjectId: tree.campaign.metaObjectId,
          metaCreativeId: null,
        }),
      ),
    };
    // Centred over its ad sets; first in the list, so it paints beneath nothing.
    const campaignX =
      adSetXs.length > 0 ? (adSetXs[0]! + adSetXs[adSetXs.length - 1]!) / 2 : SLOT;
    nodes.unshift(node(tree.campaign.id, 'campaign', { x: campaignX, y: 0 }, campaign));
  }

  // A published group nothing targets is still shown, unattached, in a column left of
  // every block: it is a real, approved audience the brand owns, and its absence from
  // the tree is information.
  read.audiences
    .filter((group) => !placedAudienceIds.has(`audience:${group.id}`))
    .forEach((group, index) => {
      nodes.push(
        node(
          `audience:${group.id}`,
          'audience',
          { x: -SLOT, y: ROW + index * ROW },
          audienceDataFromGroup(group),
        ),
      );
    });

  return {
    nodes,
    edges,
    hydration: {
      scaffoldId: read.scaffold.id,
      scaffoldName: read.scaffold.name,
      versionId: read.version.id,
      version: read.version.version,
      lifecycle: read.version.lifecycle,
      adAccountId: read.scaffold.adAccountId,
      contentHash: read.contentHash ?? '',
      plan,
      sourceRows: Object.fromEntries(read.tree.rows.map((row) => [row.id, row])),
    },
  };
}
