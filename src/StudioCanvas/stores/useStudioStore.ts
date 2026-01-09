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

interface StudioState {
  nodes: StudioNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<StudioNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: StudioNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodeData: (id: string, data: Partial<StudioNode['data']>) => void;
}

const isValidConnection = (connection: Connection) => {
  const { sourceHandle, targetHandle } = connection;
  
  // Logic: 
  // Text -> Prompt
  if (sourceHandle === 'text' && (targetHandle === 'prompt' || targetHandle === 'prompt-in')) return true;
  
  // Image -> Frames/Ref
  if (sourceHandle === 'image' && (targetHandle === 'first-frame' || targetHandle === 'last-frame' || targetHandle === 'ref-image')) return true;

  return false;
};

const getEdgeColor = (sourceHandle: string | null) => {
  switch (sourceHandle) {
    case 'text': return '#94a3b8'; // slate-400
    case 'image': return '#6366f1'; // indigo-500
    case 'video': return '#a855f7'; // purple-500
    default: return '#64748b';
  }
};

export const useStudioStore = create<StudioState>((set, get) => ({
  nodes: [],
  edges: [],

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
    if (!isValidConnection(connection)) {
      console.warn('Invalid connection:', connection);
      return; 
    }

    const color = getEdgeColor(connection.sourceHandle);

    const newEdge = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      animated: true,
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: color,
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
}));
