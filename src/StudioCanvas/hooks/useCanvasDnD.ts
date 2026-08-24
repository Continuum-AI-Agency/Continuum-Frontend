import type { Edge } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import type React from 'react';
import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useToast } from '@/components/ui/ToastProvider';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { STUDIO_ASSET_DROP_EFFECT } from '@/lib/creative-assets/studioAssetDrop';
import type { StudioCanvasNodeType } from '../components/addNodeCatalog';
import { createNodeConfig, isStudioCanvasNodeType } from '../components/canvasNodeTypes';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { resolveCanvasDropBase64 } from '../utils/resolveCanvasDropBase64';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { resolveSidebarDropTarget } from '../utils/resolveSidebarDropTarget';

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
        const canonicalType: StudioCanvasNodeType =
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

      // assetId is only set when the drop came from the Library. It is what lets a
      // generation fed by this node be credited back to the asset that fed it.
      if (assetNodeType === 'image') {
        assetData = {
          image: resolved.dataUrl,
          fileName: resolved.fileName,
          assetId: resolved.assetId,
          sourcePath: resolved.sourcePath,
          bucket: resolved.bucket,
          sourceUrl: resolved.sourceUrl,
        };
      } else if (assetNodeType === 'video') {
        assetData = {
          video: resolved.dataUrl,
          fileName: resolved.fileName,
          assetId: resolved.assetId,
          sourcePath: resolved.sourcePath,
          bucket: resolved.bucket,
          sourceUrl: resolved.sourceUrl,
        };
      } else if (assetNodeType === 'audio') {
        assetData = { audio: resolved.dataUrl, fileName: resolved.fileName };
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
      } else {
        setNodes(nodes.concat(newNode));
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
