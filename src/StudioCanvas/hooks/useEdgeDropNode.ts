'use client';

import { createNodeData } from '@continuum/contracts';
import {
  type Edge,
  type Node,
  type OnConnectEnd,
  type OnConnectStart,
  useReactFlow,
  type XYPosition,
} from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStudioStore } from '../stores/useStudioStore';
import { canAcceptSingleTextInput } from '../utils/connectionValidation';
import {
  type EdgeDataType,
  getSourceHandleForNodeType,
  getTargetHandleForNodeType,
  type NodeType,
  resolveEdgeDataType,
} from '../utils/handleResolution';
import { DEFAULT_VIDEO_GENERATOR_MODEL, getVideoGeneratorReferenceMode } from '../utils/videoModel';

export type { NodeType };

export interface SmartNodeContext {
  sourceHandle: string | null;
  sourceNode: Node | undefined;
  targetPosition: XYPosition;
  handleType: 'source' | 'target';
}

// Only decides the SOURCE-side (new node feeding an input) case now — dragging
// off an output handle onto empty canvas is handled by SOURCE_DROP_CANDIDATES
// + the picker below, so the user chooses instead of one type being silently
// auto-picked.
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
    if (sourceHandle === 'prompt' || sourceHandle === 'prompt-in' || sourceHandle === 'negative')
      return 'string';
    return 'string'; // Default fallback
  }

  return 'string'; // Not reached via the source branch — the picker owns that decision.
}

export function getDefaultNodeData(type: NodeType): {
  data: Record<string, unknown>;
  style?: Record<string, number | string>;
} {
  switch (type) {
    // Same factory the canvas menu and the agent write path use (@continuum/contracts),
    // so a node dropped off an edge is identical to one added any other way.
    case 'nanoGen':
      return createNodeData('nanoGen', { label: 'Image Block' });
    case 'videoGen':
    case 'veoDirector':
      return createNodeData(type, {
        model: DEFAULT_VIDEO_GENERATOR_MODEL,
        referenceMode: getVideoGeneratorReferenceMode(DEFAULT_VIDEO_GENERATOR_MODEL),
        label: 'Video Block',
      });
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
        style: { width: 192, height: 192 },
      };
    case 'video':
      return {
        data: {
          label: 'Video Input',
          video: undefined,
        },
        style: { width: 192, height: 192 },
      };
    case 'audio':
      return {
        data: {
          label: 'Audio Input',
          audio: undefined,
        },
        style: { width: 192, height: 100 },
      };
    case 'document':
      return {
        data: {
          label: 'Document Input',
          documents: [],
        },
        style: { width: 200, height: 200 },
      };
    case 'videoDecode':
      return {
        data: {
          value: '',
          label: 'Video Decoder',
        },
        style: { width: 360, height: 320 },
      };
    case 'frameExtract':
      return createNodeData('frameExtract', { label: 'Continuity Frame' });
    case 'string':
    default:
      return {
        data: {
          value: '',
          label: 'Text Block',
        },
      };
  }
}

export interface SourceDropCandidate {
  nodeType: NodeType;
  label: string;
}

// What a drag off an OUTPUT handle onto empty canvas may become, keyed by that
// output's data type. Audio/document have exactly one real consumer (Text
// Block) — no picker for those, auto-create matches the pre-existing
// behavior. Text/image/video have 2-3 real candidates, so the user picks
// instead of one being silently force-created.
export const SOURCE_DROP_CANDIDATES: Record<EdgeDataType, SourceDropCandidate[]> = {
  text: [
    { nodeType: 'nanoGen', label: 'Image Generation' },
    { nodeType: 'videoGen', label: 'Video Generation' },
    { nodeType: 'extendVideo', label: 'Extend Video' },
  ],
  image: [
    { nodeType: 'nanoGen', label: 'Image Generation' },
    { nodeType: 'videoGen', label: 'Video Generation' },
    { nodeType: 'string', label: 'Text Block' },
  ],
  video: [
    { nodeType: 'extendVideo', label: 'Extend Video' },
    { nodeType: 'frameExtract', label: 'Continuity Frame' },
    { nodeType: 'videoDecode', label: 'Video Decoder' },
    { nodeType: 'string', label: 'Text Block' },
  ],
  audio: [{ nodeType: 'string', label: 'Text Block' }],
  document: [{ nodeType: 'string', label: 'Text Block' }],
};

export interface PendingSourceDrop {
  sourceNodeId: string;
  sourceHandleId: string;
  flowPosition: XYPosition;
  screenPosition: { x: number; y: number };
  candidates: SourceDropCandidate[];
}

export function useEdgeDropNode() {
  const { screenToFlowPosition, setNodes, setEdges, getNodes, getEdges } = useReactFlow();
  const defaultEdgeType = useStudioStore((state) => state.defaultEdgeType);
  const connectionStartRef = useRef<{
    nodeId: string;
    handleId: string;
    handleType: 'source' | 'target';
  } | null>(null);
  const [pendingSourceDrop, setPendingSourceDrop] = useState<PendingSourceDrop | null>(null);

  // Builds a new consumer node for a source/output handle plus the edge that
  // wires the dragged output into it. Shared by the single-candidate
  // auto-create path and the picker's onSelect.
  const createConsumerNodeAndEdge = useCallback(
    (
      nodeType: NodeType,
      flowPosition: XYPosition,
      sourceNodeId: string,
      sourceHandleId: string,
    ) => {
      const newNodeId = uuidv4();
      const { data, style } = getDefaultNodeData(nodeType);
      const canonicalNodeType = nodeType === 'veoDirector' ? 'videoGen' : nodeType;

      const newNode: Node = {
        id: newNodeId,
        type: canonicalNodeType,
        position: { x: flowPosition.x - 100, y: flowPosition.y - 50 },
        data,
        style,
      };

      const newEdge: Edge = {
        id: `e-${sourceNodeId}-${newNodeId}-${Date.now()}`,
        source: sourceNodeId,
        sourceHandle: sourceHandleId,
        target: newNodeId,
        targetHandle: getTargetHandleForNodeType(
          canonicalNodeType,
          sourceHandleId,
          data as Record<string, unknown>,
        ),
        type: 'dataType',
        className: 'studio-edge studio-edge--connected',
        data: {
          dataType: resolveEdgeDataType(sourceHandleId),
          pathType: defaultEdgeType,
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setEdges((eds) => eds.concat(newEdge));
    },
    [setNodes, setEdges, defaultEdgeType],
  );

  const onConnectStart = useCallback<OnConnectStart>((_, params) => {
    if (params.nodeId && params.handleId && params.handleType) {
      connectionStartRef.current = {
        nodeId: params.nodeId,
        handleId: params.handleId,
        handleType: params.handleType,
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
      const isPane =
        target.classList.contains('react-flow__pane') || !!target.closest('.react-flow__pane');

      if (isPane) {
        const { clientX, clientY } =
          'changedTouches' in event
            ? (event as TouchEvent).changedTouches[0]
            : (event as MouseEvent);

        const position = screenToFlowPosition({
          x: clientX,
          y: clientY,
        });

        if (startParams.handleType === 'target') {
          // Input-side drops stay fully automatic: always create the
          // type-matched source node directly, no picker.
          if (!canAcceptSingleTextInput(getEdges(), startParams.nodeId, startParams.handleId)) {
            connectionStartRef.current = null;
            return;
          }

          const context: SmartNodeContext = {
            sourceHandle: startParams.handleId,
            sourceNode: getNodes().find((n) => n.id === startParams.nodeId),
            targetPosition: position,
            handleType: 'target',
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

          // The new node's OWN output handle — must come from the
          // source/output handle vocabulary, not the target/input one.
          const resolvedSourceHandle = getSourceHandleForNodeType(canonicalNodeType);

          const newEdge: Edge = {
            id: `e-${newNodeId}-${startParams.nodeId}-${Date.now()}`,
            source: newNodeId,
            sourceHandle: resolvedSourceHandle,
            target: startParams.nodeId,
            targetHandle: startParams.handleId,
            type: 'dataType',
            className: 'studio-edge studio-edge--connected',
            data: {
              dataType: resolveEdgeDataType(resolvedSourceHandle),
              pathType: defaultEdgeType,
            },
          };

          setNodes((nds) => nds.concat(newNode));
          setEdges((eds) => eds.concat(newEdge));
        } else {
          // Output-side drops: auto-create only when there is exactly one
          // real consumer (audio/document); otherwise show a picker.
          const dataType = resolveEdgeDataType(startParams.handleId);
          const candidates = SOURCE_DROP_CANDIDATES[dataType];

          if (candidates.length === 1) {
            createConsumerNodeAndEdge(
              candidates[0].nodeType,
              position,
              startParams.nodeId,
              startParams.handleId,
            );
          } else {
            setPendingSourceDrop({
              sourceNodeId: startParams.nodeId,
              sourceHandleId: startParams.handleId,
              flowPosition: position,
              screenPosition: { x: clientX, y: clientY },
              candidates,
            });
          }
        }
      }

      connectionStartRef.current = null;
    },
    [
      screenToFlowPosition,
      setNodes,
      setEdges,
      getNodes,
      getEdges,
      defaultEdgeType,
      createConsumerNodeAndEdge,
    ],
  );

  const resolveSourceDropPick = useCallback(
    (nodeType: NodeType) => {
      if (!pendingSourceDrop) return;
      createConsumerNodeAndEdge(
        nodeType,
        pendingSourceDrop.flowPosition,
        pendingSourceDrop.sourceNodeId,
        pendingSourceDrop.sourceHandleId,
      );
      setPendingSourceDrop(null);
    },
    [pendingSourceDrop, createConsumerNodeAndEdge],
  );

  const dismissSourceDropPick = useCallback(() => {
    setPendingSourceDrop(null);
  }, []);

  return {
    onConnectStart,
    onConnectEnd,
    pendingSourceDrop,
    resolveSourceDropPick,
    dismissSourceDropPick,
  };
}
