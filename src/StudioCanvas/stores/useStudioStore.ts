import type { CSSProperties } from 'react';
import { create } from 'zustand';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  Connection,
  NodeChange,
  EdgeChange,
} from '@xyflow/react';
import { StudioNode, VideoGenNodeData } from '../types';
import { isValidConnection, getAllowedTargetHandles, getAllowedSourceHandles } from '../utils/isValidConnection';
import { resolveCollisions } from '../utils/nodeCollisions';

export type EdgeType = 'bezier' | 'straight' | 'step' | 'smoothstep';
export type InteractionMode = 'pan' | 'select';

interface StudioState {
  nodes: StudioNode[];
  edges: Edge[];
  defaultEdgeType: EdgeType;
  interactionMode: InteractionMode;
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
  onNodesChange: OnNodesChange<StudioNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: StudioNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodeData: (id: string, data: Partial<StudioNode['data']>) => void;
  getNodeById: (id: string) => StudioNode | undefined;
  getConnectedEdges: (nodeId: string, handleType?: 'source' | 'target') => Edge[];
  setDefaultEdgeType: (type: EdgeType) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  getDeletedNodeIds: () => string[];
  getDeletedEdgeIds: () => string[];
  clearDeletedIds: () => void;
  saveTrigger: number;
  triggerSave: () => void;
  
  history: {
    past: Array<{ nodes: StudioNode[]; edges: Edge[] }>;
    future: Array<{ nodes: StudioNode[]; edges: Edge[] }>;
  };
  takeSnapshot: () => void;
  undo: () => void;
  redo: () => void;
}

// Data type mapping for edges
type DataType = 'text' | 'image' | 'video';

const getDataTypeFromHandle = (handleId: string | null): DataType => {
  switch (handleId) {
    case 'text': return 'text';
    case 'image': return 'image';
    case 'video': return 'video';
    default: return 'text';
  }
};

const normalizeFrameConnection = (connection: Connection, nodes: StudioNode[]): Connection => {
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);

  if (!sourceNode || !targetNode) return connection;

  const sourceHandle = connection.sourceHandle ?? '';
  const targetHandle = connection.targetHandle ?? '';
  const isFrameHandle = ['first-frame', 'last-frame', 'ref-image', 'ref-images'].includes(sourceHandle);
  const isImageSource = targetHandle === 'image' && (targetNode.type === 'image' || targetNode.type === 'nanoGen');

  if (sourceNode.type === 'veoDirector' && isFrameHandle && isImageSource) {
    return {
      ...connection,
      source: connection.target,
      sourceHandle: 'image',
      target: connection.source,
      targetHandle: sourceHandle,
    };
  }

  return connection;
};

const getEdgeStyle = (sourceHandle: string | null, _edgeType: EdgeType) => {
  const dataType = getDataTypeFromHandle(sourceHandle);

  return {
    ['--edge-color' as keyof CSSProperties]: `var(--edge-${dataType})`,
  };
};

const normalizeEdges = (edges: Edge[], nodes: StudioNode[]): Edge[] => {
  if (!nodes || !Array.isArray(nodes)) return edges || [];
  if (!edges || !Array.isArray(edges)) return [];
  
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return edges.flatMap((edge) => {
    const targetNode = nodeById.get(edge.target);
    if (!targetNode || !edge.targetHandle) return edge;

    let targetHandle = edge.targetHandle;
    if (targetHandle === 'text') {
      if (targetNode.type === 'nanoGen') {
        targetHandle = 'prompt';
      } else if (targetNode.type === 'veoDirector') {
        targetHandle = 'prompt-in';
      }
    }

    if (targetHandle === 'prompt' && targetNode.type === 'veoDirector') {
      targetHandle = 'prompt-in';
    }

    if (targetHandle === 'ref-image' && targetNode.type === 'veoDirector') {
      targetHandle = 'ref-images';
    }

    const allowedTargets = getAllowedTargetHandles(targetNode);
    const isFrameHandle = targetHandle.startsWith('frame-');
    const isValidTarget = allowedTargets.includes(targetHandle) || isFrameHandle;

    if (!isValidTarget) {
      return [];
    }

    const sourceNode = nodeById.get(edge.source);
    if (edge.sourceHandle && sourceNode) {
      const allowedSources = getAllowedSourceHandles(sourceNode);
      if (allowedSources.length > 0 && !allowedSources.includes(edge.sourceHandle)) {
        return [];
      }
    }

    if (targetHandle === edge.targetHandle) return edge;

    return {
      ...edge,
      targetHandle,
    };
  });
};

export const useStudioStore = create<StudioState>((set, get) => ({
  nodes: [],
  edges: [],
  defaultEdgeType: 'bezier',
  interactionMode: 'pan',
  deletedNodeIds: [],
  deletedEdgeIds: [],
  saveTrigger: 0,

  onNodesChange: (changes: NodeChange<StudioNode>[]) => {
    const deletedNodes = changes
      .filter((c) => c.type === 'remove')
      .map((c) => (c as { id: string }).id);

    set((state) => {
        const newNodes = applyNodeChanges(changes, state.nodes);
        
        const isDragging = changes.some(c => c.type === 'position' && (c as any).dragging);
        const multipleMoving = changes.filter(c => c.type === 'position').length > 1;

        if (isDragging || multipleMoving) {
            return { nodes: newNodes };
        }

        const hasDimensions = newNodes.some(n => n.measured?.width || n.width);
        
        return {
            nodes: hasDimensions ? resolveCollisions(newNodes) : newNodes,
            deletedNodeIds: deletedNodes.length > 0 ? [...state.deletedNodeIds, ...deletedNodes] : state.deletedNodeIds,
            saveTrigger: deletedNodes.length > 0 ? state.saveTrigger + 1 : state.saveTrigger,
        };
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    const deletedEdges = changes
      .filter((c) => c.type === 'remove')
      .map((c) => (c as { id: string }).id);
    
    const nextEdges = applyEdgeChanges(changes, get().edges);
    set((state) => ({
      edges: normalizeEdges(nextEdges, state.nodes),
      deletedEdgeIds: [...state.deletedEdgeIds, ...deletedEdges],
      saveTrigger: deletedEdges.length > 0 ? state.saveTrigger + 1 : state.saveTrigger,
    }));
  },

  onConnect: (connection: Connection) => {
    const normalized = normalizeFrameConnection(connection, get().nodes);

    if (!isValidConnection(normalized, get().edges, get().nodes)) {
      console.warn('Invalid connection:', connection);
      return; 
    }

    const edgeType = get().defaultEdgeType;
    const style = getEdgeStyle(normalized.sourceHandle, edgeType);

    const newEdge = {
      ...normalized,
      id: `e-${normalized.source}-${normalized.target}-${Date.now()}`,
      type: 'dataType',
      className: 'studio-edge',
      style,
      data: {
        dataType: getDataTypeFromHandle(normalized.sourceHandle),
        pathType: edgeType,
      },
    };

    set((state) => ({
      edges: addEdge(newEdge as Edge, state.edges),
      saveTrigger: state.saveTrigger + 1,
    }));
  },

  setNodes: (nodes: StudioNode[]) => {
    set((state) => {
      const normalizedEdges = normalizeEdges(state.edges, nodes);
      return { nodes, edges: normalizedEdges };
    });
  },
  
  setEdges: (edges: Edge[]) => {
    set((state) => ({ edges: normalizeEdges(edges, state.nodes) }));
  },

  updateNodeData: (id: string, data: Partial<StudioNode['data']>) => {
    set((state) => {
      const nodeIndex = state.nodes.findIndex(n => n.id === id);
      if (nodeIndex === -1) return state;

      const updatedNode = {
        ...state.nodes[nodeIndex],
        data: {
          ...state.nodes[nodeIndex].data,
          ...data,
        },
      };

      const newNodes = [...state.nodes];
      newNodes[nodeIndex] = updatedNode as StudioNode;

      return { nodes: newNodes };
    });
  },

  getNodeById: (id: string) => {
    return get().nodes.find((n) => n.id === id);
  },

  getConnectedEdges: (nodeId: string, handleType?: 'source' | 'target') => {
    return get().edges.filter((e) => {
      if (handleType === 'source' && e.source === nodeId) return true;
      if (handleType === 'target' && e.target === nodeId) return true;
      if (!handleType && (e.source === nodeId || e.target === nodeId)) return true;
      return false;
    });
  },

  setDefaultEdgeType: (type: EdgeType) => {
    set({ defaultEdgeType: type });
  },

  setInteractionMode: (mode: InteractionMode) => {
    set({ interactionMode: mode });
  },

  duplicateNode: (id: string) => {
    const state = get();
    const nodeToDuplicate = state.nodes.find((n) => n.id === id);
    if (!nodeToDuplicate) return;

    const newNode = {
      ...nodeToDuplicate,
      id: `${nodeToDuplicate.type}-${Date.now()}`,
      position: {
        x: nodeToDuplicate.position.x + 20,
        y: nodeToDuplicate.position.y + 20,
      },
      data: { ...nodeToDuplicate.data },
      selected: false,
    };

    set({ 
      nodes: [...state.nodes, newNode],
      saveTrigger: state.saveTrigger + 1
    });
  },

  deleteNode: (id: string) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      deletedNodeIds: [...state.deletedNodeIds, id],
      deletedEdgeIds: [
        ...state.deletedEdgeIds,
        ...state.edges
          .filter((e) => e.source === id || e.target === id)
          .map((e) => e.id),
      ],
      saveTrigger: state.saveTrigger + 1,
    }));
  },

  history: {
    past: [],
    future: [],
  },

  takeSnapshot: () => {
    set((state) => {
      const newPast = [
        ...state.history.past,
        { nodes: state.nodes, edges: state.edges },
      ].slice(-50); 

      return {
        history: {
          past: newPast,
          future: [],
        },
      };
    });
  },

  undo: () => {
    set((state) => {
      if (state.history.past.length === 0) return state;

      const previous = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);

      return {
        nodes: previous.nodes,
        edges: previous.edges,
        history: {
          past: newPast,
          future: [{ nodes: state.nodes, edges: state.edges }, ...state.history.future],
        },
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.history.future.length === 0) return state;

      const next = state.history.future[0];
      const newFuture = state.history.future.slice(1);

      return {
        nodes: next.nodes,
        edges: next.edges,
        history: {
          past: [...state.history.past, { nodes: state.nodes, edges: state.edges }],
          future: newFuture,
        },
      };
    });
  },

  getDeletedNodeIds: () => {
    return get().deletedNodeIds;
  },

  getDeletedEdgeIds: () => {
    return get().deletedEdgeIds;
  },

  clearDeletedIds: () => {
    set({ deletedNodeIds: [], deletedEdgeIds: [] });
  },

  triggerSave: () => {
    set((state) => ({ saveTrigger: state.saveTrigger + 1 }));
  },
}));
