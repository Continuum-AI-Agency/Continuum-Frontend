/**
 * Hierarchical layout for the scaffold tree canvas.
 *
 * Written rather than pulled in: dagre/elk/d3-hierarchy are none of them installed,
 * the pre-push hook runs a bundle budget check, and a general graph-layout engine is
 * the wrong tool for a strict three-level tree with a single root. This is the tidy
 * -tree algorithm reduced to the only case that exists here — place the leaves in
 * order, then centre each parent over its children.
 *
 * Pure and deterministic: same tree in, same coordinates out. No React, no xyflow
 * imports beyond the node/edge shapes the canvas needs.
 */

import type { ScaffoldTree } from './scaffoldTree';

export const SCAFFOLD_LEVEL_GAP = 260;
export const SCAFFOLD_SIBLING_GAP = 36;
export const SCAFFOLD_CAMPAIGN_WIDTH = 300;
export const SCAFFOLD_ADSET_WIDTH = 260;
export const SCAFFOLD_AD_WIDTH = 220;

export type ScaffoldFlowNodeKind = 'scaffoldCampaign' | 'scaffoldAdSet' | 'scaffoldAd';

export type ScaffoldFlowNode = {
  id: string;
  type: ScaffoldFlowNodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type ScaffoldFlowEdge = {
  id: string;
  source: string;
  target: string;
};

export type ScaffoldLayout = {
  nodes: ScaffoldFlowNode[];
  edges: ScaffoldFlowEdge[];
};

/** Midpoint of the children's own centres — the whole of "centre a parent". */
const centreOf = (childCentres: readonly number[]): number => {
  if (childCentres.length === 0) return 0;
  return (childCentres[0] + childCentres[childCentres.length - 1]) / 2;
};

/**
 * Node ids are `pathKey`s, not database ids. That is what lets the canvas and the
 * table share one `selectedPathKey` without a lookup table, and it keeps the layout
 * testable without inventing uuids.
 */
export const layoutScaffoldTree = (tree: ScaffoldTree): ScaffoldLayout => {
  const nodes: ScaffoldFlowNode[] = [];
  const edges: ScaffoldFlowEdge[] = [];

  let adCursorX = 0;
  const adSetCentres: number[] = [];

  for (const adSet of tree.adSets) {
    const adCentres: number[] = [];

    for (const ad of adSet.ads) {
      const x = adCursorX;
      adCursorX += SCAFFOLD_AD_WIDTH + SCAFFOLD_SIBLING_GAP;
      adCentres.push(x + SCAFFOLD_AD_WIDTH / 2);
      nodes.push({
        id: ad.pathKey,
        type: 'scaffoldAd',
        position: { x, y: SCAFFOLD_LEVEL_GAP * 2 },
        data: {
          name: ad.name,
          conceptKey: ad.conceptKey,
          status: ad.status,
          metaCreativeId: ad.metaCreativeId,
          errorMessage: ad.errorMessage,
        },
      });
      edges.push({
        id: `${adSet.pathKey}->${ad.pathKey}`,
        source: adSet.pathKey,
        target: ad.pathKey,
      });
    }

    // An ad set with no ads still needs a column of its own, or the next one lands on
    // top of it.
    const adSetCentre =
      adCentres.length > 0
        ? centreOf(adCentres)
        : (() => {
            const centre = adCursorX + SCAFFOLD_ADSET_WIDTH / 2;
            adCursorX += SCAFFOLD_ADSET_WIDTH + SCAFFOLD_SIBLING_GAP;
            return centre;
          })();

    adSetCentres.push(adSetCentre);
    nodes.push({
      id: adSet.pathKey,
      type: 'scaffoldAdSet',
      position: { x: adSetCentre - SCAFFOLD_ADSET_WIDTH / 2, y: SCAFFOLD_LEVEL_GAP },
      data: {
        name: adSet.name,
        productKey: adSet.productKey,
        angleKey: adSet.angleKey,
        status: adSet.status,
        adCount: adSet.ads.length,
        errorMessage: adSet.errorMessage,
        choices: adSet.choices,
      },
    });
  }

  if (tree.campaign) {
    const campaignCentre = centreOf(adSetCentres);
    nodes.push({
      id: tree.campaign.pathKey,
      type: 'scaffoldCampaign',
      position: { x: campaignCentre - SCAFFOLD_CAMPAIGN_WIDTH / 2, y: 0 },
      data: {
        name: tree.campaign.name,
        status: tree.campaign.status,
        metaObjectId: tree.campaign.metaObjectId,
        adSetCount: tree.counts.adSets,
        adCount: tree.counts.ads,
        choices: tree.campaign.choices,
        derived: tree.campaign.derived,
      },
    });
    for (const adSet of tree.adSets) {
      edges.push({
        id: `${tree.campaign.pathKey}->${adSet.pathKey}`,
        source: tree.campaign.pathKey,
        target: adSet.pathKey,
      });
    }
  }

  return { nodes, edges };
};
