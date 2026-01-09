"use client";

import { useCallback, useRef } from 'react';
import { useReactFlow, type Connection, type XYPosition, type Node, type Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

export type NodeType = 'nanoGen' | 'veoDirector' | 'string';

/**
 * Context information for smart node creation
 */
export interface SmartNodeContext {
  sourceHandle: string | null;
  sourceNode: Node | undefined;
  targetPosition: XYPosition;
}

/**
 * Determine the best node type to create based on the connection context
 */
export function determineBestNodeType(context: SmartNodeContext): NodeType {
  const { sourceHandle } = context;

  // Text output → create StringNode as prompt source
  if (sourceHandle === 'text') {
    return 'string';
  }

  // Image output → create NanoGenNode (can accept image references)
  if (sourceHandle === 'image') {
    return 'nanoGen';
  }

  // Video output → create VeoDirectorNode (can accept video refs)
  if (sourceHandle === 'video') {
    return 'veoDirector';
  }

  // Trigger output → create NanoGenNode (triggers generation)
  if (sourceHandle === 'trigger') {
    return 'nanoGen';
  }

  // Default: StringNode for unknown handles
  return 'string';
}

/**
 * Get default data for a node type
 */
export function getDefaultNodeData(type: NodeType): Record<string, unknown> {
  switch (type) {
    case 'nanoGen':
      return {
        model: 'nano-banana',
        positivePrompt: '',
        negativePrompt: '',
        aspectRatio: '1:1',
        label: 'Nano Gen',
      };
    case 'veoDirector':
      return {
        model: 'veo-3.1',
        prompt: '',
        enhancePrompt: false,
        label: 'Veo Director',
      };
    case 'string':
    default:
      return {
        value: '',
        label: 'String',
      };
  }
}

/**
 * Hook for handling edge drop to create new nodes with smart context detection
 */
export function useEdgeDropNode() {
  const { screenToFlowPosition, setNodes, setEdges, getNodes } = useReactFlow();
  const edgeReconnectSuccessful = useRef(true);

  /**
   * Handle connection end - either complete connection or create new node
   */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: { isValid: boolean; connection?: Connection }) => {
      // If connection is valid, let React Flow handle it normally
      if (connectionState.isValid && connectionState.connection) {
        return;
      }

      // Get mouse/touch position
      const { clientX, clientY } =
        'changedTouches' in event ? event.changedTouches[0] : event;

      // Convert to flow position
      const position = screenToFlowPosition({
        x: clientX,
        y: clientY,
      });

      // Get the source node from the connection state if available
      const connection = connectionState.connection;
      let sourceHandle: string | null = null;
      let sourceNode: Node | undefined;

      if (connection) {
        const nodes = getNodes();
        sourceNode = nodes.find((n) => n.id === connection.source);
        sourceHandle = connection.sourceHandle || null;
      }

      // Determine best node type based on source
      const context: SmartNodeContext = {
        sourceHandle,
        sourceNode,
        targetPosition: position,
      };

      const nodeType = determineBestNodeType(context);
      const nodeId = uuidv4();

      // Create new node
      const newNode: Node = {
        id: nodeId,
        type: nodeType,
        position,
        data: getDefaultNodeData(nodeType),
      };

      // Create edge from source to new node
      const newEdge: Edge = {
        id: `e-${sourceNode?.id || 'source'}-${nodeId}-${Date.now()}`,
        source: sourceNode?.id || '',
        target: nodeId,
        sourceHandle: sourceHandle || undefined,
        targetHandle: getTargetHandleForNodeType(nodeType),
        type: 'default',
        animated: true,
      };

      setNodes((nds) => nds.concat(newNode));
      setEdges((eds) => eds.concat(newEdge));
    },
    [screenToFlowPosition, setNodes, setEdges, getNodes]
  );

  /**
   * Handle reconnection start - track when we start dragging an edge
   */
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  /**
   * Handle reconnection - if successful, update the edge
   */
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === oldEdge.id) {
            return {
              ...edge,
              source: newConnection.source,
              target: newConnection.target,
              sourceHandle: newConnection.sourceHandle,
              targetHandle: newConnection.targetHandle,
            };
          }
          return edge;
        })
      );
    },
    [setEdges]
  );

  /**
   * Handle reconnection end - if not successful, delete the edge
   */
  const onReconnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
      edgeReconnectSuccessful.current = true;
    },
    [setEdges]
  );

  return {
    onConnectEnd,
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
  };
}

/**
 * Get the appropriate target handle for a node type
 */
function getTargetHandleForNodeType(nodeType: NodeType): string | undefined {
  switch (nodeType) {
    case 'string':
      return 'text'; // StringNode outputs text
    case 'nanoGen':
      return 'prompt'; // NanoGenNode accepts prompt
    case 'veoDirector':
      return 'prompt-in'; // VeoDirectorNode accepts prompt
    default:
      return undefined;
  }
}
