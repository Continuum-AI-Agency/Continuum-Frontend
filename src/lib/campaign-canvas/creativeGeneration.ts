import {
  type PaidScaffoldCreativeTarget,
  paidCanvasCreativeContextSchema,
} from '@continuum/contracts';
import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';
import { isAdFormatCompatibleWithCreativeType } from '@/CampaignCanvas/types/adCreativeCompatibility';
import type { CreativeArtifact } from '@/lib/jaina/schemas';
import type { CanvasHydration } from './hydrate';
import { buildCampaignCanvasPayload, buildCampaignCanvasProposalBlock } from './payload';

export type CampaignCreativeRequest = {
  id: string;
  query: string;
  brandId: string;
  adAccountId: string;
};

/** Positions, selection and validation chrome do not change a creative brief. */
export async function campaignCreativeRevision(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
) {
  const payload = buildCampaignCanvasPayload(nodes, edges, { source: 'propose' });
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      nodes: payload.nodes.map(({ nodeId, nodeType, label, options }) => ({
        nodeId,
        nodeType,
        label,
        options,
      })),
      edges: payload.edges.map(({ sourceNodeId, targetNodeId }) => ({
        sourceNodeId,
        targetNodeId,
      })),
    }),
  );
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function scaffoldCreativeQuery(
  target: PaidScaffoldCreativeTarget,
  format: 'image' | 'video' = 'image',
) {
  return `Generate / Enrich one ${format} creative for this exact reviewed ad slot. Use paid_creative_generate with scaffold_target=${JSON.stringify(target)}. Read the brand's measured creative evidence and approved references to shape the hook and visuals. Its campaign goal, audience, copy, budget and economics are grounded server-side. Ask for the generation permission gate; the finished asset attaches automatically. Do not publish, enroll, or generate twice for a pending ticket.`;
}

export async function buildCampaignCreativeRequest(input: {
  nodeId: string;
  brandId: string;
  adAccountId: string;
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
  hydration: CanvasHydration | null;
  isDirty: boolean;
  format?: 'image' | 'video';
}): Promise<CampaignCreativeRequest> {
  const creative = input.nodes.find((node) => node.id === input.nodeId && node.type === 'creative');
  if (!creative || creative.type !== 'creative') throw new Error('Select a creative slot first.');
  const parent = (id: string, type: string) => {
    const ids = input.edges.filter((edge) => edge.target === id).map((edge) => edge.source);
    const matches = input.nodes.filter((node) => ids.includes(node.id) && node.type === type);
    if (matches.length !== 1)
      throw new Error('Connect this creative to exactly one ad, ad set and campaign.');
    return matches[0]!;
  };
  const ad = parent(creative.id, 'ad');
  const adSet = parent(ad.id, 'ad-set');
  const campaign = parent(adSet.id, 'campaign');
  if (ad.type !== 'ad' || adSet.type !== 'ad-set' || campaign.type !== 'campaign')
    throw new Error('A complete Meta campaign is required.');
  const format = input.format ?? (creative.data.assetType === 'video' ? 'video' : 'image');
  const adFormat = ad.data.adFormat;
  if (
    adFormat !== undefined &&
    adFormat !== 'IMAGE' &&
    adFormat !== 'VIDEO' &&
    adFormat !== 'CAROUSEL' &&
    adFormat !== 'COLLECTION'
  )
    throw new Error('Review the connected ad format first.');
  if (input.isDirty && !isAdFormatCompatibleWithCreativeType(adFormat, format))
    throw new Error('Change the connected ad format before generating this media type.');
  const revision = await campaignCreativeRevision(input.nodes, input.edges);
  let query: string;
  if (!input.isDirty && input.hydration?.contentHash && ad.data.provenance) {
    if (!['proposed', 'built'].includes(input.hydration.lifecycle))
      throw new Error('Propose a new scaffold version before changing a published creative.');
    query = scaffoldCreativeQuery(
      {
        scaffold_version_id: input.hydration.versionId,
        content_hash: input.hydration.contentHash,
        path_key: ad.data.provenance.pathKey,
        expected_asset_id: typeof creative.data.mediaId === 'string' ? creative.data.mediaId : null,
      },
      format,
    );
  } else {
    const audiences = input.edges
      .filter((edge) => edge.source === adSet.id)
      .flatMap((edge) => {
        const node = input.nodes.find(
          (item) => item.id === edge.target && item.type === 'audience',
        );
        return node ? [node.data] : [];
      });
    const context = paidCanvasCreativeContextSchema.parse({
      objective: campaign.data.objective,
      optimization_goal: adSet.data.optimizationGoal,
      funnel_stage: adSet.data.funnelStage ?? 'prospecting',
      audience_context: JSON.stringify(audiences),
      daily_budget: adSet.data.budgetType === 'LIFETIME' ? null : (adSet.data.budgetAmount ?? null),
      budget_currency: adSet.data.budgetCurrency ?? '',
      primary_text: ad.data.primaryText ?? '',
      headline: ad.data.headline ?? '',
      description: ad.data.description ?? null,
      cta: ad.data.callToAction ?? 'LEARN_MORE',
      destination_url: typeof ad.data.link === 'string' ? ad.data.link : null,
    });
    const target = {
      brand_id: input.brandId,
      ad_account_id: input.adAccountId,
      node_id: creative.id,
      revision,
    };
    query = `Generate / Enrich one ${format} creative for the selected canvas slot. Use paid_creative_generate with canvas_target=${JSON.stringify(target)} and canvas_context_json set to this exact JSON string: ${JSON.stringify(context)}. Ground the hook and visuals in the brand's measured creative evidence and approved references. Ask for the generation permission gate. Return the finished creative to this local slot; do not attach it to an old persisted scaffold, publish, enroll, or generate twice for a pending ticket.`;
  }
  const payload = buildCampaignCanvasPayload(input.nodes, input.edges, {
    source: 'propose',
    brandProfileId: input.brandId,
    adAccountId: input.adAccountId,
  });
  return {
    id: crypto.randomUUID(),
    brandId: input.brandId,
    adAccountId: input.adAccountId,
    query:
      query +
      '\n\n' +
      buildCampaignCanvasProposalBlock(
        payload,
        'Selected creative node: ' + input.nodeId + '. These are the current human edits.',
      ),
  };
}

/** Only the requested slot may receive a completion; local edits win over late media. */
export async function creativeCanvasUpdate(
  creative: CreativeArtifact,
  scope: { brandId: string; adAccountId: string },
  graph: {
    nodes: CampaignCanvasNode[];
    edges: CampaignCanvasEdge[];
    hydration: CanvasHydration | null;
    isDirty: boolean;
  },
) {
  let node: CampaignCanvasNode | undefined;
  if (creative.canvas_target) {
    const target = creative.canvas_target;
    if (
      target.brand_id !== scope.brandId ||
      target.ad_account_id.replace(/^act_/, '') !== scope.adAccountId.replace(/^act_/, '')
    )
      return null;
    if (target.revision !== (await campaignCreativeRevision(graph.nodes, graph.edges))) return null;
    node = graph.nodes.find((item) => item.id === target.node_id && item.type === 'creative');
  } else if (creative.scaffold_target && creative.attachment_status === 'attached') {
    const target = creative.scaffold_target;
    if (
      graph.isDirty ||
      graph.hydration?.versionId !== target.scaffold_version_id ||
      graph.hydration.adAccountId.replace(/^act_/, '') !== scope.adAccountId.replace(/^act_/, '')
    )
      return null;
    node = graph.nodes.find(
      (item) =>
        item.type === 'creative' &&
        item.data.provenance?.pathKey === `${target.path_key}/creative` &&
        (item.data.mediaId ?? null) === target.expected_asset_id,
    );
  }
  if (!node || node.type !== 'creative' || !creative.asset_id) return null;
  return {
    nodeId: node.id,
    data: {
      mediaId: creative.asset_id,
      assetUrl: creative.url,
      thumbnailUrl: creative.thumbnail_url ?? creative.url,
      assetType: creative.format === 'video' ? ('video' as const) : ('image' as const),
    },
  };
}
