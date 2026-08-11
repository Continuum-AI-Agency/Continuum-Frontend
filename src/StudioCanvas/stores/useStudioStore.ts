import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import type { CSSProperties } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { registerBrandScopedStore } from '@/lib/brands/brand-switch';
import type { StudioNode } from '../types';
import { resolveEdgeDataType } from '../utils/handleResolution';
import {
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  getTargetHandleConnectionLimit,
  validateConnection,
} from '../utils/isValidConnection';
import { resolveCollisions } from '../utils/nodeCollisions';
import {
  getVideoGeneratorImageReferenceHandle,
  isVideoGeneratorNodeType,
  resolveVideoGeneratorModel,
  resolveVideoGeneratorReferenceMode,
} from '../utils/videoModel';

export type EdgeType = 'bezier' | 'straight' | 'step' | 'smoothstep';
export type InteractionMode = 'pan' | 'select';

// Which surface currently owns keyboard input. While a full-screen editor (e.g.
// the Video Editor dialog) is open, it sets 'modal' so the canvas-level
// Delete/copy/paste/undo handlers stand down and the editor's own keymap wins.
export type KeyboardScope = 'canvas' | 'modal';

// The canvas always renders edges as bezier curves. The type is fixed so that
// consumers reading defaultEdgeType get a stable value and serialized workflows
// with any edge type load correctly (they all become bezier on load).
const FIXED_EDGE_TYPE: EdgeType = 'bezier';

interface StudioState {
  nodes: StudioNode[];
  edges: Edge[];
  defaultEdgeType: EdgeType;
  interactionMode: InteractionMode;
  keyboardScope: KeyboardScope;
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
  onNodesChange: OnNodesChange<StudioNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: StudioNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodeData: (id: string, data: Partial<StudioNode['data']>) => void;
  updateNode: (id: string, updater: (node: StudioNode) => StudioNode) => void;
  getNodeById: (id: string) => StudioNode | undefined;
  getConnectedEdges: (nodeId: string, handleType?: 'source' | 'target') => Edge[];
  setDefaultEdgeType: (type: EdgeType) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setKeyboardScope: (scope: KeyboardScope) => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  detachNodeConnections: (id: string) => void;
  getDeletedNodeIds: () => string[];
  getDeletedEdgeIds: () => string[];
  clearDeletedIds: (nodeIds: string[], edgeIds: string[]) => void;
  saveTrigger: number;
  triggerSave: () => void;
  brandId?: string;
  setBrandId: (id: string) => void;
  activeRoomId?: string;
  setActiveRoomId: (id: string | undefined) => void;

  history: {
    past: Array<{ nodes: StudioNode[]; edges: Edge[] }>;
    future: Array<{ nodes: StudioNode[]; edges: Edge[] }>;
  };
  takeSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  resetForRoomSwitch: () => void;
  resetForBrandSwitch: (nextBrandId?: string) => void;

  // Clipboard — canvas-level copy/cut/paste for selected nodes and the edges
  // wholly inside that selection, so a pasted group keeps its wiring.
  clipboard: StudioNode[];
  clipboardEdges: Edge[];
  copySelectedNodes: () => void;
  cutSelectedNodes: () => void;
  pasteNodes: () => void;
}

const normalizeFrameConnection = (connection: Connection, nodes: StudioNode[]): Connection => {
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);

  if (!sourceNode || !targetNode) return connection;

  const sourceHandle = connection.sourceHandle ?? '';
  const targetHandle = connection.targetHandle ?? '';
  const isFrameHandle = ['first-frame', 'last-frame', 'ref-image', 'ref-images'].includes(
    sourceHandle,
  );
  const isImageSource =
    targetHandle === 'image' && (targetNode.type === 'image' || targetNode.type === 'nanoGen');

  if (isVideoGeneratorNodeType(sourceNode.type) && isFrameHandle && isImageSource) {
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

const getEdgeStyle = (sourceHandle: string | null) => {
  const dataType = resolveEdgeDataType(sourceHandle);

  return {
    ['--edge-color' as keyof CSSProperties]: `var(--edge-${dataType})`,
  };
};

// Legacy target-handle names that existed before the canonical handle vocabulary
// was locked in @continuum/contracts. Remapped on load so stored workflows
// survive across schema updates. Keys are the old handle name; values are
// functions that return the canonical handle for a given node type, or null
// when the handle genuinely has no mapping (edge should be dropped).
const remapLegacyTargetHandle = (handle: string, targetNode: StudioNode): string | null => {
  const targetNodeType = targetNode.type;

  // 'text' was used as a target handle before the string-node vocabulary was
  // locked. The canonical vocabulary is: nanoGen uses 'prompt', video generators
  // use 'prompt-in'. There is no 'text' target on any current node type.
  if (handle === 'text') {
    if (targetNodeType === 'nanoGen') return 'prompt';
    if (isVideoGeneratorNodeType(targetNodeType)) return 'prompt-in';
    // extendVideo and string nodes don't accept 'text' as an input — drop.
    return null;
  }

  // 'prompt' was used for video-generator prompt before 'prompt-in' was
  // introduced as the canonical name.
  if (handle === 'prompt' && isVideoGeneratorNodeType(targetNodeType)) {
    return 'prompt-in';
  }

  // Single 'ref-image' was used before video generators standardised on
  // 'ref-images' (plural). Remap to whichever id THIS node actually renders, not to
  // the plural unconditionally: pixverse-v6 allows only the singular, so the blanket
  // rewrite pushed its edges outside their own allowed set and dropped every one.
  if (handle === 'ref-image' && isVideoGeneratorNodeType(targetNodeType)) {
    return (
      getVideoGeneratorImageReferenceHandle(
        resolveVideoGeneratorModel(targetNode),
        resolveVideoGeneratorReferenceMode(targetNode),
      ) ?? handle
    );
  }

  // 'frame-N' came from a per-slot frame strip that no longer exists. The payload
  // builder used to prefer frame-0 as the first frame and the HIGHEST frame-N as the
  // last, so that preference order is reproduced here rather than left to chance.
  if (/^frame-\d+$/.test(handle) && isVideoGeneratorNodeType(targetNodeType)) {
    return handle === 'frame-0' ? 'first-frame' : 'last-frame';
  }

  // 'input' was an early alias for the string node's image slot.
  if (handle === 'input' && targetNodeType === 'string') return 'image';

  return handle;
};

// Edges with BOTH endpoints inside the selection. A dangling edge (one endpoint
// left behind on the canvas) has no counterpart to remap onto, so it is not
// carried — pasting it would either re-wire the original or drop silently.
const edgesWithinSelection = (edges: Edge[], selectedIds: Set<string>): Edge[] =>
  edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target));

const normalizeEdges = (edges: Edge[], nodes: StudioNode[]): Edge[] => {
  if (!nodes || !Array.isArray(nodes)) return edges || [];
  if (!edges || !Array.isArray(edges)) return [];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const normalizedCandidates = edges.flatMap((edge) => {
    const targetNode = nodeById.get(edge.target);
    if (!targetNode || !edge.targetHandle) return edge;

    const remapped = remapLegacyTargetHandle(edge.targetHandle, targetNode);
    if (remapped === null) {
      console.warn(
        `[normalizeEdges] dropping edge ${edge.id}: target handle '${edge.targetHandle}' has no canonical mapping for node type '${targetNode.type}'`,
      );
      return [];
    }
    const targetHandle = remapped;

    const allowedTargets = getAllowedTargetHandles(targetNode);
    // clip-<slotId> handles are genuinely dynamic (one per timeline clip slot) and
    // migrateSplicer still reads them, so they cannot be enumerated. 'frame-N' used
    // to ride this escape hatch too; it is now remapped above to the contract
    // vocabulary, so it must face the allowed set like every other handle.
    const isDynamicHandle = targetHandle.startsWith('clip-');
    const isValidTarget = allowedTargets.includes(targetHandle) || isDynamicHandle;

    if (!isValidTarget) {
      console.warn(
        `[normalizeEdges] dropping edge ${edge.id}: target handle '${targetHandle}' is not in the allowed set [${allowedTargets.join(', ')}] for node type '${targetNode.type}'`,
      );
      return [];
    }

    const sourceNode = nodeById.get(edge.source);
    if (edge.sourceHandle && sourceNode) {
      const allowedSources = getAllowedSourceHandles(sourceNode);
      if (allowedSources.length > 0 && !allowedSources.includes(edge.sourceHandle)) {
        console.warn(
          `[normalizeEdges] dropping edge ${edge.id}: source handle '${edge.sourceHandle}' is not in the allowed set [${allowedSources.join(', ')}] for node type '${sourceNode.type}'`,
        );
        return [];
      }
    }

    if (targetHandle === edge.targetHandle) return edge;

    return {
      ...edge,
      targetHandle,
    };
  });

  const nextEdges: Edge[] = [];

  for (const edge of normalizedCandidates) {
    if (!edge.targetHandle) {
      nextEdges.push(edge);
      continue;
    }

    const targetNode = nodeById.get(edge.target);
    if (!targetNode) continue;

    const limit = getTargetHandleConnectionLimit(targetNode, edge.targetHandle, nextEdges);
    if (limit === undefined) {
      nextEdges.push(edge);
      continue;
    }

    if (limit <= 0) {
      continue;
    }

    const existingForHandle = nextEdges.filter(
      (candidate) =>
        candidate.target === edge.target && candidate.targetHandle === edge.targetHandle,
    ).length;

    const shouldCountAsImageReference =
      edge.targetHandle === 'ref-image' || edge.targetHandle === 'ref-images';

    if (shouldCountAsImageReference) {
      const imageReferenceCount = nextEdges.filter(
        (candidate) =>
          candidate.target === edge.target &&
          (candidate.targetHandle === 'ref-image' || candidate.targetHandle === 'ref-images'),
      ).length;
      if (imageReferenceCount >= limit) {
        continue;
      }
      nextEdges.push(edge);
      continue;
    }

    if (existingForHandle >= limit) {
      continue;
    }

    nextEdges.push(edge);
  }

  return nextEdges;
};

export const useStudioStore = create<StudioState>((set, get) => ({
  nodes: [],
  edges: [],
  defaultEdgeType: FIXED_EDGE_TYPE,
  interactionMode: 'pan',
  keyboardScope: 'canvas',
  deletedNodeIds: [],
  deletedEdgeIds: [],
  saveTrigger: 0,
  brandId: undefined,
  activeRoomId: undefined,
  clipboard: [],
  clipboardEdges: [],

  setBrandId: (id: string) => set({ brandId: id }),
  setActiveRoomId: (id: string | undefined) => set({ activeRoomId: id }),

  onNodesChange: (changes: NodeChange<StudioNode>[]) => {
    const deletedNodes = changes
      .filter((c) => c.type === 'remove')
      .map((c) => (c as { id: string }).id);

    set((state) => {
      const newNodes = applyNodeChanges(changes, state.nodes);

      const positionChanges = changes.filter((c) => c.type === 'position');
      const isDragging = positionChanges.some((c) => 'dragging' in c && c.dragging === true);
      const multipleMoving = positionChanges.length > 1;
      const hasDragEnd = positionChanges.some((c) => 'dragging' in c && c.dragging === false);

      if (isDragging || multipleMoving || !hasDragEnd) {
        return {
          nodes: newNodes,
          deletedNodeIds:
            deletedNodes.length > 0
              ? [...state.deletedNodeIds, ...deletedNodes]
              : state.deletedNodeIds,
          saveTrigger: deletedNodes.length > 0 ? state.saveTrigger + 1 : state.saveTrigger,
        };
      }

      const hasDimensions = newNodes.some((n) => n.measured?.width || n.width);

      return {
        nodes: hasDimensions ? resolveCollisions(newNodes) : newNodes,
        deletedNodeIds:
          deletedNodes.length > 0
            ? [...state.deletedNodeIds, ...deletedNodes]
            : state.deletedNodeIds,
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

    const validation = validateConnection(normalized, get().edges, get().nodes);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    const edgeType = get().defaultEdgeType;
    const style = getEdgeStyle(normalized.sourceHandle);

    const newEdge = {
      ...normalized,
      id: `e-${normalized.source}-${normalized.target}-${Date.now()}`,
      type: 'dataType',
      className: 'studio-edge studio-edge--connected',
      style,
      data: {
        dataType: resolveEdgeDataType(normalized.sourceHandle),
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
      const nodeIndex = state.nodes.findIndex((n) => n.id === id);
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

  updateNode: (id: string, updater: (node: StudioNode) => StudioNode) => {
    set((state) => {
      const nodeIndex = state.nodes.findIndex((node) => node.id === id);
      if (nodeIndex === -1) return state;

      const nextNodes = [...state.nodes];
      nextNodes[nodeIndex] = updater(state.nodes[nodeIndex]);
      return { nodes: nextNodes };
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

  // No-op: defaultEdgeType is fixed to 'bezier'. Kept for consumer compatibility
  // (WorkflowLibrary, LoadWorkflowDialog, useCanvasRealtime, workflowSerialization).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setDefaultEdgeType: (_type: EdgeType) => {},

  setInteractionMode: (mode: InteractionMode) => {
    set({ interactionMode: mode });
  },

  setKeyboardScope: (scope: KeyboardScope) => {
    set({ keyboardScope: scope });
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
      saveTrigger: state.saveTrigger + 1,
    });
  },

  deleteNode: (id: string) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      deletedNodeIds: [...state.deletedNodeIds, id],
      deletedEdgeIds: [
        ...state.deletedEdgeIds,
        ...state.edges.filter((e) => e.source === id || e.target === id).map((e) => e.id),
      ],
      saveTrigger: state.saveTrigger + 1,
    }));
  },

  detachNodeConnections: (id: string) => {
    const connectedEdges = get().getConnectedEdges(id);
    if (connectedEdges.length === 0) return;
    get().takeSnapshot();
    const connectedEdgeIds = new Set(connectedEdges.map((e) => e.id));
    set((state) => ({
      edges: state.edges.filter((e) => !connectedEdgeIds.has(e.id)),
      deletedEdgeIds: [...state.deletedEdgeIds, ...connectedEdgeIds],
      saveTrigger: state.saveTrigger + 1,
    }));
  },

  history: {
    past: [],
    future: [],
  },

  takeSnapshot: () => {
    set((state) => {
      const newPast = [...state.history.past, { nodes: state.nodes, edges: state.edges }].slice(
        -50,
      );

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
      const previousNodeIds = new Set(previous.nodes.map((node) => node.id));
      const previousEdgeIds = new Set(previous.edges.map((edge) => edge.id));

      return {
        nodes: previous.nodes,
        edges: previous.edges,
        deletedNodeIds: [
          ...state.deletedNodeIds.filter((id) => !previousNodeIds.has(id)),
          ...state.nodes.filter((node) => !previousNodeIds.has(node.id)).map((node) => node.id),
        ],
        deletedEdgeIds: [
          ...state.deletedEdgeIds.filter((id) => !previousEdgeIds.has(id)),
          ...state.edges.filter((edge) => !previousEdgeIds.has(edge.id)).map((edge) => edge.id),
        ],
        saveTrigger: state.saveTrigger + 1,
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
      const nextNodeIds = new Set(next.nodes.map((node) => node.id));
      const nextEdgeIds = new Set(next.edges.map((edge) => edge.id));

      return {
        nodes: next.nodes,
        edges: next.edges,
        deletedNodeIds: [
          ...state.deletedNodeIds.filter((id) => !nextNodeIds.has(id)),
          ...state.nodes.filter((node) => !nextNodeIds.has(node.id)).map((node) => node.id),
        ],
        deletedEdgeIds: [
          ...state.deletedEdgeIds.filter((id) => !nextEdgeIds.has(id)),
          ...state.edges.filter((edge) => !nextEdgeIds.has(edge.id)).map((edge) => edge.id),
        ],
        saveTrigger: state.saveTrigger + 1,
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

  clearDeletedIds: (nodeIds: string[], edgeIds: string[]) => {
    set((state) => ({
      deletedNodeIds: state.deletedNodeIds.filter((id) => !nodeIds.includes(id)),
      deletedEdgeIds: state.deletedEdgeIds.filter((id) => !edgeIds.includes(id)),
    }));
  },

  triggerSave: () => {
    set((state) => ({ saveTrigger: state.saveTrigger + 1 }));
  },

  copySelectedNodes: () => {
    const { nodes, edges } = get();
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    set({
      clipboard: selected,
      clipboardEdges: edgesWithinSelection(edges, new Set(selected.map((n) => n.id))),
    });
  },

  cutSelectedNodes: () => {
    const { nodes, edges } = get();
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const selectedIds = new Set(selected.map((n) => n.id));

    get().takeSnapshot();
    set((state) => ({
      clipboard: selected,
      clipboardEdges: edgesWithinSelection(edges, selectedIds),
      nodes: state.nodes.filter((n) => !n.selected),
      edges: state.edges.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)),
      deletedNodeIds: [...state.deletedNodeIds, ...selected.map((n) => n.id)],
      deletedEdgeIds: [
        ...state.deletedEdgeIds,
        ...edges
          .filter((e) => selectedIds.has(e.source) || selectedIds.has(e.target))
          .map((e) => e.id),
      ],
      saveTrigger: state.saveTrigger + 1,
    }));
  },

  pasteNodes: () => {
    const { clipboard, clipboardEdges } = get();
    if (clipboard.length === 0) return;

    get().takeSnapshot();
    const now = Date.now();
    const pastedIdByOriginalId = new Map<string, string>();
    const pasted = clipboard.map((node, index) => {
      const id = `${node.type ?? 'node'}-paste-${now}-${index}`;
      pastedIdByOriginalId.set(node.id, id);
      return {
        ...node,
        id,
        position: {
          x: node.position.x + 20,
          y: node.position.y + 20,
        },
        data: { ...node.data },
        selected: true,
      };
    });

    // Handles are carried verbatim: a copy of a 4-up feeding `image-2` must paste
    // as a copy feeding `image-2`, not collapse onto variation 0.
    const pastedEdges = clipboardEdges.flatMap((edge, index) => {
      const source = pastedIdByOriginalId.get(edge.source);
      const target = pastedIdByOriginalId.get(edge.target);
      if (!source || !target) return [];
      return [{ ...edge, id: `e-paste-${now}-${index}`, source, target, selected: false }];
    });

    set((state) => ({
      nodes: state.nodes.map((n) => ({ ...n, selected: false })).concat(pasted),
      saveTrigger: state.saveTrigger + 1,
    }));

    // Through setEdges so normalizeEdges still validates handles and enforces the
    // per-handle connection limits against the newly pasted nodes.
    if (pastedEdges.length > 0) {
      get().setEdges([...get().edges, ...pastedEdges]);
    }
  },

  // Carries the brand FORWARD. The mounted canvas re-reads its brand from a prop effect
  // that only fires when the prop changes, so a switch that cleared this left every
  // generation running brand-less until a full page reload.
  resetForBrandSwitch: (nextBrandId?: string) =>
    set({
      nodes: [],
      edges: [],
      deletedNodeIds: [],
      deletedEdgeIds: [],
      saveTrigger: 0,
      brandId: nextBrandId,
      activeRoomId: undefined,
      clipboard: [],
      clipboardEdges: [],
      history: { past: [], future: [] },
    }),

  resetForRoomSwitch: () =>
    set({
      nodes: [],
      edges: [],
      deletedNodeIds: [],
      deletedEdgeIds: [],
      clipboard: [],
      clipboardEdges: [],
      history: { past: [], future: [] },
    }),
}));

if (typeof window !== 'undefined') {
  registerBrandScopedStore({
    name: 'studio-canvas',
    reset: (event) =>
      useStudioStore.getState().resetForBrandSwitch(event?.nextBrandId ?? undefined),
  });
}
