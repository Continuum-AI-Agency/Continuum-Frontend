"use client";

import { useCallback, useRef } from 'react';
import { useReactFlow, type XYPosition, type Node, type Edge, useStoreApi, type OnNodeDrag } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { canAcceptSingleTextInput } from '../utils/connectionValidation';
import { useStudioStore } from '../stores/useStudioStore';

export type NodeType = 'nanoGen' | 'veoDirector' | 'string' | 'image' | 'video';

export interface SmartNodeContext {
  sourceHandle: string | null;
  sourceNode: Node | undefined;
  targetPosition: XYPosition;
}

export function determineBestNodeType(context: SmartNodeContext): NodeType {
  const { sourceHandle } = context;

  if (sourceHandle === 'prompt' || sourceHandle === 'negative' || sourceHandle === 'prompt-in') {
    return 'string';
  }

  if (sourceHandle === 'ref-image' || sourceHandle === 'ref-images' || sourceHandle === 'first-frame' || sourceHandle === 'last-frame') {
    return 'image';
  }

  if (sourceHandle === 'ref-video') {
    return 'video';
  }

  return 'string';
}

export function getDefaultNodeData(type: NodeType): { data: Record<string, unknown>, style?: Record<string, number | string> } {
  switch (type) {
    case 'nanoGen':
      return {
        data: {
            model: 'nano-banana',
            positivePrompt: '',
            negativePrompt: '',
            aspectRatio: '16:9',
            label: 'Image Block',
        },
        style: { width: 400, height: 400 }
      };
    case 'veoDirector':
      return {
        data: {
            model: 'veo-3.1-fast',
            prompt: '',
            enhancePrompt: false,
            label: 'Video Block',
        },
        style: { width: 512, height: 288 }
      };
    case 'image':
        return {
            data: {
                label: 'Image Input',
                image: undefined
            },
            style: { width: 192, height: 192 }
        }
    case 'video':
        return {
            data: {
                label: 'Video Input',
                video: undefined
            },
            style: { width: 192, height: 192 }
        }
    case 'string':
    default:
      return {
        data: {
            value: '',
            label: 'Text Block',
        }
      };
  }
}

function getTargetHandleForNodeType(nodeType: NodeType, sourceHandle: string | null): string | undefined {
    if (nodeType === 'string') {
        return 'text';
    }

    if (nodeType === 'image') {
        return 'image';
    }

    if (nodeType === 'video') {
        return 'video';
    }

    if (nodeType === 'nanoGen') {
        if (sourceHandle === 'text') return 'prompt';
        if (sourceHandle === 'image') return 'ref-image';
        return 'prompt'; // Default
    }

    return 'image'; // Default for image nodes
}

export function useEdgeDropNode() {
  const { screenToFlowPosition, setNodes, setEdges, getNodes, getEdges } = useReactFlow();
  const defaultEdgeType = useStudioStore((state) => state.defaultEdgeType);
  const connectionStartRef = useRef<{ nodeId: string; handleId: string; handleType: 'source' | 'target' } | null>(null);

  const onConnectStart = useCallback((_: any, params: { nodeId: string | null; handleId: string | null; handleType: 'source' | 'target' | null }) => {
      if (params.nodeId && params.handleId && params.handleType) {
          connectionStartRef.current = {
              nodeId: params.nodeId,
              handleId: params.handleId,
              handleType: params.handleType
          };
      }
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
        const startParams = connectionStartRef.current;
        if (!startParams) return;
        
        const target = event.target as Element;
        const isPane = target.classList.contains('react-flow__pane');
        
        if (isPane) {
             const { clientX, clientY } = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
             
             const position = screenToFlowPosition({
                x: clientX,
                y: clientY,
             });

             const context: SmartNodeContext = {
                sourceHandle: startParams.handleId,
                sourceNode: getNodes().find(n => n.id === startParams.nodeId),
                targetPosition: position
             };

             const nodeType = determineBestNodeType(context);
             const newNodeId = uuidv4();
             
             const { data, style } = getDefaultNodeData(nodeType);
             
             const newNode: Node = {
                id: newNodeId,
                type: nodeType,
                position: { x: position.x - 100, y: position.y - 50 }, 
                data,
                style,
             };

              const resolveDataType = (handleId?: string | null) => {
                if (handleId === 'video') return 'video';
                if (handleId === 'text') return 'text';
                return 'image';
              };

              let newEdge: Edge;

              if (startParams.handleType === 'target') {
                  if (!canAcceptSingleTextInput(getEdges(), startParams.nodeId, startParams.handleId)) {
                      connectionStartRef.current = null;
                      return;
                  }
                  newEdge = {
                      id: `e-${newNodeId}-${startParams.nodeId}-${Date.now()}`,
                      source: newNodeId,
                      sourceHandle: getTargetHandleForNodeType(nodeType, startParams.handleId),
                      target: startParams.nodeId,
                      targetHandle: startParams.handleId,
                      type: 'dataType',
                      className: 'studio-edge',
                      data: { 
                        dataType: nodeType === 'string' ? 'text' : nodeType === 'veoDirector' ? 'video' : 'image',
                        pathType: defaultEdgeType,
                      }
                  };
              } else {
                  newEdge = {
                      id: `e-${startParams.nodeId}-${newNodeId}-${Date.now()}`,
                      source: startParams.nodeId,
                      sourceHandle: startParams.handleId,
                      target: newNodeId,
                      targetHandle: getTargetHandleForNodeType(nodeType, startParams.handleId), 
                      type: 'dataType',
                      className: 'studio-edge',
                      data: { 
                        dataType: resolveDataType(startParams.handleId),
                        pathType: defaultEdgeType,
                      }
                  };
              }

             setNodes((nds) => nds.concat(newNode));
             setEdges((eds) => eds.concat(newEdge));
        }
        
        connectionStartRef.current = null;
    },
    [screenToFlowPosition, setNodes, setEdges, getNodes, getEdges, defaultEdgeType]
  );

  return {
    onConnectStart,
    onConnectEnd,
  };
}

export function useProximityConnect() {
    const store = useStoreApi();
    const { getInternalNode, setEdges, getEdges } = useReactFlow();
    const MIN_DISTANCE = 500;

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
                 
                 if (isPromptFilled) {
                     const isNegativeFilled = currentEdges.some(
                         (e) => e.target === targetNode.id && e.targetHandle === 'negative'
                     );
                     
                     if (!isNegativeFilled) {
                         targetHandle = 'negative';
                     } else {
                         return null;
                     }
                 } else {
                     targetHandle = targetNode.type === 'veoDirector' ? 'prompt-in' : 'prompt';
                 }
             }
             if (sourceNode.type === 'image') {
                 targetHandle = targetNode.type === 'veoDirector' ? 'first-frame' : 'ref-image';
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
        (_: any, node: Node) => {
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
        (_: any, node: Node) => {
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
                  data: { dataType: resolveDataType(closeEdge.sourceHandle) }
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
