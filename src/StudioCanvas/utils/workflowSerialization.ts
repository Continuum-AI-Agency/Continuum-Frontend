import type { Edge } from '@xyflow/react';
import type { EdgeType } from '../stores/useStudioStore';
import type { StudioNode, StudioNodeData } from '../types';

export type WorkflowSnapshot = {
  nodes: StudioNode[];
  edges: Edge[];
};

// 'persist' (default): strip base64 AND expiring signed URLs (re-signed on load
// from the durable storage path/bucket). 'broadcast': strip base64 only and keep
// signed URLs so workspace peers display media instantly without a re-sign call.
export type SerializeMode = 'persist' | 'broadcast';

export type SerializeWorkflowSnapshotOptions = { mode?: SerializeMode };

const runtimeNodeKeys = [
  'isExecuting',
  'isComplete',
  'error',
  'errorCode',
  'executionTime',
  'isToolbarVisible',
] as const;

const dataUrlPattern = /^data:([a-z]+\/[a-z0-9-+.]+)(;[a-z0-9=[\]!#$%&'*+.^_`{|}~-]+)*;base64,/i;
const base64LikePattern = /^[a-z0-9+/=]+$/i;
const hexDigestPattern = /^[0-9a-f]+$/i;
const minBase64Length = 32;

function isEncodedPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (dataUrlPattern.test(trimmed)) return true;
  // A hex digest (the apiRender sha256 contractHash, an md5, a dash-less UUID) draws on
  // 16 of the 64 base64 symbols, so the length+charset test below used to claim it and
  // the node reloaded without the field it gates on. Base64 of real binary uses the whole
  // alphabet; an actual payload landing all-hex is 4^-n, nil past the length floor.
  // ponytail: charset heuristic, not a decoder — swap in a real base64 validator if a
  // non-hex identifier ever gets eaten too.
  if (hexDigestPattern.test(trimmed)) return false;
  if (trimmed.length < minBase64Length) return false;
  return base64LikePattern.test(trimmed);
}

function stripEncodedString(
  value: unknown,
  path: string,
  droppedPaths: string[],
): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (isEncodedPayload(value)) {
    droppedPaths.push(`${path} (${value.length}b)`);
    return undefined;
  }
  return value;
}

function deepStripEncoded(value: unknown, path: string, droppedPaths: string[]): unknown {
  if (typeof value === 'string') {
    if (isEncodedPayload(value)) {
      droppedPaths.push(`${path} (${value.length}b)`);
      return undefined;
    }
    return value;
  }

  if (Array.isArray(value)) {
    const next: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = deepStripEncoded(value[i], `${path}[${i}]`, droppedPaths);
      if (item !== undefined) next.push(item);
    }
    return next;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      const stripped = deepStripEncoded(record[key], `${path}.${key}`, droppedPaths);
      if (stripped !== undefined) next[key] = stripped;
    }
    return next;
  }

  return value;
}

const expiringOutputKeys = [
  'generatedImage',
  'generatedImageUrl',
  'generatedVideo',
  'generatedVideoUrl',
] as const;

function stripRuntimeNodeData(
  data: StudioNodeData,
  options: SerializeWorkflowSnapshotOptions = {},
): StudioNodeData {
  const mode: SerializeMode = options.mode ?? 'persist';
  const next = { ...data } as Record<string, unknown>;
  const droppedPaths: string[] = [];

  runtimeNodeKeys.forEach((key) => {
    delete next[key];
  });

  // Persist: strip generated output blobs and expiring signed URLs — durable
  // storage paths (generated*StoragePath/Bucket) are kept for re-sign on load.
  // Broadcast: keep the signed URLs so peers display media without re-signing
  // (base64 is still dropped below by the generic encoded-payload strip).
  if (mode === 'persist') {
    expiringOutputKeys.forEach((key) => {
      delete next[key];
    });

    // Same rule per variation: the preview and signed URL expire, the storage
    // coordinates and asset ids do not. Dropping the array outright would lose
    // the variation COUNT too, and the node would reload as a single image with
    // its image-N edges pointing at handles it no longer draws.
    if (Array.isArray(next.generatedImages)) {
      next.generatedImages = next.generatedImages.map((variation) => {
        if (!variation || typeof variation !== 'object') return variation;
        const { preview, url, ...durable } = variation as Record<string, unknown>;
        return durable;
      });
    }

    // An omni variation is inserted optimistically as `pending` and patched when
    // the turn lands. Persisting one means a tab closed mid-turn reloads into a
    // tile that spins forever with nothing left to resolve it — the turn it was
    // waiting on died with the page.
    if (Array.isArray(next.variations)) {
      next.variations = next.variations.filter(
        (variation) =>
          !variation ||
          typeof variation !== 'object' ||
          (variation as Record<string, unknown>).status !== 'pending',
      );
    }
  }

  if (Array.isArray(next.inputs)) {
    next.inputs = next.inputs
      .map((input, index) => {
        if (!input || typeof input !== 'object') return null;
        const record = input as Record<string, unknown>;
        const sanitizedSrc = stripEncodedString(record.src, `inputs[${index}].src`, droppedPaths);
        if (sanitizedSrc === undefined && typeof record.src === 'string') return null;
        return { ...record, src: sanitizedSrc ?? record.src };
      })
      .filter((input): input is NonNullable<typeof input> => input !== null);
  }

  if (Array.isArray(next.frameList)) {
    next.frameList = next.frameList
      .map((frame, index) => {
        if (!frame || typeof frame !== 'object') return null;
        const record = frame as Record<string, unknown>;
        const sanitizedSrc = stripEncodedString(
          record.src,
          `frameList[${index}].src`,
          droppedPaths,
        );
        const nextFrame: Record<string, unknown> = { ...record };
        if (sanitizedSrc === undefined && typeof record.src === 'string') {
          delete nextFrame.src;
        } else if (sanitizedSrc !== undefined) {
          nextFrame.src = sanitizedSrc;
        }
        return nextFrame;
      })
      .filter((frame): frame is NonNullable<typeof frame> => frame !== null);
  }

  if (Array.isArray(next.documents)) {
    next.documents = next.documents
      .map((doc, index) => {
        if (!doc || typeof doc !== 'object') return null;
        const record = doc as Record<string, unknown>;
        const sanitizedContent = stripEncodedString(
          record.content,
          `documents[${index}].content`,
          droppedPaths,
        );
        return {
          ...record,
          content: sanitizedContent ?? (typeof record.content === 'string' ? '' : ''),
        };
      })
      .filter((doc): doc is NonNullable<typeof doc> => doc !== null);
  }

  for (const key of Object.keys(next)) {
    if (key === 'inputs' || key === 'frameList' || key === 'documents') continue;
    const value = next[key];
    if (typeof value === 'string') {
      if (isEncodedPayload(value)) {
        droppedPaths.push(`${key} (${value.length}b)`);
        delete next[key];
      }
    } else if (value && typeof value === 'object') {
      next[key] = deepStripEncoded(value, key, droppedPaths);
    }
  }

  if (droppedPaths.length > 0) {
    console.warn('[studio] dropped base64 fields from save payload', {
      count: droppedPaths.length,
      paths: droppedPaths.slice(0, 10),
    });
  }

  return next as StudioNodeData;
}

function sanitizeNode(
  node: StudioNode,
  options: SerializeWorkflowSnapshotOptions = {},
): StudioNode {
  const width = node.width ?? node.measured?.width;
  const height = node.height ?? node.measured?.height;

  return {
    id: node.id,
    type: node.type,
    position: node.position,
    style: node.style,
    width,
    height,
    data: stripRuntimeNodeData(node.data, options),
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
  const rawData =
    edge.data && typeof edge.data === 'object' ? (edge.data as Record<string, unknown>) : {};
  const dataType =
    typeof rawData.dataType === 'string' ? rawData.dataType : inferDataType(edge.sourceHandle);
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
  defaultEdgeType: EdgeType,
  options: SerializeWorkflowSnapshotOptions = {},
): WorkflowSnapshot {
  const nodes = snapshot.nodes.map((node) => sanitizeNode(node, options));
  const nodeIds = new Set(nodes.map((node) => node.id));

  const edges = snapshot.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => sanitizeEdge(edge, defaultEdgeType));

  return { nodes, edges };
}

// Persist variant (default): safe to store in canvas_sessions — base64 and
// expiring signed URLs removed, durable paths kept (re-signed on load).
export function serializeWorkflowSnapshot(
  nodes: StudioNode[],
  edges: Edge[],
  defaultEdgeType: EdgeType,
): WorkflowSnapshot {
  return normalizeWorkflowSnapshot({ nodes, edges }, defaultEdgeType, { mode: 'persist' });
}

// Broadcast variant: base64 dropped (avoids WS 1009) but signed URLs kept so
// other workspace members render media immediately.
export function serializeForBroadcast(
  nodes: StudioNode[],
  edges: Edge[],
  defaultEdgeType: EdgeType,
): WorkflowSnapshot {
  return normalizeWorkflowSnapshot({ nodes, edges }, defaultEdgeType, { mode: 'broadcast' });
}
