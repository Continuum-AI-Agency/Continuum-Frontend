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
  AdData,
  AdSetData,
  AudienceData,
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignCanvasNodeData,
  CampaignData,
  CanvasNodeProvenance,
  CreativeData,
} from '@/CampaignCanvas/types';
import type {
  AudienceGroupRead,
  CanvasGate,
  CanvasScaffoldRead,
  ScaffoldGateName,
} from '@/lib/paid-media/jaina-activity-client';
import {
  buildScaffoldTree,
  type PaidScaffoldNodeRow,
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
};

export type HydratedCanvasGraph = {
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
  hydration: CanvasHydration;
};

const COLUMN = 340;
const ROW = 260;

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
): CanvasGate | null =>
  (level === 'creative' ? gates.populate : gates.build) ?? null;

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

const edge = (source: string, target: string): CampaignCanvasEdge => ({
  id: `${source}->${target}`,
  source,
  target,
});

/** Countries, then regions, then cities — whatever the manifest actually named. */
const locationsOf = (targeting: Record<string, unknown>): string[] => {
  const geo = readRecord(targeting.geo_locations);
  const collect = (value: unknown, key?: string): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) =>
            typeof entry === 'string' ? entry : key ? readString(readRecord(entry), key) : undefined,
          )
          .filter((entry): entry is string => Boolean(entry))
      : [];
  return [
    ...collect(geo.countries),
    ...collect(geo.regions, 'key'),
    ...collect(geo.cities, 'key'),
  ];
};

/** `[{ id, name }]` — the canvas shows the names, which is what a human recognises. */
const optionNames = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) => readString(readRecord(entry), 'name'))
        .filter((entry): entry is string => Boolean(entry))
    : [];

const audienceData = (group: AudienceGroupRead): AudienceData => {
  const targeting = group.targeting;
  const ageMin = targeting.age_min;
  const ageMax = targeting.age_max;
  return {
    label: group.name,
    status: 'draft',
    validationStatus: 'valid',
    locations: locationsOf(targeting),
    ...(typeof ageMin === 'number' ? { ageMin } : {}),
    ...(typeof ageMax === 'number' ? { ageMax } : {}),
    genders: Array.isArray(targeting.genders)
      ? targeting.genders.filter((value): value is 1 | 2 => value === 1 || value === 2)
      : [],
    interests: optionNames(targeting.interests),
    behaviors: optionNames(targeting.behaviors),
    customAudiences: group.includedKeys,
    provenance: provenanceOf(group.id, group.versionId ?? group.id, group.gate, null),
  };
};

export function buildHydratedCanvasGraph(read: CanvasScaffoldRead): HydratedCanvasGraph {
  const tree = buildScaffoldTree(read.tree.rows);
  const rowById = new Map<string, PaidScaffoldNodeRow>(read.tree.rows.map((row) => [row.id, row]));

  const nodes: CampaignCanvasNode[] = [];
  const edges: CampaignCanvasEdge[] = [];

  if (tree.campaign) {
    const row = rowById.get(tree.campaign.id);
    const payload = row?.payload ?? {};
    const campaign: CampaignData = {
      label: tree.campaign.name,
      status: tree.campaign.status === 'active' ? 'active' : 'draft',
      validationStatus: 'valid',
      objective: objectiveOf(payload),
      buyingType: 'AUCTION',
      specialAdCategories: tree.campaign.derived.specialAdCategories ?? [],
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
    nodes.push(node(tree.campaign.id, 'campaign', { x: 0, y: 0 }, campaign));
  }

  tree.adSets.forEach((adSet, adSetIndex) => {
    const x = adSetIndex * COLUMN;
    const row = rowById.get(adSet.id);
    const payload = row?.payload ?? {};
    const adSetData: AdSetData = {
      label: adSet.name,
      status: adSet.status === 'active' ? 'active' : 'draft',
      validationStatus: 'valid',
      optimizationGoal: adSet.choices.optimizationGoal ?? 'CONVERSIONS',
      billingEvent: adSet.derived.billingEvent ?? 'IMPRESSIONS',
      // A scaffold node carries NO budget: the schema has a
      // `check (not (payload ?| array['daily_budget', …]))` that forbids it, because
      // budget is set at build time from the account, never proposed by a model.
      budgetType: 'DAILY',
      budgetAmount: 0,
      budgetCurrency: 'USD',
      pacingType: adSet.choices.placement ?? [],
      ...(adSet.metaObjectId ? { metaId: adSet.metaObjectId } : {}),
      provenance: provenanceOf(
        adSet.id,
        adSet.pathKey,
        gateForLevel('adset', read.gates),
        metaStatusOf({
          status: adSet.status,
          metaObjectId: adSet.metaObjectId,
          metaCreativeId: null,
        }),
      ),
    };
    nodes.push(node(adSet.id, 'ad-set', { x, y: ROW }, adSetData));
    if (tree.campaign) edges.push(edge(tree.campaign.id, adSet.id));

    adSet.ads.forEach((ad, adIndex) => {
      const adRow = rowById.get(ad.id);
      const creative = readRecord(readRecord(adRow?.payload ?? {}).creative);
      const adData: AdData = {
        label: ad.name,
        status: ad.status === 'active' ? 'active' : 'draft',
        validationStatus: 'valid',
        adFormat: 'IMAGE',
        primaryText: readString(creative, 'message') ?? '',
        headline: readString(creative, 'headline') ?? '',
        ...(readString(creative, 'description')
          ? { description: readString(creative, 'description') }
          : {}),
        callToAction: callToActionOf(creative),
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
      nodes.push(node(ad.id, 'ad', { x: x + adIndex * 240, y: ROW * 2 }, adData));
      edges.push(edge(adSet.id, ad.id));

      // A creative node exists only once an asset was actually attached. Rendering an
      // empty one for every ad would show a graph the database does not have.
      if (!ad.creativeAssetId) return;
      const media = ad.creativeMedia ?? {};
      const creativeNodeId = `${ad.id}:creative`;
      const creativeData: CreativeData = {
        label: readString(media, 'name') ?? 'Attached creative',
        status: 'draft',
        validationStatus: 'valid',
        assetType: readString(media, 'kind') === 'video' ? 'video' : 'image',
        ...(readString(media, 'url') ? { assetUrl: readString(media, 'url') } : {}),
        ...(readString(media, 'thumbnail_url')
          ? { thumbnailUrl: readString(media, 'thumbnail_url') }
          : {}),
        mediaId: ad.creativeAssetId,
        provenance: provenanceOf(
          ad.creativeAssetId,
          `${ad.pathKey}/creative`,
          gateForLevel('creative', read.gates),
          null,
        ),
      };
      nodes.push(
        node(creativeNodeId, 'creative', { x: x + adIndex * 240, y: ROW * 3 }, creativeData),
      );
      edges.push(edge(ad.id, creativeNodeId));
    });
  });

  // Audience groups sit in their own column past the ad sets, and connect to the ad
  // sets whose targeting was compiled FROM them — `payload.audience_group_version_id`
  // is that provenance. A group nothing references is still shown: it is a real,
  // approved audience the brand owns, and its absence from the tree is information.
  const audienceColumnX = Math.max(tree.adSets.length, 1) * COLUMN + 120;
  read.audiences.forEach((group, groupIndex) => {
    const audienceNodeId = `audience:${group.id}`;
    nodes.push(
      node(
        audienceNodeId,
        'audience',
        { x: audienceColumnX + groupIndex * COLUMN, y: ROW },
        audienceData(group),
      ),
    );
    for (const adSet of tree.adSets) {
      if (group.versionId && adSet.derived.audienceGroupVersionId === group.versionId) {
        edges.push(edge(adSet.id, audienceNodeId));
      }
    }
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
    },
  };
}
