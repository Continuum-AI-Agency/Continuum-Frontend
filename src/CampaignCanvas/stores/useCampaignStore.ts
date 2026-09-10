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
import type { CanvasHydration, HydratedCanvasGraph } from '@/lib/campaign-canvas/hydrate';
import type {
  HydratedOpenAiGraph,
  OpenAiCanvasHydration,
} from '@/lib/campaign-canvas/hydrateOpenAi';
import { buildCampaignCanvasPayload } from '@/lib/campaign-canvas/payload';
import {
  captureOpenAiBaseline,
  type OpenAiPublishBaseline,
} from '@/lib/campaign-canvas/publishOpenAi';
import type {
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignCanvasNodeData,
  CampaignCanvasPlatform,
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
  /**
   * Which platform this canvas is for. It decides which node palette the context menu
   * offers and which record bar the page mounts — a canvas is never half Meta, half
   * OpenAI, because no edge may cross the two.
   */
  platform: CampaignCanvasPlatform;
  /** Set when the graph on screen was loaded from a real scaffold. Null for a draft. */
  hydration: CanvasHydration | null;
  /** Set when the graph was loaded from a real OpenAI campaign. Null for a draft. */
  openAiHydration: OpenAiCanvasHydration | null;
  /**
   * Node data as it was at hydration, keyed by node id. The publish plan diffs against
   * this, which is what lets the confirmation say "budget, name" instead of re-sending
   * every field of every node and calling it an update.
   */
  openAiBaseline: Record<string, OpenAiPublishBaseline>;
  /**
   * True once a hydrated graph has been edited. It never becomes a write: the browser
   * has no grant on any of these tables, so the only way a local edit reaches Meta is
   * "Propose via Jaina" -> paid_scaffold_propose -> a human approving the gate.
   */
  isDirty: boolean;
  loadHydratedGraph: (graph: HydratedCanvasGraph) => void;
  loadOpenAiGraph: (graph: HydratedOpenAiGraph) => void;
  startOpenAiDraft: () => void;
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

/**
 * The name a freshly dropped node gets. Title-casing the type is fine for `campaign` and
 * wrong for `openai-ad-group` ("Openai-ad-group 3"), so the label is declared.
 */
const NEW_NODE_LABELS: Record<CampaignNodeType, string> = {
  campaign: 'Campaign',
  'ad-set': 'Ad set',
  ad: 'Ad',
  audience: 'Audience',
  creative: 'Creative',
  'openai-campaign': 'Campaign',
  'openai-ad-group': 'Ad group',
  'openai-ad': 'Ad',
};

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
  platform: 'meta',
  hydration: null,
  openAiHydration: null,
  openAiBaseline: {},
  isDirty: false,

  loadHydratedGraph: ({ nodes, edges, hydration }) => {
    if (validationTimer) {
      clearTimeout(validationTimer);
      validationTimer = null;
    }
    set({
      nodes: applyCampaignGraphValidation(nodes, edges),
      edges,
      // A hydrated load is a new starting point, not a step: undoing back into the
      // previous scaffold's graph would offer to "restore" a different proposal.
      history: [],
      redoStack: [],
      platform: 'meta',
      hydration,
      openAiHydration: null,
      openAiBaseline: {},
      isDirty: false,
    });
  },

  /**
   * Load a real OpenAI campaign as the graph. Unlike its Meta sibling this IS editable
   * back to the platform: the baseline captured here is what the publish diff reads.
   */
  loadOpenAiGraph: ({ nodes, edges, hydration }) => {
    if (validationTimer) {
      clearTimeout(validationTimer);
      validationTimer = null;
    }
    set({
      nodes: applyCampaignGraphValidation(nodes, edges),
      edges,
      history: [],
      redoStack: [],
      platform: 'openai',
      hydration: null,
      openAiHydration: hydration,
      openAiBaseline: captureOpenAiBaseline(nodes),
      isDirty: false,
    });
  },

  /** An empty OpenAI canvas — what "Create new" opens. */
  startOpenAiDraft: () => {
    if (validationTimer) {
      clearTimeout(validationTimer);
      validationTimer = null;
    }
    set({
      nodes: [],
      edges: [],
      history: [],
      redoStack: [],
      platform: 'openai',
      hydration: null,
      openAiHydration: null,
      openAiBaseline: {},
      isDirty: false,
    });
  },

  pushHistory: () => {
    const { nodes, edges, history, hydration } = get();
    set({
      history: [...history, { nodes: [...nodes], edges: [...edges] }].slice(-50),
      redoStack: [],
      // Every structural mutator calls this before it changes anything, and nothing
      // that merely moves or selects a node does — which is exactly the line between
      // "this graph no longer matches the record" and "someone dragged a box".
      ...(hydration || get().openAiHydration ? { isDirty: true } : {}),
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
        label: `${NEW_NODE_LABELS[type]} ${get().nodes.length + 1}`,
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
    set({ nodes: nextNodes, ...(get().hydration ? { isDirty: true } : {}) });
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
      platform: 'meta',
      hydration: null,
      openAiHydration: null,
      openAiBaseline: {},
      isDirty: false,
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
  // Cross-platform edges are absent from every list on purpose. An `openai-ad` under a
  // Meta `ad-set` is a graph that can never publish to either platform, and a rule that
  // merely warned about it would let someone build one and find out at publish time.
  const rules: Record<CampaignNodeType, CampaignNodeType[]> = {
    campaign: ['ad-set'],
    'ad-set': ['ad', 'audience'],
    ad: ['creative'],
    audience: [],
    creative: [],
    'openai-campaign': ['openai-ad-group'],
    'openai-ad-group': ['openai-ad'],
    'openai-ad': [],
  };

  return rules[sourceType]?.includes(targetType) || false;
}

if (typeof window !== 'undefined') {
  registerBrandScopedStore({
    name: 'campaign-canvas',
    reset: () => useCampaignStore.getState().resetForBrandSwitch(),
  });
}
