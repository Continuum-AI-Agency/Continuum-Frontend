import type { CampaignCanvasEdge, CampaignCanvasNode } from '../types';

/**
 * Nodes a save could not carry: a Meta scaffold is ONE tree read from the campaign down
 * (campaign → ad set → ad → creative, audiences feeding ad sets from the side), so anything the
 * walk never reaches would vanish from the saved version. The canvas flags them, and the save
 * refuses while they exist — "Saved as vN" must never mean "saved most of it".
 */

const orphanErrorPrefix = 'Not connected';

export type OrphanNode = { nodeId: string; label: string; reason: string };

const REASONS: Record<string, string> = {
  'ad-set': 'this ad set is not under the campaign',
  ad: 'this ad is not under an ad set that belongs to the campaign',
  creative: 'this creative is not attached to an ad that belongs to the campaign',
  audience: 'this audience feeds no ad set that belongs to the campaign',
  'extra-creative': 'an ad takes one creative — use a carousel for several assets',
};

const META_TYPES = new Set(['campaign', 'ad-set', 'ad', 'audience', 'creative']);

export function collectOrphanNodes(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): OrphanNode[] {
  const meta = nodes.filter((node) => META_TYPES.has(node.type ?? ''));
  if (meta.length === 0) return [];
  const byId = new Map(meta.map((node) => [node.id, node]));
  const childrenOf = (id: string, type: string) =>
    edges
      .filter((edge) => edge.source === id && byId.get(edge.target)?.type === type)
      .map((edge) => edge.target);

  const reached = new Set<string>();
  const extraCreatives = new Set<string>();
  for (const campaign of meta.filter((node) => node.type === 'campaign')) {
    reached.add(campaign.id);
    for (const adSetId of childrenOf(campaign.id, 'ad-set')) {
      reached.add(adSetId);
      for (const adId of childrenOf(adSetId, 'ad')) {
        reached.add(adId);
        const [first, ...rest] = childrenOf(adId, 'creative');
        if (first) reached.add(first);
        for (const extra of rest) extraCreatives.add(extra);
      }
    }
  }
  for (const audience of meta.filter((node) => node.type === 'audience')) {
    const feedsReachedAdSet = edges.some(
      (edge) => edge.source === audience.id && reached.has(edge.target),
    );
    if (feedsReachedAdSet) reached.add(audience.id);
  }

  // A published group is a record of its own: left unconnected it loses nothing, and the canvas
  // shows every group the brand owns. Only drawn (broad) targeting is work a save could drop.
  const carriesWork = (node: CampaignCanvasNode) =>
    node.type !== 'audience' || ((node.data as { mode?: string }).mode ?? 'broad') === 'broad';

  return meta
    .filter((node) => node.type !== 'campaign' && !reached.has(node.id) && carriesWork(node))
    .map((node) => ({
      nodeId: node.id,
      label: node.data.label,
      reason: REASONS[extraCreatives.has(node.id) ? 'extra-creative' : (node.type ?? '')] ?? '',
    }));
}

export function applyOrphanValidation(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): CampaignCanvasNode[] {
  const orphans = new Map(
    collectOrphanNodes(nodes, edges).map((orphan) => [orphan.nodeId, orphan]),
  );
  return nodes.map((node) => {
    const retained = (node.data.validationErrors ?? []).filter(
      (error) => !error.startsWith(orphanErrorPrefix),
    );
    const orphan = orphans.get(node.id);
    const validationErrors = orphan
      ? [...retained, `${orphanErrorPrefix}: ${orphan.reason}, so a save would drop it.`]
      : retained;
    return {
      ...node,
      data: {
        ...node.data,
        validationErrors,
        validationStatus:
          validationErrors.length > 0
            ? 'error'
            : node.data.validationStatus === 'warning'
              ? 'warning'
              : 'valid',
      },
    };
  });
}
