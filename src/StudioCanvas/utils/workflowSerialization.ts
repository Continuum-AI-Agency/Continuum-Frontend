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

const dataUrlPattern = /^data:[^;]+;base64,/i;
const base64LikePattern = /^[a-z0-9+/=]+$/i;
const minBase64Length = 256;

function isEncodedPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (dataUrlPattern.test(trimmed)) return true;
  if (trimmed.length < minBase64Length) return false;
  return base64LikePattern.test(trimmed);
}

function stripEncodedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return isEncodedPayload(value) ? undefined : value;
}

function stripRuntimeNodeData(data: StudioNodeData): StudioNodeData {
  const next = { ...data } as Record<string, unknown>;
  runtimeNodeKeys.forEach((key) => {
    delete next[key];
  });
  const image = stripEncodedString(next.image);
  if (image === undefined && typeof next.image === 'string') delete next.image;
  const video = stripEncodedString(next.video);
  if (video === undefined && typeof next.video === 'string') delete next.video;
  const audio = stripEncodedString(next.audio);
  if (audio === undefined && typeof next.audio === 'string') delete next.audio;
  if (Array.isArray(next.inputs)) {
    const sanitizedInputs = next.inputs
      .map((input) => {
        if (!input || typeof input !== 'object') return null;
        const record = input as Record<string, unknown>;
        const sanitizedSrc = stripEncodedString(record.src);
        if (sanitizedSrc === undefined && typeof record.src === 'string') return null;
        return { ...record, src: sanitizedSrc ?? record.src };
      })
      .filter((input): input is Record<string, unknown> => Boolean(input));
    next.inputs = sanitizedInputs;
  }
  if (Array.isArray(next.frameList)) {
    const sanitizedFrames = next.frameList
      .map((frame) => {
        if (!frame || typeof frame !== 'object') return null;
        const record = frame as Record<string, unknown>;
        const sanitizedSrc = stripEncodedString(record.src);
        const nextFrame: Record<string, unknown> = { ...record };
        if (sanitizedSrc === undefined && typeof record.src === 'string') {
          delete nextFrame.src;
        } else if (sanitizedSrc !== undefined) {
          nextFrame.src = sanitizedSrc;
        }
        return nextFrame;
      })
      .filter((frame): frame is Record<string, unknown> => Boolean(frame));
    next.frameList = sanitizedFrames;
  }
  if (Array.isArray(next.documents)) {
    const sanitizedDocuments = next.documents
      .map((doc) => {
        if (!doc || typeof doc !== 'object') return null;
        const record = doc as Record<string, unknown>;
        const sanitizedContent = stripEncodedString(record.content);
        return {
          ...record,
          content: sanitizedContent ?? (typeof record.content === 'string' ? '' : ''),
        };
      })
      .filter((doc): doc is Record<string, unknown> => Boolean(doc));
    next.documents = sanitizedDocuments;
  }
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
