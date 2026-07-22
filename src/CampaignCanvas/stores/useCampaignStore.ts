import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { registerBrandScopedStore } from '@/lib/brands/brand-switch';
import { buildCampaignCanvasPayload } from '@/lib/campaign-canvas/payload';
import type {
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignCanvasNodeData,
  CampaignNodeType,
} from '../types';
import { applyCampaignGraphValidation } from '../validation/applyCampaignGraphValidation';
import { getSingleParentConnectionViolationMessage } from '../validation/hierarchyRelationships';

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
  addNode: (
    type: CampaignNodeType,
    data: Partial<CampaignCanvasNodeData>,
    position?: { x: number; y: number },
  ) => string;
  addConnectedNode: (
    sourceId: string,
    targetType: CampaignNodeType,
    data?: Partial<CampaignCanvasNodeData>,
  ) => void;
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
  resetForBrandSwitch: () => void;
}

const CONNECTED_NODE_VERTICAL_OFFSET = 300;
const CONNECTED_NODE_SIBLING_HORIZONTAL_SPACING = 180;

function getSiblingHorizontalOffset(index: number): number {
  if (index <= 0) return 0;
  const depth = Math.ceil(index / 2);
  const direction = index % 2 === 1 ? -1 : 1;
  return direction * depth * CONNECTED_NODE_SIBLING_HORIZONTAL_SPACING;
}

let validationTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedValidation(
  set: (partial: Partial<Pick<CampaignStore, 'nodes'>>) => void,
  getNodes: () => CampaignCanvasNode[],
  getEdges: () => CampaignCanvasEdge[],
) {
  if (validationTimer) clearTimeout(validationTimer);
  validationTimer = setTimeout(() => {
    set({ nodes: applyCampaignGraphValidation(getNodes(), getEdges()) });
  }, 200);
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
    const nextNodes = applyNodeChanges(changes, get().nodes) as CampaignCanvasNode[];
    set({ nodes: nextNodes });
    debouncedValidation(
      set,
      () => get().nodes,
      () => get().edges,
    );
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    const nextEdges = applyEdgeChanges(changes, get().edges) as CampaignCanvasEdge[];
    set({ edges: nextEdges });
    debouncedValidation(
      set,
      () => get().nodes,
      () => get().edges,
    );
  },

  onConnect: (connection: Connection) => {
    const { nodes, edges, pushHistory } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (sourceNode && targetNode) {
      const isValid = validateConnection(sourceNode.type, targetNode.type);
      if (!isValid) {
        console.warn(`Invalid connection: ${sourceNode.type} -> ${targetNode.type}`);
        return;
      }
    }

    const singleParentViolation = getSingleParentConnectionViolationMessage(
      connection,
      nodes,
      edges,
    );
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

    const deselectedNodes = nodes.map((n) => ({ ...n, selected: false }));
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

    const nextNodes = applyCampaignGraphValidation([...deselectedNodes, newNode], get().edges);
    set({ nodes: nextNodes });

    return id;
  },

  addConnectedNode: (sourceId, targetType, data = {}) => {
    const { nodes, edges, addNode, onConnect } = get();
    const sourceNode = nodes.find((n) => n.id === sourceId);
    if (!sourceNode) return;

    const existingChildrenCount = edges.filter((edge) => edge.source === sourceId).length;
    const newPosition = {
      x: sourceNode.position.x + getSiblingHorizontalOffset(existingChildrenCount),
      y: sourceNode.position.y + CONNECTED_NODE_VERTICAL_OFFSET,
    };

    const targetId = addNode(targetType, data, newPosition);
    onConnect({ source: sourceId, sourceHandle: null, target: targetId, targetHandle: null });
  },

  updateNodeData: (id, data) => {
    const nextNodes = get().nodes.map((node) =>
      node.id === id ? { ...node, data: { ...node.data, ...data } } : node,
    );
    set({ nodes: nextNodes });
    debouncedValidation(
      set,
      () => get().nodes,
      () => get().edges,
    );
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
    const deselectedNodes = nodes.map((n) => ({ ...n, selected: false }));

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

    const nextNodes = applyCampaignGraphValidation([...deselectedNodes, newNode], get().edges);
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

  resetForBrandSwitch: () => {
    if (validationTimer) {
      clearTimeout(validationTimer);
      validationTimer = null;
    }
    set({
      nodes: [],
      edges: [],
      history: [],
      redoStack: [],
    });
  },

  validateGraph: () => {
    const { nodes, edges } = get();
    const validatedNodes = applyCampaignGraphValidation(nodes, edges);
    const invalidNodeCount = validatedNodes.filter(
      (node) => node.data.validationStatus === 'error',
    ).length;
    set({ nodes: validatedNodes });

    try {
      buildCampaignCanvasPayload(validatedNodes, edges, { source: 'unknown' });
      console.log(
        `Validating campaign graph... Found ${invalidNodeCount} invalid node(s). Payload schema valid.`,
      );
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
    campaign: ['ad-set'],
    'ad-set': ['ad', 'audience'],
    ad: ['creative'],
    audience: [],
    creative: [],
  };

  return rules[sourceType]?.includes(targetType) || false;
}

if (typeof window !== 'undefined') {
  registerBrandScopedStore({
    name: 'campaign-canvas',
    reset: () => useCampaignStore.getState().resetForBrandSwitch(),
  });
}
