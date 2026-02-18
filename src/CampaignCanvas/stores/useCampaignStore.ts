import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { 
  type CampaignCanvasNode, 
  type CampaignCanvasEdge, 
  type CampaignNodeType,
  type CampaignCanvasNodeData 
} from '../types';
import { v4 as uuidv4 } from 'uuid';

interface HistoryState {
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
}

interface CampaignStore {
  nodes: CampaignCanvasNode[];
  edges: CampaignCanvasEdge[];
  history: HistoryState[];
  redoStack: HistoryState[];
  edgeStyle: 'curved' | 'straight';
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: CampaignNodeType, data: Partial<CampaignCanvasNodeData>, position?: { x: number; y: number }) => string;
  addConnectedNode: (sourceId: string, targetType: CampaignNodeType, data?: Partial<CampaignCanvasNodeData>) => void;
  updateNodeData: (id: string, data: Partial<CampaignCanvasNodeData>) => void;
  removeNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  validateGraph: () => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  setEdgeStyle: (style: 'curved' | 'straight') => void;
}

export const useCampaignStore = create<CampaignStore>((set, get) => ({
  nodes: [],
  edges: [],
  history: [],
  redoStack: [],
  edgeStyle: 'curved',

  pushHistory: () => {
    const { nodes, edges, history } = get();
    set({
      history: [...history, { nodes: [...nodes], edges: [...edges] }].slice(-50),
      redoStack: [],
    });
  },

  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as CampaignCanvasNode[],
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges) as CampaignCanvasEdge[],
    });
  },

  onConnect: (connection: Connection) => {
    const { nodes, pushHistory } = get();
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);

    if (sourceNode && targetNode) {
      const isValid = validateConnection(sourceNode.type, targetNode.type);
      if (!isValid) {
        console.warn(`Invalid connection: ${sourceNode.type} -> ${targetNode.type}`);
        return;
      }
    }

    pushHistory();
    set({
      edges: addEdge(connection, get().edges),
    });
  },

  addNode: (type, data, position = { x: 100, y: 100 }) => {
    const { pushHistory, nodes } = get();
    pushHistory();
    
    const deselectedNodes = nodes.map(n => ({ ...n, selected: false }));
    const id = uuidv4();
    
    const newNode: CampaignCanvasNode = {
      id,
      type,
      position,
      data: {
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${get().nodes.length + 1}`,
        validationStatus: 'valid',
        ...data,
      } as CampaignCanvasNodeData,
      selected: true,
    };

    set({
      nodes: [...deselectedNodes, newNode],
    });

    return id;
  },

  addConnectedNode: (sourceId, targetType, data = {}) => {
    const { nodes, addNode, onConnect } = get();
    const sourceNode = nodes.find(n => n.id === sourceId);
    if (!sourceNode) return;

    // Calculate position for the new node (to the right of the source)
    const newPosition = {
      x: sourceNode.position.x + 300,
      y: sourceNode.position.y,
    };

    const targetId = addNode(targetType, data, newPosition);
    onConnect({ source: sourceId, target: targetId });
  },

  updateNodeData: (id, data) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      ),
    });
  },

  removeNode: (id) => {
    const { pushHistory } = get();
    pushHistory();
    set({
      nodes: get().nodes.filter((node) => node.id !== id),
      edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id),
    });
  },

  duplicateNode: (id) => {
    const { pushHistory, nodes } = get();
    const nodeToDuplicate = nodes.find((n) => n.id === id);
    if (!nodeToDuplicate) return;

    pushHistory();
    const deselectedNodes = nodes.map(n => ({ ...n, selected: false }));
    
    const newNode: CampaignCanvasNode = {
      ...nodeToDuplicate,
      id: uuidv4(),
      position: {
        x: nodeToDuplicate.position.x + 20,
        y: nodeToDuplicate.position.y + 20,
      },
      data: {
        ...nodeToDuplicate.data,
        label: `${nodeToDuplicate.data.label} (Copy)`,
      },
      selected: true,
    };

    set({
      nodes: [...deselectedNodes, newNode],
    });
  },

  undo: () => {
    const { nodes, edges, history, redoStack } = get();
    if (history.length === 0) return;

    const previous = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    set({
      nodes: previous.nodes,
      edges: previous.edges,
      history: newHistory,
      redoStack: [{ nodes, edges }, ...redoStack],
    });
  },

  redo: () => {
    const { nodes, edges, history, redoStack } = get();
    if (redoStack.length === 0) return;

    const next = redoStack[0];
    const newRedoStack = redoStack.slice(1);

    set({
      nodes: next.nodes,
      edges: next.edges,
      history: [...history, { nodes, edges }],
      redoStack: newRedoStack,
    });
  },

  setEdgeStyle: (edgeStyle) => set({ edgeStyle }),

  validateGraph: () => {
    console.log('Validating campaign graph...');
  },
}));

function validateConnection(sourceType: CampaignNodeType, targetType: CampaignNodeType): boolean {
  const rules: Record<CampaignNodeType, CampaignNodeType[]> = {
    'campaign': ['ad-set', 'budget'],
    'ad-set': ['ad', 'audience', 'budget'],
    'ad': ['creative'],
    'audience': [],
    'creative': [],
    'budget': [],
  };

  return rules[sourceType]?.includes(targetType) || false;
}
