import type { Edge } from '@xyflow/react';

import type { StudioNode } from '../types';

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
