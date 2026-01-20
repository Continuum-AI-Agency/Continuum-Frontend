import type { Edge } from '@xyflow/react';
import type { StudioNode, StudioNodeData } from '../types';
import type { EdgeType } from '../stores/useStudioStore';

export type WorkflowSnapshot = {
  nodes: StudioNode[];
  edges: Edge[];
};

const runtimeNodeKeys = [
  'isExecuting',
  'isComplete',
  'error',
  'executionTime',
  'isToolbarVisible',
  'generatedImage',
  'generatedVideo',
] as const;

function stripRuntimeNodeData(data: StudioNodeData): StudioNodeData {
  const next = { ...data } as Record<string, unknown>;
  runtimeNodeKeys.forEach((key) => {
    delete next[key];
  });
  return next as StudioNodeData;
}

function sanitizeNode(node: StudioNode): StudioNode {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    width: node.width,
    height: node.height,
    data: stripRuntimeNodeData(node.data),
  };
}

function inferDataType(handleId?: string | null): string {
  if (!handleId) return 'text';
  if (handleId.includes('image')) return 'image';
  if (handleId.includes('video')) return 'video';
  if (handleId.includes('audio')) return 'audio';
  if (handleId.includes('document')) return 'document';
  return 'text';
}

function sanitizeEdge(edge: Edge, defaultEdgeType: EdgeType): Edge {
  const rawData = edge.data && typeof edge.data === 'object' ? (edge.data as Record<string, unknown>) : {};
  const dataType = typeof rawData.dataType === 'string' ? rawData.dataType : inferDataType(edge.sourceHandle);
  const pathType = typeof rawData.pathType === 'string' ? rawData.pathType : defaultEdgeType;

  return {
    id: edge.id ?? `${edge.source}-${edge.target}-${Date.now()}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    type: edge.type ?? 'dataType',
    className: edge.className ?? 'studio-edge',
    data: {
      ...rawData,
      dataType,
      pathType,
    },
    label: edge.label,
    markerEnd: edge.markerEnd,
    markerStart: edge.markerStart,
  };
}

export function normalizeWorkflowSnapshot(
  snapshot: WorkflowSnapshot,
  defaultEdgeType: EdgeType
): WorkflowSnapshot {
  const nodes = snapshot.nodes.map(sanitizeNode);
  const nodeIds = new Set(nodes.map((node) => node.id));

  const edges = snapshot.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => sanitizeEdge(edge, defaultEdgeType));

  return { nodes, edges };
}

export function serializeWorkflowSnapshot(
  nodes: StudioNode[],
  edges: Edge[],
  defaultEdgeType: EdgeType
): WorkflowSnapshot {
  return normalizeWorkflowSnapshot({ nodes, edges }, defaultEdgeType);
}
