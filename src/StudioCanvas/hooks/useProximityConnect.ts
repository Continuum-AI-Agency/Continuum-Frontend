import { useCallback } from 'react';
import { useReactFlow, type Node, useStoreApi, Edge, type OnNodeDrag } from '@xyflow/react';
import { canAcceptSingleTextInput } from '../utils/connectionValidation';
import { useStudioStore } from '../stores/useStudioStore';

const MIN_DISTANCE = 500;

export function useProximityConnect() {
    const store = useStoreApi();
    const { getInternalNode, setEdges, getEdges } = useReactFlow();
    const defaultEdgeType = useStudioStore((state) => state.defaultEdgeType);

    const getClosestEdge = useCallback((node: Node) => {
        const { nodeLookup } = store.getState();
        const internalNode = getInternalNode(node.id);
        if (!internalNode) return null;

        const closestNode = Array.from(nodeLookup.values()).reduce(
          (res, n) => {
            if (n.id !== internalNode.id) {
              
              const nWidth = n.measured?.width ?? n.width ?? 200; 
              const nHeight = n.measured?.height ?? n.height ?? 200;
              
              const internalNodeWidth = internalNode.measured?.width ?? internalNode.width ?? 200;
              const internalNodeHeight = internalNode.measured?.height ?? internalNode.height ?? 200;

              const nCenter = {
                  x: n.internals.positionAbsolute.x + nWidth / 2,
                  y: n.internals.positionAbsolute.y + nHeight / 2
              };
              const internalCenter = {
                  x: internalNode.internals.positionAbsolute.x + internalNodeWidth / 2,
                  y: internalNode.internals.positionAbsolute.y + internalNodeHeight / 2
              };

              const d = Math.sqrt(
                  Math.pow(nCenter.x - internalCenter.x, 2) + 
                  Math.pow(nCenter.y - internalCenter.y, 2)
              );
    
              if (d < res.distance && d < MIN_DISTANCE) {
                res.distance = d;
                res.node = n;
              }
            }
    
            return res;
          },
          {
            distance: Number.MAX_VALUE,
            node: null as any
          },
        );
    
        if (!closestNode.node) {
          return null;
        }
    
        const closeNodeIsSource =
          closestNode.node.internals.positionAbsolute.x <
          internalNode.internals.positionAbsolute.x;
        
        let sourceNode = closeNodeIsSource ? closestNode.node : node;
        let targetNode = closeNodeIsSource ? node : closestNode.node;

        const isGenerator = (n: Node) => n.type === 'nanoGen' || n.type === 'veoDirector';
        if (sourceNode.type === 'string' && isGenerator(targetNode)) {
          // keep string as source
        } else if (targetNode.type === 'string' && isGenerator(sourceNode)) {
          const temp = sourceNode;
          sourceNode = targetNode;
          targetNode = temp;
        }

        let sourceHandle = 'image';
        let targetHandle = 'ref-image';

        if (sourceNode.type === 'string') sourceHandle = 'text';
        if (targetNode.type === 'string') {
          return null;
        }
        
        if (targetNode.type === 'nanoGen' || targetNode.type === 'veoDirector') {
             if (sourceNode.type === 'string') {
                 const currentEdges = getEdges();
                  const isPromptFilled = currentEdges.some(
                      (e) => e.target === targetNode.id && (e.targetHandle === 'prompt' || e.targetHandle === 'prompt-in')
                  );

                  if (isPromptFilled) {
                      // Prompt is filled - prevent additional connections
                      return null;
                  } else {
                      targetHandle = targetNode.type === 'veoDirector' ? 'prompt-in' : 'prompt';
                  }
             }
              if (sourceNode.type === 'image') {
                  if (targetNode.type === 'veoDirector') {
                      // For video nodes, try first-frame, then last-frame, then ref-images (up to 3), then ref-video
                      const currentEdges = getEdges();
                      const hasFirstFrame = currentEdges.some(e => e.target === targetNode.id && e.targetHandle === 'first-frame');
                      const hasLastFrame = currentEdges.some(e => e.target === targetNode.id && e.targetHandle === 'last-frame');
                      const refImagesCount = currentEdges.filter(e => e.target === targetNode.id && e.targetHandle === 'ref-images').length;
                      const hasRefVideo = currentEdges.some(e => e.target === targetNode.id && e.targetHandle === 'ref-video');

                      if (!hasFirstFrame) {
                          targetHandle = 'first-frame';
                      } else if (!hasLastFrame) {
                          targetHandle = 'last-frame';
                      } else if (refImagesCount < 3) {
                          targetHandle = 'ref-images';
                      } else if (!hasRefVideo) {
                          targetHandle = 'ref-video';
                      } else {
                          // All slots filled
                          return null;
                      }
                  } else if (targetNode.type === 'nanoGen') {
                      // For image nodes, check ref-image limit (max 14)
                      const currentEdges = getEdges();
                      const refImageCount = currentEdges.filter(e => e.target === targetNode.id && e.targetHandle === 'ref-image').length;
                      if (refImageCount >= 14) {
                          return null; // Can't connect more ref images
                      }
                      targetHandle = 'ref-image';
                  } else {
                      targetHandle = 'ref-image';
                  }
              }
              if (sourceNode.type === 'video') {
                  if (targetNode.type === 'veoDirector') {
                      // For video nodes connecting to video blocks, only ref-video is available
                      const currentEdges = getEdges();
                      const hasRefVideo = currentEdges.some(e => e.target === targetNode.id && e.targetHandle === 'ref-video');

                      if (!hasRefVideo) {
                          targetHandle = 'ref-video';
                      } else {
                          // Ref video slot filled
                          return null;
                      }
                  } else {
                      targetHandle = 'ref-video';
                  }
              }
        }

        if (!canAcceptSingleTextInput(getEdges(), targetNode.id, targetHandle)) {
          return null;
        }

        if (targetNode.type === 'veoDirector' && targetHandle !== 'prompt-in') {
          const hasPrompt = getEdges().some(
            (edge) => edge.target === targetNode.id && edge.targetHandle === 'prompt-in'
          );
          if (!hasPrompt) {
            return null;
          }
        }

        return {
          id: `${sourceNode.id}-${targetNode.id}`,
          source: sourceNode.id,
          target: targetNode.id,
          sourceHandle,
          targetHandle,
          className: 'temp',
          style: { strokeDasharray: 5, stroke: '#94a3b8', strokeWidth: 2 },
          type: 'dataType', 
          data: { dataType: sourceNode.type === 'string' ? 'text' : 'image' }
        };
      }, [getInternalNode, store, getEdges]);

      const onNodeDrag: OnNodeDrag = useCallback(
        (_, node: Node) => {
          const closeEdge = getClosestEdge(node);
    
          setEdges((es) => {
            const nextEdges = es.filter((e) => e.className !== 'temp');
    
            if (
              closeEdge &&
              !nextEdges.find(
                (ne) =>
                  ne.source === closeEdge.source && ne.target === closeEdge.target && ne.targetHandle === closeEdge.targetHandle,
              )
            ) {
              nextEdges.push(closeEdge as unknown as Edge);
            }
    
            return nextEdges;
          });
        },
        [getClosestEdge, setEdges, defaultEdgeType],
      );
    
      const onNodeDragStop: OnNodeDrag = useCallback(
        (_, node: Node) => {
          const closeEdge = getClosestEdge(node);
    
          setEdges((es) => {
            const nextEdges = es.filter((e) => e.className !== 'temp');
    
            if (
              closeEdge &&
              !nextEdges.find(
                (ne) =>
                  ne.source === closeEdge.source && ne.target === closeEdge.target && ne.targetHandle === closeEdge.targetHandle,
              )
            ) {
              const resolveDataType = (handleId?: string | null) => {
                if (handleId === 'video') return 'video';
                if (handleId === 'text') return 'text';
                return 'image';
              };

              const validEdge = {
                  ...closeEdge,
                  id: `e-${closeEdge.source}-${closeEdge.target}-${Date.now()}`,
                  style: undefined,
                  type: 'dataType',
                  className: 'studio-edge',
                  data: { 
                    dataType: resolveDataType(closeEdge.sourceHandle),
                    pathType: defaultEdgeType,
                  }
              }
              nextEdges.push(validEdge as unknown as Edge);
            }
    
            return nextEdges;
          });
        },
        [getClosestEdge, setEdges],
      );

      return { onNodeDrag, onNodeDragStop };
}
