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
import {
  type AdData,
  AUDIENCE_HANDLE_ID,
  type CampaignCanvasEdge,
  type CampaignCanvasNode,
  type CampaignCanvasNodeData,
  type CampaignCanvasPlatform,
  type CampaignNodeType,
  type CreativeAssetType,
  type CreativeData,
} from '../types';
import {
  adFormatForCreativeType,
  creativeTypeForAdFormat,
  isAdFormatCompatibleWithCreativeType,
  retargetCreativeData,
} from '../types/adCreativeCompatibility';
import { getTargetHandleIdFor } from '../types/hierarchyNavigation';
import {
  billingEventForGoal,
  DEFAULT_OPTIMIZATION_GOAL,
  placementLabels,
} from '../types/nodeOptions';
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
  /**
   * True while a save is in flight. The save serializes the graph as it was when Save was
   * pressed and then reloads the version it wrote — so an edit made in between would be
   * silently replaced. Every mutator refuses while this is set; selection still works.
   */
  editLocked: boolean;
  setEditLocked: (locked: boolean) => void;
  loadHydratedGraph: (graph: HydratedCanvasGraph) => void;
  loadOpenAiGraph: (graph: HydratedOpenAiGraph) => void;
  startOpenAiDraft: () => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  /**
   * Why this connection would be refused, or null if it would land.
   * The canvas toasts this; React Flow uses it to refuse the snap.
   * Silent `console.warn` was why a blocked edge looked like "can't connect".
   */
  connectionBlockReason: (connection: Connection) => string | null;
  /**
   * Why a NEW child of `childType` may not hang off `parentId` — asked before a node is drawn
   * off a handle, so a refused connection never leaves a stranded node behind.
   */
  childBlockReason: (parentId: string, childType: CampaignNodeType) => string | null;
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
  /** One field edit = one history entry, so undo reverts it. A no-op edit records nothing. */
  updateNodeData: (id: string, data: Partial<CampaignCanvasNodeData>) => void;
  /**
   * Switch a creative's format AND the format of every ad it feeds, as one undo step.
   * An ad's format is read from its creative; changing one without the other would
   * leave a pair the connection rules refuse.
   */
  setCreativeFormat: (id: string, assetType: CreativeAssetType) => void;
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
/** A side input (an audience) sits one node width plus a gap to the left of its ad set. */
const SIDE_INPUT_HORIZONTAL_OFFSET = 440;

const NODE_LABELS_FOR_REASONS: Record<CampaignNodeType, string> = {
  campaign: 'A campaign',
  'ad-set': 'An ad set',
  ad: 'An ad',
  audience: 'An audience',
  creative: 'A creative',
  'openai-campaign': 'A campaign',
  'openai-ad-group': 'An ad group',
  'openai-ad': 'An ad',
};

/**
 * The data a node created BESIDE an existing one starts with, so the edge that follows
 * is one the rules accept: a creative under a VIDEO ad starts as a video, an ad above a
 * carousel starts as a CAROUSEL ad.
 */
/**
 * The graph as a save sees it — structure, positions and field values, never selection or the
 * validation verdicts the canvas derives. Two fingerprints differ exactly when a save of one
 * would not be a save of the other.
 */
export function graphFingerprint(nodes: CampaignCanvasNode[], edges: CampaignCanvasEdge[]): string {
  return JSON.stringify({
    nodes: nodes.map(({ id, type, position, data }) => {
      const { validationErrors: _errors, validationStatus: _status, ...fields } = data;
      return { id, type, x: position.x, y: position.y, fields };
    }),
    edges: edges.map(({ source, target, sourceHandle, targetHandle }) => ({
      source,
      target,
      sourceHandle: sourceHandle ?? null,
      targetHandle: targetHandle ?? null,
    })),
  });
}

export function seedDataForConnectedNode(
  anchor: CampaignCanvasNode,
  newType: CampaignNodeType,
): Partial<CampaignCanvasNodeData> {
  if (anchor.type === 'ad' && newType === 'creative') {
    return { assetType: creativeTypeForAdFormat((anchor.data as AdData).adFormat) };
  }
  if (anchor.type === 'creative' && newType === 'ad') {
    return { adFormat: adFormatForCreativeType((anchor.data as CreativeData).assetType) };
  }
  return {};
}

/**
 * What a freshly drawn Meta node holds before anyone edits it: a complete, saveable value
 * for every field the inspector shows, so a new node never reads as half-configured.
 */
function newNodeDefaults(
  type: CampaignNodeType,
  currency: string,
): Partial<CampaignCanvasNodeData> {
  switch (type) {
    case 'campaign':
      return { objective: 'OUTCOME_SALES', buyingType: 'AUCTION', specialAdCategories: [] };
    case 'ad-set':
      return {
        optimizationGoal: DEFAULT_OPTIMIZATION_GOAL,
        billingEvent: billingEventForGoal(DEFAULT_OPTIMIZATION_GOAL),
        budgetType: 'DAILY',
        budgetAmount: 0,
        budgetCurrency: currency,
        placementMode: 'advantage_plus',
        pacingType: placementLabels({ placementMode: 'advantage_plus' }),
      };
    case 'ad':
      return { adFormat: 'IMAGE', primaryText: '', headline: '', callToAction: 'LEARN_MORE' };
    case 'audience':
      return { mode: 'broad', locations: [], genders: [] };
    case 'creative':
      return { assetType: 'image' };
    default:
      return {};
  }
}

const withArticle = (word: string, capitalized = false): string => {
  const article = /^[aeiou]/.test(word) ? 'an' : 'a';
  return `${capitalized ? article.charAt(0).toUpperCase() + article.slice(1) : article} ${word}`;
};

const shallowEqualValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return false;
};

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
  editLocked: false,

  setEditLocked: (editLocked) => set({ editLocked }),

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
    // While a save is in flight only selection and measurement pass: a drag or a delete would
    // be replaced by the version the save reloads.
    const allowed = get().editLocked
      ? changes.filter((change) => change.type === 'select' || change.type === 'dimensions')
      : changes;
    if (allowed.length === 0) return;

    // A keyboard delete arrives here, not through `removeNode`. It is a structural edit like
    // any other: one undo step, the canvas marked dirty, and the node's edges removed WITH it
    // — so the edge removals React Flow sends next find nothing left and record no second step.
    const removedIds = new Set(
      allowed.flatMap((change) => (change.type === 'remove' ? [change.id] : [])),
    );
    if (removedIds.size > 0) get().pushHistory();

    const nextNodes = applyNodeChanges(allowed, get().nodes) as CampaignCanvasNode[];
    const nextEdges =
      removedIds.size > 0
        ? get().edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target))
        : get().edges;
    set({ nodes: nextNodes, edges: nextEdges });
    debouncedValidation(
      set,
      () => get().nodes,
      () => get().edges,
    );
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    const allowed = get().editLocked
      ? changes.filter((change) => change.type === 'select')
      : changes;
    if (allowed.length === 0) return;

    const existing = new Set(get().edges.map((edge) => edge.id));
    const removesSomething = allowed.some(
      (change) => change.type === 'remove' && existing.has(change.id),
    );
    if (removesSomething) get().pushHistory();

    const nextEdges = applyEdgeChanges(allowed, get().edges) as CampaignCanvasEdge[];
    set({ edges: nextEdges });
    debouncedValidation(
      set,
      () => get().nodes,
      () => get().edges,
    );
  },

  connectionBlockReason: (connection: Connection) => {
    const { nodes, edges } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (sourceNode && targetNode) {
      if (!validateConnection(sourceNode.type, targetNode.type)) {
        return `${sourceNode.type} cannot connect to ${targetNode.type}. Campaign → ad set → ad → creative, and an audience feeds an ad set from the side.`;
      }

      const landsOnAudienceHandle = connection.targetHandle === AUDIENCE_HANDLE_ID;
      if (sourceNode.type === 'audience' && !landsOnAudienceHandle) {
        return "An audience feeds an ad set from the side. Drop it on the ad set's left handle.";
      }
      if (sourceNode.type !== 'audience' && landsOnAudienceHandle) {
        return `${NODE_LABELS_FOR_REASONS[sourceNode.type]} cannot use an ad set's side handle. Only an audience feeds an ad set from the side.`;
      }

      if (sourceNode.type === 'ad' && targetNode.type === 'creative') {
        const secondCreative = get().childBlockReason(sourceNode.id, 'creative');
        const alreadyThis = edges.some(
          (edge) => edge.source === sourceNode.id && edge.target === targetNode.id,
        );
        if (secondCreative && !alreadyThis) return secondCreative;
        const adFormat = (sourceNode.data as AdData).adFormat;
        const assetType = (targetNode.data as CreativeData).assetType;
        if (!isAdFormatCompatibleWithCreativeType(adFormat, assetType)) {
          const ad = (adFormat ?? 'IMAGE').toLowerCase();
          const creative = assetType ?? 'image';
          return `${withArticle(ad, true)} ad cannot use ${withArticle(creative)} creative. Switch the creative to ${creativeTypeForAdFormat(adFormat)}, or connect it to ${withArticle(adFormatForCreativeType(assetType).toLowerCase())} ad.`;
        }
      }
    }

    return getSingleParentConnectionViolationMessage(connection, nodes, edges);
  },

  childBlockReason: (parentId, childType) => {
    const { nodes, edges } = get();
    const parent = nodes.find((node) => node.id === parentId);
    if (parent?.type !== 'ad' || childType !== 'creative') return null;
    const hasCreative = edges.some(
      (edge) =>
        edge.source === parentId &&
        nodes.find((node) => node.id === edge.target)?.type === 'creative',
    );
    return hasCreative
      ? 'An ad takes one creative. For several images or videos, switch its creative to a carousel.'
      : null;
  },

  onConnect: (connection: Connection) => {
    if (get().editLocked) return;
    const reason = get().connectionBlockReason(connection);
    if (reason) return;

    const { nodes, edges, pushHistory } = get();
    pushHistory();
    const nextEdges = addEdge(connection, edges);
    const nextNodes = applyCampaignGraphValidation(nodes, nextEdges);
    set({
      edges: nextEdges,
      nodes: nextNodes,
      ...(get().hydration ? { isDirty: true } : {}),
    });
  },

  addNode: (type, data, position = { x: 100, y: 100 }) => {
    if (get().editLocked) return '';
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
        ...newNodeDefaults(type, get().hydration?.plan?.currency ?? 'USD'),
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
    if (!sourceNode || get().editLocked) return;
    if (get().childBlockReason(sourceId, targetType)) return;
    const seeded = { ...seedDataForConnectedNode(sourceNode, targetType), ...data };

    // A side input (an audience beside its ad set) is UPSTREAM of the node it was added
    // from, so the edge runs new -> anchor and the node sits to the left.
    if (!validateConnection(sourceNode.type, targetType)) {
      if (!validateConnection(targetType, sourceNode.type)) return;
      // One audience per ad set: adding a second would only strand a node beside it.
      const alreadyFed = edges.some(
        (edge) =>
          edge.target === sourceId &&
          nodes.find((node) => node.id === edge.source)?.type === targetType,
      );
      if (alreadyFed) return;
      const inputId = addNode(targetType, seeded, {
        x: sourceNode.position.x - SIDE_INPUT_HORIZONTAL_OFFSET,
        y: sourceNode.position.y,
      });
      onConnect({
        source: inputId,
        sourceHandle: null,
        target: sourceId,
        targetHandle: getTargetHandleIdFor(targetType, sourceNode.type),
      });
      return;
    }

    const existingChildrenCount = edges.filter((edge) => edge.source === sourceId).length;
    const newPosition = {
      x: sourceNode.position.x + getSiblingHorizontalOffset(existingChildrenCount),
      y: sourceNode.position.y + CONNECTED_NODE_VERTICAL_OFFSET,
    };

    const targetId = addNode(targetType, seeded, newPosition);
    onConnect({
      source: sourceId,
      sourceHandle: null,
      target: targetId,
      targetHandle: getTargetHandleIdFor(sourceNode.type, targetType),
    });
  },

  updateNodeData: (id, data) => {
    const current = get().nodes.find((node) => node.id === id);
    if (!current || get().editLocked) return;
    const record = current.data as Record<string, unknown>;
    const changed = Object.entries(data).some(
      ([key, value]) => !shallowEqualValue(record[key], value),
    );
    if (!changed) return;

    get().pushHistory();
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

  setCreativeFormat: (id, assetType) => {
    const creative = get().nodes.find((node) => node.id === id && node.type === 'creative');
    if (!creative || get().editLocked) return;
    const patch = retargetCreativeData(creative.data as CreativeData, assetType);
    if (Object.keys(patch).length === 0) return;

    get().pushHistory();
    const { edges } = get();
    const adIds = new Set(edges.filter((edge) => edge.target === id).map((edge) => edge.source));
    const nextNodes = get().nodes.map((node) => {
      if (node.id === id) return { ...node, data: { ...node.data, ...patch } };
      if (
        node.type === 'ad' &&
        adIds.has(node.id) &&
        !isAdFormatCompatibleWithCreativeType((node.data as AdData).adFormat, assetType)
      ) {
        return { ...node, data: { ...node.data, adFormat: adFormatForCreativeType(assetType) } };
      }
      return node;
    });
    set({ nodes: applyCampaignGraphValidation(nextNodes as CampaignCanvasNode[], edges) });
  },

  removeNode: (id) => {
    if (get().editLocked) return;
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
    if (!nodeToDuplicate || get().editLocked) return;

    pushHistory();
    const deselectedNodes = nodes.map((n) => ({ ...n, selected: false }));

    const newNode: CampaignCanvasNode = {
      ...nodeToDuplicate,
      id: uuidv4(),
      position: {
        x: nodeToDuplicate.position.x + 20,
        y: nodeToDuplicate.position.y + 20,
      },
      // A copy is a DRAFT: it carries none of the record's identity. Keeping the provenance
      // would let the save treat it as the original's row, and a Meta id would claim an object
      // the copy never created.
      data: {
        ...nodeToDuplicate.data,
        label: `${nodeToDuplicate.data.label} (Copy)`,
        provenance: undefined,
        metaId: undefined,
      },
      selected: true,
    };

    const nextNodes = applyCampaignGraphValidation([...deselectedNodes, newNode], get().edges);
    set({ nodes: nextNodes });
  },

  undo: () => {
    const { nodes, edges, history, redoStack } = get();
    if (history.length === 0 || get().editLocked) return;

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
    if (redoStack.length === 0 || get().editLocked) return;

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
      editLocked: false,
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
    'ad-set': ['ad'],
    ad: ['creative'],
    // Side entry: audience -> ad set, onto the ad set's `audience` handle.
    audience: ['ad-set'],
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
