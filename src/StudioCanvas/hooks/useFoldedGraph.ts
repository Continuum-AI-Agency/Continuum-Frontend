'use client';

// The seam between the store's real graph and what React Flow is shown.
//
// This hook exists to keep the canvas shell's diff at four lines. Everything it does
// is derivation: `useStudioStore.nodes` / `.edges` are never written by folding, so the
// executor, the autosave, the realtime merge and the validation panel all keep reading
// the same arrays whether a module is folded or not.
//
// When nothing is collapsed it returns its inputs BY REFERENCE and the shell's own
// handlers unwrapped, so a canvas with no folded module pays nothing at all.

import type {
  Connection,
  Edge,
  IsValidConnection,
  Node,
  OnConnect,
  OnNodesChange,
} from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import { nodeTypes } from '../components/canvasNodeTypes';
import { FOLD_NODE_TYPES } from '../nodes/TechniqueNode';
import { useModuleFoldStore } from '../stores/useModuleFoldStore';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import {
  deriveModulesFromNodes,
  foldCollapsedModules,
  resolveFoldedConnection,
  translateFoldedNodeChanges,
} from '../utils/moduleFold';

interface CanvasHandlers {
  onNodesChange: OnNodesChange<StudioNode>;
  onConnect: OnConnect;
  isValidConnection: IsValidConnection<Edge>;
}

/**
 * The canonical map plus the view-only collapsed card. Module scope so React Flow sees
 * a stable identity; `canvasNodeTypes` stays untouched because `techniqueCollapsed` is
 * not a `StudioNodeType` and its drift guard is right to refuse one.
 */
export const CANVAS_NODE_TYPES_WITH_FOLD = { ...nodeTypes, ...FOLD_NODE_TYPES };

export function useFoldedGraph(
  nodes: StudioNode[],
  edges: Edge[],
  handlers: CanvasHandlers,
): { nodes: Node[]; edges: Edge[] } & CanvasHandlers {
  const { onNodesChange, onConnect, isValidConnection } = handlers;
  const collapsedModuleIds = useModuleFoldStore((state) => state.collapsedModuleIds);
  const known = useModuleFoldStore((state) => state.modules);

  const collapsed = useMemo(
    () =>
      collapsedModuleIds.length === 0
        ? []
        : deriveModulesFromNodes(nodes, known).filter((record) =>
            collapsedModuleIds.includes(record.id),
          ),
    [collapsedModuleIds, known, nodes],
  );

  const folded = useMemo(
    () => foldCollapsedModules(nodes, edges, collapsed),
    [collapsed, edges, nodes],
  );

  const handleNodesChange = useCallback<OnNodesChange<StudioNode>>(
    (changes) => {
      const translated = translateFoldedNodeChanges(
        changes,
        useStudioStore.getState().nodes,
        collapsed,
      );
      // Drag/select/delete of the card fan out to its members through the store's own
      // public action, so undo, autosave and the realtime broadcast see an ordinary edit.
      if (translated.nodes) useStudioStore.getState().setNodes(translated.nodes);
      if (translated.changes.length > 0) onNodesChange(translated.changes);
    },
    [collapsed, onNodesChange],
  );

  // A port stub you cannot drag a wire into is decoration. React Flow would otherwise
  // hand the shell a connection naming the card's id, which the real node list has never
  // heard of, and the wire would die on drop without a word.
  const resolveConnection = useCallback(
    <T extends Connection | Edge>(connection: T): T => {
      const state = useStudioStore.getState();
      return resolveFoldedConnection(connection, state.nodes, state.edges, collapsed);
    },
    [collapsed],
  );

  const handleConnect = useCallback<OnConnect>(
    (connection) => onConnect(resolveConnection(connection)),
    [onConnect, resolveConnection],
  );

  const handleIsValidConnection = useCallback<IsValidConnection<Edge>>(
    (connection) => isValidConnection(resolveConnection(connection)),
    [isValidConnection, resolveConnection],
  );

  const folding = collapsed.length > 0;
  return {
    nodes: folded.nodes,
    edges: folded.edges,
    onNodesChange: folding ? handleNodesChange : onNodesChange,
    onConnect: folding ? handleConnect : onConnect,
    isValidConnection: folding ? handleIsValidConnection : isValidConnection,
  };
}
