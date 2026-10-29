'use client';

import { useCallback } from 'react';
import { withUserGave } from '@/lib/campaign-canvas/fieldProvenance';
import { useCampaignStore } from '../stores/useCampaignStore';
import { type CampaignCanvasNodeData, isOpenAiCampaignNodeType } from '../types';

/**
 * `updateNodeData` for a control a PERSON operates: the same write, plus the fields it changes
 * relabelled 'user_gave'. Jaina's own canvas edits go through the store's `updateNodeData`
 * directly and keep the label they had, which is the whole reason this is a separate door.
 *
 * Reads the node at call time, not at render, so two commits in one tick each see the other.
 */
export function usePersonEdit() {
  const updateNodeData = useCampaignStore((store) => store.updateNodeData);
  return useCallback(
    (id: string, patch: Partial<CampaignCanvasNodeData>) => {
      const node = useCampaignStore.getState().nodes.find((entry) => entry.id === id);
      if (!node?.type || isOpenAiCampaignNodeType(node.type)) {
        updateNodeData(id, patch);
        return;
      }
      updateNodeData(
        id,
        withUserGave(
          node.type,
          node.data as Record<string, unknown>,
          patch as Record<string, unknown>,
        ),
      );
    },
    [updateNodeData],
  );
}
