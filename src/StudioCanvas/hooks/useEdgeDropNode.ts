"use client";

import { useCallback, useRef } from 'react';
import { useReactFlow, type XYPosition, type Node, type Edge, type OnConnectEnd, type OnConnectStart } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { canAcceptSingleTextInput } from '../utils/connectionValidation';
import { useStudioStore } from '../stores/useStudioStore';
import {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  getVideoGeneratorReferenceMode,
} from '../utils/videoModel';
import { getAllowedTargetHandles } from '../utils/isValidConnection';

export type NodeType = 'nanoGen' | 'videoGen' | 'veoDirector' | 'extendVideo' | 'string' | 'image' | 'video' | 'audio' | 'document' | 'videoDecode';

export interface SmartNodeContext {
  sourceHandle: string | null;
  sourceNode: Node | undefined;
  targetPosition: XYPosition;
  handleType: 'source' | 'target';
}

export function determineBestNodeType(context: SmartNodeContext): NodeType {
  const { sourceHandle, handleType } = context;

  // If dragging from an input (target handle), we want to create the SOURCE for that input.
  if (handleType === 'target') {
      if (sourceHandle === 'image') return 'image';
      if (sourceHandle === 'audio') return 'audio';
      if (sourceHandle === 'video') return 'video';
      if (sourceHandle === 'ref-video') return 'video';
      if (sourceHandle === 'document') return 'document';
      if (sourceHandle === 'ref-image' || sourceHandle === 'ref-images') return 'image';
      if (sourceHandle === 'first-frame' || sourceHandle === 'last-frame') return 'image';
      return 'string'; // Default fallback
  }

  // If dragging from an output (source handle), we want to create a CONSUMER for that output.
  if (sourceHandle === 'prompt' || sourceHandle === 'negative' || sourceHandle === 'prompt-in') {
    return 'string';
  }

  if (sourceHandle === 'image') {
    return 'image';
  }

  if (sourceHandle === 'video') {
    return 'extendVideo';
  }

  if (sourceHandle === 'audio') {
    return 'string'; 
  }

  if (sourceHandle === 'document') {
    return 'string'; 
  }

  return 'string';
}

export function getDefaultNodeData(type: NodeType): { data: Record<string, unknown>, style?: Record<string, number | string> } {
  switch (type) {
    case 'nanoGen':
      return {
        data: {
            model: 'nano-banana-2',
            imageSize: '512px',
            positivePrompt: '',
            negativePrompt: '',
            aspectRatio: '16:9',
            label: 'Image Block',
        },
        style: { width: 400, height: 225 }
      };
    case 'videoGen':
    case 'veoDirector':
      return {
        data: {
            model: DEFAULT_VIDEO_GENERATOR_MODEL,
            prompt: '',
            enhancePrompt: false,
            referenceMode: getVideoGeneratorReferenceMode(DEFAULT_VIDEO_GENERATOR_MODEL),
            label: 'Video Block',
        },
        style: { width: 512, height: 288 }
      };
    case 'extendVideo':
      return {
        data: {
          prompt: '',
          label: 'Extend Video',
        },
        style: { width: 360, height: 200 },
      };
    case 'image':
        return {
            data: {
                label: 'Image Input',
                image: undefined,
                aspectRatio: '1:1',
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
    case 'audio':
        return {
            data: {
                label: 'Audio Input',
                audio: undefined
            },
            style: { width: 192, height: 100 }
        }
    case 'document':
        return {
            data: {
                label: 'Document Input',
                documents: []
            },
            style: { width: 200, height: 200 }
        }
    case 'videoDecode':
        return {
            data: {
                value: '',
                label: 'Video Decoder',
            },
            style: { width: 360, height: 320 }
        };
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

// Derives the best target handle for a newly-created node by delegating to the
// canonical handle vocabulary from @continuum/contracts instead of maintaining
// a parallel mapping table. Picks the first allowed handle that is compatible
// with the given source handle's data type.
function getTargetHandleForNodeType(
  nodeType: NodeType,
  sourceHandle: string | null,
  nodeData: Record<string, unknown> = {},
): string | undefined {
  const syntheticNode = { id: '__new__', type: nodeType, data: nodeData };
  const allowed = getAllowedTargetHandles(syntheticNode);

  if (allowed.length === 0) return undefined;

  // Media-type routing: match the source output handle to an appropriate
  // target input handle on the newly-created node.
  if (sourceHandle === 'text') {
    // Text sources prefer prompt-in (video generators), then prompt (nanoGen /
    // extendVideo), then negative — whatever comes first in the allowed set.
    for (const h of ['prompt-in', 'prompt', 'negative']) {
      if (allowed.includes(h)) return h;
    }
  }

  if (sourceHandle === 'image') {
    for (const h of ['ref-images', 'ref-image', 'first-frame', 'image']) {
      if (allowed.includes(h)) return h;
    }
  }

  if (sourceHandle === 'video') {
    for (const h of ['video', 'ref-video']) {
      if (allowed.includes(h)) return h;
    }
  }

  if (sourceHandle === 'audio' && allowed.includes('audio')) return 'audio';
  if (sourceHandle === 'document' && allowed.includes('document')) return 'document';

  // Fall back to the first handle in the allowed set (deterministic, contract-driven).
  return allowed[0];
}

export function useEdgeDropNode() {
  const { screenToFlowPosition, setNodes, setEdges, getNodes, getEdges } = useReactFlow();
  const defaultEdgeType = useStudioStore((state) => state.defaultEdgeType);
  const connectionStartRef = useRef<{ nodeId: string; handleId: string; handleType: 'source' | 'target' } | null>(null);

  const resolveDataType = useCallback((handleId?: string | null) => {
    if (handleId === 'video' || handleId === 'ref-video') return 'video';
    if (handleId === 'text') return 'text';
    if (handleId === 'audio') return 'audio';
    if (handleId === 'document') return 'document';
    return 'image';
  }, []);

  const onConnectStart = useCallback<OnConnectStart>((_, params) => {
      if (params.nodeId && params.handleId && params.handleType) {
          connectionStartRef.current = {
              nodeId: params.nodeId,
              handleId: params.handleId,
              handleType: params.handleType
          };
      }
  }, []);

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
        const startParams = connectionStartRef.current;
        if (!startParams) return;

        // A valid drop onto an existing node/handle should only create an edge.
        if (connectionState.toNode || connectionState.toHandle) {
          connectionStartRef.current = null;
          return;
        }
        
        const target = event.target;
        if (!(target instanceof Element)) {
          connectionStartRef.current = null;
          return;
        }
        const isPane = target.classList.contains('react-flow__pane') || !!target.closest('.react-flow__pane');
        
        if (isPane) {
             const { clientX, clientY } = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
             
             const position = screenToFlowPosition({
                x: clientX,
                y: clientY,
             });

             const context: SmartNodeContext = {
                sourceHandle: startParams.handleId,
                sourceNode: getNodes().find(n => n.id === startParams.nodeId),
                targetPosition: position,
                handleType: startParams.handleType
             };

             const nodeType = determineBestNodeType(context);
             const newNodeId = uuidv4();
             
             const { data, style } = getDefaultNodeData(nodeType);
             
             const canonicalNodeType = nodeType === 'veoDirector' ? 'videoGen' : nodeType;

             const newNode: Node = {
                id: newNodeId,
                type: canonicalNodeType,
                position: { x: position.x - 100, y: position.y - 50 }, 
                data,
                style,
             };

              let newEdge: Edge;

              if (startParams.handleType === 'target') {
                  if (!canAcceptSingleTextInput(getEdges(), startParams.nodeId, startParams.handleId)) {
                      connectionStartRef.current = null;
                      return;
                  }
                  const resolvedSourceHandle = getTargetHandleForNodeType(
                    canonicalNodeType,
                    startParams.handleId,
                    data as Record<string, unknown>,
                  );
                  newEdge = {
                      id: `e-${newNodeId}-${startParams.nodeId}-${Date.now()}`,
                      source: newNodeId,
                      sourceHandle: resolvedSourceHandle,
                      target: startParams.nodeId,
                      targetHandle: startParams.handleId,
                      type: 'dataType',
                      className: 'studio-edge studio-edge--connected',
                      data: {
                        dataType: resolveDataType(resolvedSourceHandle),
                        pathType: defaultEdgeType,
                      }
                  };
              } else {
                  newEdge = {
                      id: `e-${startParams.nodeId}-${newNodeId}-${Date.now()}`,
                      source: startParams.nodeId,
                      sourceHandle: startParams.handleId,
                      target: newNodeId,
                      targetHandle: getTargetHandleForNodeType(
                        canonicalNodeType,
                        startParams.handleId,
                        data as Record<string, unknown>,
                      ),
                      type: 'dataType',
                      className: 'studio-edge studio-edge--connected',
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
    [screenToFlowPosition, setNodes, setEdges, getNodes, getEdges, defaultEdgeType, resolveDataType]
  );

  return {
    onConnectStart,
    onConnectEnd,
  };
}
