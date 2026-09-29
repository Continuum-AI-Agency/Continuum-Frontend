'use client';

import type { PaidScaffoldDraftNode } from '@continuum/contracts';
import * as React from 'react';
import { useCampaignStore } from '@/CampaignCanvas/stores/useCampaignStore';
import type { CanvasHydration } from '@/lib/campaign-canvas/hydrate';
import { buildScaffoldSaveRequest } from '@/lib/campaign-canvas/saveVersion';
import {
  buildScaffoldTree,
  type PaidScaffoldNodeRow,
  type ScaffoldTree,
} from '@/lib/paid-media/scaffoldTree';

/**
 * A canvas draft as the rows a scaffold card draws from.
 *
 * Keyed on `path_key`, the one name a node keeps across versions: a node the draft kept
 * carries its saved row's status and Meta ids, and a node it added reads as not yet built.
 */
export function draftRowsOf(
  nodes: readonly PaidScaffoldDraftNode[],
  hydration: Pick<CanvasHydration, 'sourceRows'>,
): PaidScaffoldNodeRow[] {
  const savedByPathKey = new Map(
    Object.values(hydration.sourceRows).map((row) => [row.pathKey, row]),
  );
  return nodes.map((node) => {
    const saved = savedByPathKey.get(node.path_key);
    const creative = node.level === 'ad' ? node.creative : null;
    return {
      id: node.path_key,
      parentId: node.parent_path_key,
      level: node.level,
      ordinal: node.ordinal,
      pathKey: node.path_key,
      name: node.name,
      productKey: node.product_key,
      angleKey: node.angle_key,
      conceptKey: node.concept_key,
      payload: {
        ...(saved?.payload ?? {}),
        ...(node.objective ? { objective: node.objective } : {}),
        ...(node.optimization_goal ? { optimization_goal: node.optimization_goal } : {}),
        ...(node.funnel_stage ? { funnel_stage: node.funnel_stage } : {}),
        ...(node.audience_group_version_id
          ? { audience_group_version_id: node.audience_group_version_id }
          : {}),
      },
      status: saved?.status ?? 'pending',
      metaObjectId: saved?.metaObjectId ?? null,
      metaCreativeId: saved?.metaCreativeId ?? null,
      errorMessage: null,
      attempt: saved?.attempt ?? 0,
      creativeAssetId: creative?.cards[0]?.asset_id ?? null,
      creativeMedia: creative
        ? creative.format === 'carousel'
          ? { kind: 'carousel', cards: creative.cards }
          : { kind: creative.format, asset_id: creative.cards[0]?.asset_id }
        : null,
      dailyBudgetMinorUnits: node.daily_budget_minor_units ?? saved?.dailyBudgetMinorUnits ?? null,
    };
  });
}

/**
 * The canvas's live draft of THIS scaffold, when the canvas holds it — so an edit on the
 * companion canvas shows in the chat's card as it is made, not after a save. Null otherwise.
 */
export function useLiveCanvasTree(parentScaffoldId: string | null): ScaffoldTree | null {
  const hydration = useCampaignStore((store) => store.hydration);
  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const lastGood = React.useRef<{ scaffoldId: string; tree: ScaffoldTree } | null>(null);

  return React.useMemo(() => {
    if (!parentScaffoldId || hydration?.scaffoldId !== parentScaffoldId) return null;
    try {
      const request = buildScaffoldSaveRequest({ nodes, edges, hydration });
      const tree = buildScaffoldTree(draftRowsOf(request.nodes, hydration));
      lastGood.current = { scaffoldId: parentScaffoldId, tree };
      return tree;
    } catch {
      // ponytail: a mid-edit graph the save refuses (a link half typed) keeps the last good
      // tree; add a lighter draft reader if that freezes the card too often.
      return lastGood.current?.scaffoldId === parentScaffoldId ? lastGood.current.tree : null;
    }
  }, [edges, hydration, nodes, parentScaffoldId]);
}
