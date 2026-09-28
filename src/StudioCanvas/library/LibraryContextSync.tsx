'use client';

// Keeps the room's Library context fresh and does the two writes that context enables.
//
// READ: one media.canvas_library_context call for every asset + pinned version the room
// holds, re-run when the set of pointers changes, when the Library changes a row we hold
// (Realtime on the brand's media.assets — head version and review decision live there —
// and media.comments), and when the tab regains focus.
//
// WRITES, both idempotent:
// - the review decision a node has SEEN (`libraryAckReviewStatus`) is stamped the first
//   time the node meets its asset, so a later decision reads as a change, not as news;
// - an output registered while the room is open gets its lineage re-pointed at the exact
//   versions its inputs pinned (media.record_canvas_lineage), whichever path registered it
//   (the Backend generator, register-canvas, an action). Outputs that were already there
//   when the room loaded are left alone: their wiring may have changed since they ran.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { useStudioStore } from '../stores/useStudioStore';
import {
  fetchCanvasLibraryContext,
  recordCanvasLineage,
  useLibraryContextStore,
} from './libraryContextStore';
import { libraryNodeRef, pinnedUpstreamSources } from './libraryNodeRef';

const REFRESH_DEBOUNCE_MS = 300;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export function LibraryContextSync() {
  const brandId = useStudioStore((state) => state.brandId) ?? null;
  const roomId = useStudioStore((state) => state.activeRoomId) ?? null;
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const assets = useLibraryContextStore((state) => state.assets);

  const pointers = useMemo(() => {
    const assetIds = new Set<string>();
    const versionIds = new Set<string>();
    for (const node of nodes) {
      const ref = libraryNodeRef(node.data);
      if (!ref) continue;
      assetIds.add(ref.assetId);
      if (ref.versionId) versionIds.add(ref.versionId);
    }
    return { assetIds: [...assetIds].sort(), versionIds: [...versionIds].sort() };
  }, [nodes]);
  const pointerKey = `${pointers.assetIds.join(',')}|${pointers.versionIds.join(',')}`;
  const pointersRef = useRef(pointers);
  pointersRef.current = pointers;

  const refresh = useCallback(async () => {
    const current = pointersRef.current;
    if (!brandId || current.assetIds.length === 0) return;
    try {
      const context = await fetchCanvasLibraryContext(
        brandId,
        current.assetIds,
        current.versionIds,
      );
      useLibraryContextStore.getState().apply(brandId, context);
    } catch (error) {
      useLibraryContextStore
        .getState()
        .fail(error instanceof Error ? error.message : 'Could not read the Library');
    }
  }, [brandId]);

  useEffect(() => {
    useLibraryContextStore.getState().reset(brandId);
  }, [brandId]);

  useEffect(() => {
    if (!brandId || pointerKey === '|') return;
    const timer = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [brandId, pointerKey, refresh]);

  useEffect(() => {
    if (!brandId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (assetId: unknown) => {
      if (typeof assetId !== 'string' || !pointersRef.current.assetIds.includes(assetId)) return;
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    };
    const stop = subscribeToPostgresChanges({
      label: 'canvas-library-context',
      bindings: [
        {
          event: 'UPDATE',
          schema: 'media',
          table: 'assets',
          filter: `brand_id=eq.${brandId}`,
          onRow: (row) => schedule(row.id),
        },
        {
          event: '*',
          schema: 'media',
          table: 'comments',
          filter: `brand_id=eq.${brandId}`,
          onRow: (row) => schedule(row.asset_id),
        },
      ],
    });
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      stop();
      window.removeEventListener('focus', onFocus);
    };
  }, [brandId, refresh]);

  // First sight of a node's asset: remember the decision it was linked under.
  useEffect(() => {
    const { updateNodeData, triggerSave } = useStudioStore.getState();
    let stamped = false;
    for (const node of nodes) {
      const ref = libraryNodeRef(node.data);
      const asset = ref ? assets[ref.assetId] : undefined;
      if (!asset || text((node.data as Record<string, unknown>).libraryAckReviewStatus)) continue;
      updateNodeData(node.id, { libraryAckReviewStatus: asset.reviewStatus });
      stamped = true;
    }
    if (stamped) triggerSave();
  }, [assets, nodes]);

  // Output version each node held when first seen; only a CHANGE is a fresh registration.
  const seenOutputs = useRef(new Map<string, string | null>());
  const recorded = useRef(new Set<string>());
  useEffect(() => {
    if (!brandId) return;
    for (const node of nodes) {
      const data = node.data as Record<string, unknown>;
      const versionId = text(data.renderOutputAssetVersionId);
      if (!seenOutputs.current.has(node.id)) {
        seenOutputs.current.set(node.id, versionId);
        continue;
      }
      if (!versionId || seenOutputs.current.get(node.id) === versionId) continue;
      if (data.libraryLineagePinnedFor === versionId || recorded.current.has(versionId)) continue;
      const sources = pinnedUpstreamSources(nodes, edges, node.id);
      if (sources.length === 0) continue;
      recorded.current.add(versionId);
      recordCanvasLineage({
        p_brand_id: brandId,
        p_derived_version_id: versionId,
        p_operation: 'canvas_generation',
        p_sources: sources,
        p_parameters: { roomId, nodeId: node.id },
      })
        .then(() => {
          const { updateNodeData, triggerSave } = useStudioStore.getState();
          updateNodeData(node.id, { libraryLineagePinnedFor: versionId });
          triggerSave();
        })
        .catch((error: unknown) => {
          console.warn('[canvas-library] pinned lineage not recorded', {
            nodeId: node.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
  }, [brandId, roomId, nodes, edges]);

  return null;
}
