'use client';

// The ONE write path for a node's CONFIG fields — the inspector's per-type sections
// today, the node context menus that still hold their own copies later.
//
// Generalized from VideoGenBlock's `applyConfigPatch`. The coercion is not cosmetic:
// `resolution` and `durationSeconds` are a single setting on Veo (above 720p only 8s
// renders) and `referenceMode` decides which handles the node draws, so a raw write
// produces a node that LOOKS configured and 400s at Run. Contracts' `coerceNodeConfig`
// is patch-safe — only the keys present in the patch are touched, `current` supplies
// context — so a prompt-only patch never has a model injected into it.
//
// `changes[]` is what the guard corrected. Swallowing it is how a user learns their
// 4s selection silently became 8s only by reading the footer, so it is surfaced.

import {
  coerceNodeConfig,
  type GeneratorNodeBounds,
  IMAGE_GENERATOR_NODE_BOUNDS,
  OMNI_GENERATOR_NODE_BOUNDS,
  type StudioNodeType,
  snapNodeDimensionsToAspectRatio,
  VIDEO_GENERATOR_NODE_BOUNDS,
} from '@continuum/contracts';
import { useCallback } from 'react';
import { useToastContext } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';

// Which sizing envelope each generator's box lives in. A type absent from this map
// has no aspect-ratio-driven geometry, so an `aspectRatio` write leaves the box alone.
const GENERATOR_BOUNDS_BY_TYPE: Record<string, GeneratorNodeBounds> = {
  nanoGen: IMAGE_GENERATOR_NODE_BOUNDS,
  videoGen: VIDEO_GENERATOR_NODE_BOUNDS,
  veoDirector: VIDEO_GENERATOR_NODE_BOUNDS,
  veoFast: VIDEO_GENERATOR_NODE_BOUNDS,
  omniGen: OMNI_GENERATOR_NODE_BOUNDS,
};

/**
 * The node's next box for an aspect-ratio write, or `undefined` when nothing moves.
 *
 * The ratio lives on the BOX, not on an inner element: a 9:16 selection that left a
 * 16:9 node behind shipped a landscape node whose footer read "9:16" (Airtable #230).
 * Current width is preserved rather than reset to the born size, so a node the user
 * has resized stays the size they made it.
 */
function nextAspectRatioStyle(
  node: StudioNode,
  nodeType: string,
  aspectRatio: unknown,
): { width: number; height: number } | undefined {
  if (typeof aspectRatio !== 'string') return undefined;
  const bounds = GENERATOR_BOUNDS_BY_TYPE[nodeType];
  if (!bounds) return undefined;

  return snapNodeDimensionsToAspectRatio({
    aspectRatio,
    currentWidth: node.style?.width ?? node.width ?? node.measured?.width,
    currentHeight: node.style?.height ?? node.height ?? node.measured?.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    fallbackWidth: bounds.fallbackWidth,
  });
}

export type NodeConfigPatcher = (
  nodeId: string,
  nodeType: string,
  patch: Record<string, unknown>,
) => void;

/**
 * `patch(nodeId, nodeType, { resolution: '1080p' })` — coerced, persisted, reported.
 *
 * Returns a stable callback so a section can bind it per node without re-rendering
 * the whole panel on every store tick.
 */
export function useNodeConfigPatch(): NodeConfigPatcher {
  const getNodeById = useStudioStore((state) => state.getNodeById);
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  // `useToastContext` rather than `useToast`: the hook must not throw itself out of a
  // surface that has no provider — a missing toast costs a warning, not the write.
  const toast = useToastContext();

  return useCallback(
    (nodeId, nodeType, patch) => {
      const node = getNodeById(nodeId);
      if (!node) return;

      const { data: coerced, changes } = coerceNodeConfig(
        nodeType as StudioNodeType,
        patch,
        node.data as Record<string, unknown>,
      );
      const style = nextAspectRatioStyle(node, nodeType, coerced.aspectRatio);

      updateNode(nodeId, (current) => ({
        ...current,
        data: { ...current.data, ...coerced } as StudioNode['data'],
        ...(style ? { style: { ...(current.style ?? {}), ...style } } : {}),
      }));
      triggerSave();

      if (changes.length > 0) {
        toast?.show({
          title: 'Setting adjusted',
          description: changes.join(' · '),
          variant: 'info',
          dedupeKey: `node-config-${nodeId}`,
        });
      }
    },
    [getNodeById, toast, triggerSave, updateNode],
  );
}
