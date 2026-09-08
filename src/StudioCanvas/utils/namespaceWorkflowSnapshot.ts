import type { Edge } from '@xyflow/react';

import type { StudioNode } from '../types';

/**
 * Node data that points BACK at another node by id.
 *
 * Rewriting `node.id` and the edges is not enough: a Layer Editor's `layers[].sourceNodeId`
 * and a Timeline's `items[].sourceNodeId` are node ids stored INSIDE data. Left alone they
 * keep pointing at the pre-prefix ids, so a re-applied Technique or a duplicated node
 * resolves no pixels — layers that are correctly named and correctly placed, and
 * completely invisible, with Compose emitting a blank PNG.
 *
 * Keyed by the array field so a new carrier is one line, not a new traversal.
 */
const NODE_ID_BEARING_LISTS = ['layers', 'items'] as const;

export function remapNodeIdsInData(
  data: StudioNode['data'],
  idMap: ReadonlyMap<string, string>,
): StudioNode['data'] {
  const record = data as unknown as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;

  for (const field of NODE_ID_BEARING_LISTS) {
    const list = record[field];
    if (!Array.isArray(list)) continue;
    const remapped = list.map((entry) => {
      if (typeof entry !== 'object' || entry === null) return entry;
      const source = (entry as { sourceNodeId?: unknown }).sourceNodeId;
      if (typeof source !== 'string') return entry;
      const mapped = idMap.get(source);
      return mapped ? { ...entry, sourceNodeId: mapped } : entry;
    });
    next ??= { ...record };
    next[field] = remapped;
  }

  return (next ?? record) as unknown as StudioNode['data'];
}

export function namespaceWorkflowSnapshot(
  snapshot: { nodes: StudioNode[]; edges: Edge[] },
  namespace: string,
): { nodes: StudioNode[]; edges: Edge[]; idMap: Map<string, string> } {
  const prefix = namespace.endsWith(':') ? namespace : `${namespace}:`;
  const idMap = new Map(snapshot.nodes.map((node) => [node.id, `${prefix}${node.id}`]));
  return {
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) ?? node.id,
      data: remapNodeIdsInData(node.data, idMap),
      selected: false,
    })),
    edges: snapshot.edges.map((edge) => ({
      ...edge,
      id: `${prefix}${edge.id}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
    })),
    idMap,
  };
}
