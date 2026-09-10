/**
 * One OpenAI Ads campaign read -> the canvas graph.
 *
 * Pure, like its Meta sibling `hydrate.ts`: no React, no fetch. `lib/api/openaiAds.ts`
 * does the reading, this does the mapping, and `useCampaignStore.loadOpenAiGraph` does the
 * setting — so the shape a hydrated node ends up with is testable without a browser.
 *
 * `openAiId` on every node is what makes this a RECORD rather than a draft, and it is what
 * the publish diff reads: a node carrying one is UPDATED, a node without one is CREATED.
 * Getting that wrong in either direction is how you get a duplicate campaign or a silent
 * no-op, so the id is set here and nowhere else.
 */

import type {
  OpenAiAdsAd,
  OpenAiAdsAdGroup,
  OpenAiAdsCampaign,
  OpenAiAdsCampaignTree,
} from '@continuum/contracts';
import type {
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignCanvasNodeData,
  OpenAiAdData,
  OpenAiAdGroupData,
  OpenAiCampaignData,
} from '@/CampaignCanvas/types';

/** What the store needs to know about where an OpenAI graph came from. */
export type OpenAiCanvasHydration = {
  adAccountId: string;
  campaignId: string;
  campaignName: string;
  /** The campaign's status ON OpenAI at read time. */
  campaignStatus: string;
  loadedAt: string;
};

export type HydratedOpenAiGraph = {
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
  hydration: OpenAiCanvasHydration;
};

const COLUMN = 340;
const ROW = 260;

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

/**
 * The canvas's own status vocabulary, which is not OpenAI's. `archived` has no canvas
 * equivalent and reads as paused — an archived object cannot be edited back to life, and
 * the publish diff refuses to touch one.
 */
const canvasStatusOf = (status: string | null | undefined): OpenAiCampaignData['status'] => {
  if (status === 'active') return 'active';
  if (status === 'archived') return 'archived';
  return 'paused';
};

const biddingTypeOf = (value: string | null | undefined): OpenAiCampaignData['biddingType'] =>
  value === 'clicks' || value === 'conversions' ? value : 'impressions';

const billingEventOf = (value: string | null | undefined): OpenAiAdGroupData['billingEventType'] =>
  value === 'click' ? 'click' : 'impression';

const creativeTypeOf = (value: string | null | undefined): OpenAiAdData['creativeType'] =>
  value === 'product_ad_template' ? 'product_ad_template' : 'chat_card';

/** Unix seconds -> the `datetime-local`-shaped string the node editors bind to. */
const isoOf = (unixSeconds: number | null | undefined): string | undefined =>
  typeof unixSeconds === 'number' && Number.isFinite(unixSeconds)
    ? new Date(unixSeconds * 1000).toISOString()
    : undefined;

export function buildOpenAiCampaignNodeData(
  campaign: OpenAiAdsCampaign,
  currencyCode?: string | null,
): OpenAiCampaignData {
  const locations = campaign.targeting?.locations?.include ?? [];
  return {
    label: campaign.name,
    status: canvasStatusOf(campaign.status),
    validationStatus: 'valid',
    biddingType: biddingTypeOf(campaign.bidding_type),
    ...(campaign.budget?.lifetime_spend_limit_micros != null
      ? { lifetimeSpendLimitMicros: campaign.budget.lifetime_spend_limit_micros }
      : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(campaign.description ? { description: campaign.description } : {}),
    ...(isoOf(campaign.start_time) ? { startTime: isoOf(campaign.start_time) } : {}),
    ...(isoOf(campaign.end_time) ? { endTime: isoOf(campaign.end_time) } : {}),
    locationIds: locations.map((location) => location.id),
    locationLabels: locations.map((location) => location.name ?? location.id),
    conversionEventSettingIds: campaign.conversion_event_setting_ids ?? [],
    openAiId: campaign.id,
    openAiStatus: campaign.status,
  };
}

export function buildOpenAiAdGroupNodeData(
  adGroup: OpenAiAdsAdGroup,
  currencyCode?: string | null,
): OpenAiAdGroupData {
  return {
    label: adGroup.name,
    status: canvasStatusOf(adGroup.status),
    validationStatus: 'valid',
    billingEventType: billingEventOf(adGroup.bidding_config?.billing_event_type),
    ...(adGroup.bidding_config?.max_bid_micros != null
      ? { maxBidMicros: adGroup.bidding_config.max_bid_micros }
      : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(adGroup.description ? { description: adGroup.description } : {}),
    contextHints: adGroup.context_hints ?? [],
    openAiId: adGroup.id,
    openAiStatus: adGroup.status,
  };
}

export function buildOpenAiAdNodeData(ad: OpenAiAdsAd): OpenAiAdData {
  // `?? {}` widens to `{}` and loses every field name; name the type so the reads below
  // stay checked against the contract rather than against an empty object.
  const creative: Partial<NonNullable<OpenAiAdsAd['creative']>> = ad.creative ?? {};
  return {
    label: ad.name,
    status: canvasStatusOf(ad.status),
    validationStatus: 'valid',
    creativeType: creativeTypeOf(creative.type),
    title: creative.title ?? '',
    body: creative.body ?? '',
    ...(creative.target_url ? { targetUrl: creative.target_url } : {}),
    ...(creative.file_id ? { fileId: creative.file_id } : {}),
    ...(creative.image_url ? { imageUrl: creative.image_url } : {}),
    openAiId: ad.id,
    openAiStatus: ad.status,
    ...(ad.review_status ? { reviewStatus: ad.review_status } : {}),
  };
}

/**
 * Node ids are the OpenAI ids themselves rather than fresh uuids. The canvas only ever
 * shows one campaign at a time, OpenAI ids are unique within an account, and using them
 * means a re-hydrate after a publish lands on the SAME node ids — so selection, position
 * and the undo stack survive a refresh instead of the graph appearing to be replaced.
 */
export function buildHydratedOpenAiGraph(
  tree: OpenAiAdsCampaignTree,
  context: { adAccountId: string; currencyCode?: string | null },
): HydratedOpenAiGraph {
  const nodes: CampaignCanvasNode[] = [];
  const edges: CampaignCanvasEdge[] = [];

  const campaignId = tree.campaign.id;
  nodes.push(
    node(
      campaignId,
      'openai-campaign',
      { x: 0, y: 0 },
      buildOpenAiCampaignNodeData(tree.campaign, context.currencyCode),
    ),
  );

  tree.ad_groups.forEach((group, groupIndex) => {
    const x = groupIndex * COLUMN;
    nodes.push(
      node(
        group.ad_group.id,
        'openai-ad-group',
        { x, y: ROW },
        buildOpenAiAdGroupNodeData(group.ad_group, context.currencyCode),
      ),
    );
    edges.push(edge(campaignId, group.ad_group.id));

    group.ads.forEach((ad, adIndex) => {
      nodes.push(
        node(
          ad.id,
          'openai-ad',
          { x: x + adIndex * (COLUMN / 2), y: ROW * 2 },
          buildOpenAiAdNodeData(ad),
        ),
      );
      edges.push(edge(group.ad_group.id, ad.id));
    });
  });

  return {
    nodes,
    edges,
    hydration: {
      adAccountId: context.adAccountId,
      campaignId,
      campaignName: tree.campaign.name,
      campaignStatus: tree.campaign.status,
      loadedAt: new Date().toISOString(),
    },
  };
}
