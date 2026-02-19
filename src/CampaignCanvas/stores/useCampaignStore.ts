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
import { applyCampaignGraphValidation } from '../validation/applyCampaignGraphValidation';
import { getSingleParentConnectionViolationMessage } from '../validation/hierarchyRelationships';
import { buildCampaignCanvasPayload } from '@/lib/campaign-canvas/payload';

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
  validateGraph: () => {
    invalidNodeCount: number;
    payloadValid: boolean;
    payloadError?: string;
  };
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  setEdgeStyle: (style: 'curved' | 'straight') => void;
}

const CONNECTED_NODE_HORIZONTAL_OFFSET = 300;
const CONNECTED_NODE_VERTICAL_OFFSET = 300;

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
    const nextNodes = applyNodeChanges(changes, get().nodes) as CampaignCanvasNode[];
    const nextEdges = get().edges;
    set({
      nodes: applyCampaignGraphValidation(nextNodes, nextEdges),
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    const nextEdges = applyEdgeChanges(changes, get().edges) as CampaignCanvasEdge[];
    const nextNodes = get().nodes;
    set({
      edges: nextEdges,
      nodes: applyCampaignGraphValidation(nextNodes, nextEdges),
    });
  },

  onConnect: (connection: Connection) => {
    const { nodes, edges, pushHistory } = get();
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);

    if (sourceNode && targetNode) {
      const isValid = validateConnection(sourceNode.type, targetNode.type);
      if (!isValid) {
        console.warn(`Invalid connection: ${sourceNode.type} -> ${targetNode.type}`);
        return;
      }
    }

    const singleParentViolation = getSingleParentConnectionViolationMessage(connection, nodes, edges);
    if (singleParentViolation) {
      console.warn(singleParentViolation);
      return;
    }

    pushHistory();
    const nextEdges = addEdge(connection, edges);
    const nextNodes = applyCampaignGraphValidation(nodes, nextEdges);
    set({
      edges: nextEdges,
      nodes: nextNodes,
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

    const nextNodes = applyCampaignGraphValidation(
      [...deselectedNodes, newNode],
      get().edges
    );
    set({ nodes: nextNodes });

    return id;
  },

  addConnectedNode: (sourceId, targetType, data = {}) => {
    const { nodes, addNode, onConnect } = get();
    const sourceNode = nodes.find(n => n.id === sourceId);
    if (!sourceNode) return;

    const shouldAttachBelowSource = sourceNode.type === 'ad-set' && targetType === 'audience';
    const newPosition = shouldAttachBelowSource
      ? {
          x: sourceNode.position.x,
          y: sourceNode.position.y + CONNECTED_NODE_VERTICAL_OFFSET,
        }
      : {
          x: sourceNode.position.x + CONNECTED_NODE_HORIZONTAL_OFFSET,
          y: sourceNode.position.y,
        };

    const targetId = addNode(targetType, data, newPosition);
    onConnect({ source: sourceId, sourceHandle: null, target: targetId, targetHandle: null });
  },

  updateNodeData: (id, data) => {
    const nextEdges = get().edges;
    const nextNodes = get().nodes.map((node) =>
      node.id === id ? { ...node, data: { ...node.data, ...data } } : node
    );
    set({
      nodes: applyCampaignGraphValidation(nextNodes, nextEdges),
    });
  },

  removeNode: (id) => {
    const { pushHistory } = get();
    pushHistory();
    const nextNodes = get().nodes.filter((node) => node.id !== id);
    const nextEdges = get().edges.filter((edge) => edge.source !== id && edge.target !== id);
    set({
      nodes: applyCampaignGraphValidation(nextNodes, nextEdges),
      edges: nextEdges,
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

    const nextNodes = applyCampaignGraphValidation(
      [...deselectedNodes, newNode],
      get().edges
    );
    set({ nodes: nextNodes });
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
    const { nodes, edges } = get();
    const validatedNodes = applyCampaignGraphValidation(nodes, edges);
    const invalidNodeCount = validatedNodes.filter(
      (node) => node.data.validationStatus === 'error'
    ).length;
    set({ nodes: validatedNodes });

    try {
      buildCampaignCanvasPayload(validatedNodes, edges, { source: 'unknown' });
      console.log(`Validating campaign graph... Found ${invalidNodeCount} invalid node(s). Payload schema valid.`);
      return { invalidNodeCount, payloadValid: true };
    } catch (error) {
      const payloadError =
        error instanceof Error ? error.message : 'Unknown payload schema validation error.';
      console.warn('Campaign payload validation failed:', payloadError);
      return { invalidNodeCount, payloadValid: false, payloadError };
    }
  },
}));

function validateConnection(sourceType: CampaignNodeType, targetType: CampaignNodeType): boolean {
  const rules: Record<CampaignNodeType, CampaignNodeType[]> = {
    'campaign': ['ad-set'],
    'ad-set': ['ad', 'audience'],
    'ad': ['creative'],
    'audience': [],
    'creative': [],
  };

  return rules[sourceType]?.includes(targetType) || false;
}
