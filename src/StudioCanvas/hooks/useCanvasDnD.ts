import type { StudioNodeType } from '@continuum/contracts';
import { createNodeData } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import type React from 'react';
import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/ToastProvider';
import {
  defaultElementUseIntent,
  type ElementCategory,
  elementReferenceTypeForUse,
} from '@/lib/ai-studio/elements';
import { ELEMENT_DRAG_TYPE, parseElementDragPayload } from '@/lib/ai-studio/referenceDrop';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { STUDIO_ASSET_DROP_EFFECT } from '@/lib/creative-assets/studioAssetDrop';
import { createNodeConfig, isStudioCanvasNodeType } from '../components/canvasNodeTypes';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { resolveCanvasDropBase64 } from '../utils/resolveCanvasDropBase64';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import {
  resolveBurnInDropTarget,
  resolveSidebarDropTarget,
} from '../utils/resolveSidebarDropTarget';
import { buildBurnInOverlay } from './useEdgeDropNode';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

// Everything the canvas accepts by drag: a node type dragged out of the add-node
// catalog, and a creative asset dragged in from the Library, the sidebar or the
// desktop. Dropping an asset near a generator also wires it, which is why this
// needs the graph and not just the pointer.
export function useCanvasDnD() {
  const { nodes, edges, setNodes, setEdges, takeSnapshot, triggerSave, defaultEdgeType } =
    useStudioStore();
  const { screenToFlowPosition } = useReactFlow();
  const { show } = useToast();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // Must match the drag source's effectAllowed (STUDIO_ASSET_DROP_EFFECT); a
    // mismatched dropEffect makes the browser drop the drop and never fire onDrop.
    event.dataTransfer.dropEffect = STUDIO_ASSET_DROP_EFFECT;
  }, []);

  const onNodeDragStart = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  const onNodeDragStop = useCallback(() => {
    triggerSave();
  }, [triggerSave]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      takeSnapshot();

      const droppedType = event.dataTransfer.getData('application/reactflow');
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (isStudioCanvasNodeType(droppedType)) {
        const canonicalType: StudioNodeType =
          droppedType === 'veoDirector' || droppedType === 'veoFast' ? 'videoGen' : droppedType;
        const { data, style } = createNodeConfig(canonicalType);
        const newNode: StudioNode = {
          id: uuidv4(),
          type: canonicalType,
          position,
          data: data as StudioNode['data'],
          style,
        } as StudioNode;

        setNodes(nodes.concat(newNode));
        triggerSave();
        return;
      }

      // An Element drops a NODE that points at the Element, not the reference image:
      // regenerating the reference then reaches every canvas already using it.
      const elementPayload = parseElementDragPayload(event.dataTransfer.getData(ELEMENT_DRAG_TYPE));
      if (elementPayload) {
        const { data, style } = createNodeData('element');
        const category = elementPayload.category as ElementCategory;
        const useIntent = defaultElementUseIntent(category);
        const elementNode: StudioNode = {
          id: uuidv4(),
          type: 'element',
          position,
          data: {
            ...data,
            elementId: elementPayload.elementId,
            elementName: elementPayload.name,
            elementCategory: elementPayload.category,
            previewUrl: elementPayload.previewUrl,
            useIntent,
            referenceType: elementReferenceTypeForUse(category, useIntent),
          },
          style,
        } as StudioNode;
        setNodes(nodes.concat(elementNode));
        triggerSave();
        return;
      }

      const rawPayload =
        event.dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) ||
        event.dataTransfer.getData(RF_DRAG_MIME) ||
        event.dataTransfer.getData(TEXT_MIME);

      if (!rawPayload) {
        return;
      }

      const resolved = await resolveCreativeAssetDrop(rawPayload, resolveCanvasDropBase64);
      if (resolved.status === 'error') {
        show({
          title: resolved.title,
          description: resolved.description,
          variant: resolved.variant ?? 'error',
        });
        return;
      }

      const assetNodeType = resolved.nodeType;
      let assetData = {};
      let style = { width: 192, height: 192 };

      // Library drops keep both the asset and exact version so downstream work is
      // reproducible instead of silently following a later Library head.
      if (assetNodeType === 'image') {
        assetData = {
          image: resolved.dataUrl,
          fileName: resolved.fileName,
          assetId: resolved.assetId,
          assetVersionId: resolved.assetVersionId,
          sourcePath: resolved.sourcePath,
          bucket: resolved.bucket,
          sourceUrl: resolved.sourceUrl,
        };
      } else if (assetNodeType === 'video') {
        assetData = {
          video: resolved.dataUrl,
          fileName: resolved.fileName,
          assetId: resolved.assetId,
          assetVersionId: resolved.assetVersionId,
          sourcePath: resolved.sourcePath,
          bucket: resolved.bucket,
          sourceUrl: resolved.sourceUrl,
          // Present only when the library row recorded one; duration-dependent ops
          // fall back to probing the bytes when it is missing.
          durationMs: resolved.durationMs,
        };
      } else if (assetNodeType === 'audio') {
        assetData = {
          audio: resolved.dataUrl,
          fileName: resolved.fileName,
          assetId: resolved.assetId,
          assetVersionId: resolved.assetVersionId,
          sourcePath: resolved.sourcePath,
          bucket: resolved.bucket,
          sourceUrl: resolved.sourceUrl,
        };
        style = { width: 192, height: 100 };
      } else if (assetNodeType === 'document') {
        assetData = {
          documents: [
            {
              name: resolved.fileName || 'Document',
              content: resolved.dataUrl,
              type: resolved.mimeType === 'application/pdf' ? 'pdf' : 'txt',
            },
          ],
        };
        style = { width: 200, height: 200 };
      }

      const newNode: StudioNode = {
        id: uuidv4(),
        type: assetNodeType,
        position,
        data: assetData as StudioNode['data'],
        style,
      } as StudioNode;

      const dropTarget = resolveSidebarDropTarget(
        event.clientX,
        event.clientY,
        assetNodeType,
        nodes,
        edges,
      );

      if (dropTarget) {
        const newEdge: Edge = {
          id: `e-${newNode.id}-${dropTarget.nodeId}-${Date.now()}`,
          source: newNode.id,
          sourceHandle: assetNodeType,
          target: dropTarget.nodeId,
          targetHandle: dropTarget.handleId,
          type: 'dataType',
          className: 'studio-edge studio-edge--connected',
          data: {
            dataType: assetNodeType,
            pathType: defaultEdgeType,
          },
        };
        setNodes(nodes.concat(newNode));
        setEdges(edges.concat(newEdge));
        triggerSave();
        return;
      }

      setNodes(nodes.concat(newNode));

      // An image dropped ON a clip has no compatible handle to land on, so it would
      // otherwise sit next to the clip doing nothing — the drop the user most obviously
      // meant is the one with no effect. OFFER the burn-in rather than performing it:
      // creating an action node unasked is worse than a toast the user can ignore.
      const burnIn = resolveBurnInDropTarget(event.clientX, event.clientY, assetNodeType, nodes);
      if (burnIn) {
        show({
          title: 'Burn this image into the clip?',
          description: 'Adds a Burn In action wired to both, with a timed window you can set.',
          variant: 'info',
          action: {
            label: 'Burn in as overlay',
            onClick: () => {
              // FRESH state, never the arrays captured at drop time. The toast sits on
              // screen for seconds, and another drop, a finishing generation or a
              // realtime sync can rewrite the canvas in that window — committing the
              // captured arrays would silently discard whatever arrived meanwhile.
              const store = useStudioStore.getState();
              // The image may also be gone by now (the user deleted it, or a realtime
              // sync did). Wiring an edge to a node that no longer exists is worse than
              // doing nothing.
              if (!store.nodes.some((node) => node.id === newNode.id)) return;

              store.takeSnapshot();
              const overlay = buildBurnInOverlay({
                videoNodeId: burnIn.videoNodeId,
                videoHandleId: burnIn.videoHandleId,
                imageNodeId: newNode.id,
                imageHandleId: assetNodeType,
                position,
                pathType: defaultEdgeType,
              });
              store.setNodes([...store.nodes, overlay.node as StudioNode]);
              store.setEdges([...store.edges, ...overlay.edges]);
              store.triggerSave();
            },
          },
        });
      }

      triggerSave();
    },
    [
      nodes,
      edges,
      screenToFlowPosition,
      setNodes,
      setEdges,
      show,
      takeSnapshot,
      triggerSave,
      defaultEdgeType,
    ],
  );

  return { onDragOver, onDrop, onNodeDragStart, onNodeDragStop };
}
