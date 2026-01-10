import { useCallback } from 'react';
import { useReactFlow, type Node, useStoreApi, Edge, type OnNodeDrag } from '@xyflow/react';

const MIN_DISTANCE = 500;

export function useProximityConnect() {
    const store = useStoreApi();
    const { getInternalNode, setEdges, getEdges } = useReactFlow();

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
        
        const sourceNode = closeNodeIsSource ? closestNode.node : node;
        const targetNode = closeNodeIsSource ? node : closestNode.node;

        let sourceHandle = 'image';
        let targetHandle = 'ref-image';

        if (sourceNode.type === 'string') sourceHandle = 'text';
        if (targetNode.type === 'string') targetHandle = 'input'; 
        
        if (targetNode.type === 'nanoGen' || targetNode.type === 'veoDirector') {
             if (sourceNode.type === 'string') {
                 const currentEdges = getEdges();
                 const isPromptFilled = currentEdges.some(
                     (e) => e.target === targetNode.id && (e.targetHandle === 'prompt' || e.targetHandle === 'prompt-in')
                 );
                 
                 // If prompt is filled, use negative handle IF negative is not filled
                 // If both are filled, do nothing (keep current targetHandle default or null)
                 
                 if (isPromptFilled) {
                     const isNegativeFilled = currentEdges.some(
                         (e) => e.target === targetNode.id && e.targetHandle === 'negative'
                     );
                     
                     if (!isNegativeFilled) {
                         targetHandle = 'negative';
                     } else {
                         // Both slots filled - maybe prevent connection?
                         // Returning null here would stop the proximity line
                         return null;
                     }
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
        [getClosestEdge, setEdges],
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
              const validEdge = {
                  ...closeEdge,
                  id: `e-${closeEdge.source}-${closeEdge.target}-${Date.now()}`,
                  className: undefined,
                  style: undefined,
                  animated: true,
                  type: 'dataType', 
                  data: { dataType: closeEdge.sourceHandle === 'text' ? 'text' : 'image' }
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
