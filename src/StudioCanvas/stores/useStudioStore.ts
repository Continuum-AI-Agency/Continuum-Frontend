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
  MarkerType,
} from '@xyflow/react';
import { StudioNode } from '../types';

export type EdgeType = 'bezier' | 'straight' | 'step' | 'smoothstep';

interface StudioState {
  nodes: StudioNode[];
  edges: Edge[];
  defaultEdgeType: EdgeType;
  onNodesChange: OnNodesChange<StudioNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: StudioNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodeData: (id: string, data: Partial<StudioNode['data']>) => void;
  getNodeById: (id: string) => StudioNode | undefined;
  getConnectedEdges: (nodeId: string, handleType?: 'source' | 'target') => Edge[];
  setDefaultEdgeType: (type: EdgeType) => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  
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

const isValidConnection = (connection: Connection, edges: Edge[]) => {
  const { sourceHandle, targetHandle } = connection;
  
  const targetEdgeCount = edges.filter(
    (e) => e.target === connection.target && e.targetHandle === targetHandle
  ).length;

  const connectionLimits: Record<string, number> = {
    'prompt': 1,        
    'negative': 1,      
    'prompt-in': 1,     
    'trigger': 1,       
    'first-frame': 1,   
    'last-frame': 1,    
    'ref-image': 3,
    'ref-images': 14,     
  };

  if (targetHandle && connectionLimits[targetHandle] !== undefined) {
    if (targetEdgeCount >= connectionLimits[targetHandle]) {
      console.warn(`Connection limit reached for handle: ${targetHandle}`);
      return false;
    }
  }
  
  if (sourceHandle === 'text' && (targetHandle === 'prompt' || targetHandle === 'prompt-in' || targetHandle === 'negative')) return true;
  
  if (sourceHandle === 'image' && (targetHandle === 'first-frame' || targetHandle === 'last-frame' || targetHandle === 'ref-image' || targetHandle === 'ref-images')) return true;

  return false;
};

const getEdgeStyle = (sourceHandle: string | null, edgeType: EdgeType) => {
  const dataType = getDataTypeFromHandle(sourceHandle);
  
  // Base colors by data type
  const colors: Record<DataType, string> = {
    text: '#94a3b8',   // slate-400
    image: '#6366f1',  // indigo-500
    video: '#a855f7',  // purple-500
  };
  
  const color = colors[dataType];
  
  // Style based on edge type
  switch (edgeType) {
    case 'straight':
      return { stroke: color, strokeWidth: 2 };
    case 'step':
      return { stroke: color, strokeWidth: 2 };
    case 'smoothstep':
      return { stroke: color, strokeWidth: 2 };
    case 'bezier':
    default:
      return { stroke: color, strokeWidth: 2 };
  }
};

export const useStudioStore = create<StudioState>((set, get) => ({
  nodes: [],
  edges: [],
  defaultEdgeType: 'bezier',

  onNodesChange: (changes: NodeChange<StudioNode>[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection: Connection) => {
    if (!isValidConnection(connection, get().edges)) {
      console.warn('Invalid connection:', connection);
      return; 
    }

    const edgeType = get().defaultEdgeType;
    const style = getEdgeStyle(connection.sourceHandle, edgeType);

    const newEdge = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      type: edgeType,
      animated: true,
      style,
      data: {
        dataType: getDataTypeFromHandle(connection.sourceHandle),
      },
    };

    set({
      edges: addEdge(newEdge as Edge, get().edges),
    });
  },

  setNodes: (nodes: StudioNode[]) => {
    set({ nodes });
  },
  
  setEdges: (edges: Edge[]) => {
    set({ edges });
  },

  updateNodeData: (id: string, data: Partial<StudioNode['data']>) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...data,
            },
          };
        }
        return node;
      }) as StudioNode[],
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

    set({ nodes: [...state.nodes, newNode] });
  },

  deleteNode: (id: string) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
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
}));
