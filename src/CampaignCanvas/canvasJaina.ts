'use client';

import { createContext, useContext } from 'react';
import type { CanvasHydration } from '@/lib/campaign-canvas/hydrate';
import { useCampaignStore } from './stores/useCampaignStore';
import type {
  AdData,
  AdSetData,
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CreativeData,
} from './types';

/**
 * The Jaina chat beside this canvas — the canvas page's floating panel, or the Scale page's
 * chat next to its companion canvas. Absent when no chat is beside it, and then nothing on
 * the canvas offers to hand work to Jaina.
 */
export type CanvasJaina = {
  generateForCreative: (creativeNodeId: string) => void;
};

export const CanvasJainaContext = createContext<CanvasJaina | null>(null);

export const useCanvasJaina = (): CanvasJaina | null => useContext(CanvasJainaContext);

const quoted = (label: string, value: string | undefined): string | null =>
  value?.trim() ? `${label}: ${JSON.stringify(value.trim())}` : null;

/**
 * The turn "Generate with Jaina" sends for one creative: which ad, in which saved version,
 * and what that ad already says — so the creative is made FOR the ad, not in a vacuum.
 *
 * Null when the creative feeds no saved ad: only a saved node has the path_key the attach
 * needs, so an unsaved draft has nothing to generate into yet.
 */
export function creativeGenerationPrompt(params: {
  nodes: readonly CampaignCanvasNode[];
  edges: readonly CampaignCanvasEdge[];
  hydration: CanvasHydration | null;
  creativeNodeId: string;
}): string | null {
  const { nodes, edges, hydration, creativeNodeId } = params;
  if (!hydration) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentOf = (id: string, type: CampaignCanvasNode['type']) =>
    edges
      .filter((edge) => edge.target === id)
      .map((edge) => byId.get(edge.source))
      .find((node) => node?.type === type);

  const creative = byId.get(creativeNodeId);
  const ad = parentOf(creativeNodeId, 'ad');
  const pathKey = ad?.data.provenance?.pathKey;
  if (!creative || !ad || !pathKey) return null;
  const adData = ad.data as AdData;
  const adSet = parentOf(ad.id, 'ad-set');
  const format = (creative.data as CreativeData).assetType ?? 'image';

  return [
    `Generate a ${format} creative for the ad ${JSON.stringify(adData.label)} (path_key ${pathKey}) ` +
      `in the scaffold ${JSON.stringify(hydration.scaffoldName)} v${hydration.version} ` +
      `(scaffold_version_id ${hydration.versionId}), then attach it to that ad with ` +
      'paid_scaffold_attach_creative. If an asset already in the Library clearly fits this ad, ' +
      'attach that instead of generating. Do not propose a new scaffold.',
    [
      quoted('Headline', adData.headline),
      quoted('Primary text', adData.primaryText),
      quoted('Description', adData.description),
      adData.callToAction ? `Call to action: ${adData.callToAction}` : null,
      quoted('Link', adData.linkUrl),
      adSet ? quoted('Ad set', (adSet.data as AdSetData).label) : null,
    ]
      .filter(Boolean)
      .join('. '),
  ]
    .filter(Boolean)
    .join('\n');
}

/** A canvas's hand-offs, each ending in `send` with the turn to put in the chat. */
export const canvasJainaSending = (send: (text: string) => void): CanvasJaina => ({
  generateForCreative: (creativeNodeId) => {
    const graph = useCampaignStore.getState();
    const text = creativeGenerationPrompt({
      nodes: graph.nodes,
      edges: graph.edges,
      hydration: graph.hydration,
      creativeNodeId,
    });
    if (text) send(text);
  },
});
