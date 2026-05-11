import { Connection, Edge } from '@xyflow/react';
import { StudioNode } from '../types';
import { canAcceptSingleTextInput, hasExistingTargetConnection } from './connectionValidation';
import {
  getVideoGeneratorImageLimit,
  getVideoGeneratorTargetHandles,
  isVideoGeneratorNodeType,
  resolveVideoGeneratorModel,
  VIDEO_FRAME_HANDLES,
  VIDEO_IMAGE_REFERENCE_HANDLES,
  VIDEO_REFERENCE_VIDEO_HANDLE,
} from './videoModel';

const IMAGE_REFERENCE_HANDLE_SET = new Set<string>(VIDEO_IMAGE_REFERENCE_HANDLES);
const FRAME_HANDLE_SET = new Set<string>(VIDEO_FRAME_HANDLES);

const isVideoGeneratorNode = (node: StudioNode): boolean => isVideoGeneratorNodeType(node.type);

const isImageReferenceHandle = (handleId?: string | null): boolean =>
  typeof handleId === 'string' && IMAGE_REFERENCE_HANDLE_SET.has(handleId);

const isFrameHandle = (handleId?: string | null): boolean =>
  typeof handleId === 'string' && FRAME_HANDLE_SET.has(handleId);

const getEdgeCountForTargetHandles = (
  edges: Edge[],
  targetId: string,
  targetHandles: readonly string[]
): number =>
  edges.filter((edge) => edge.target === targetId && targetHandles.includes(edge.targetHandle ?? '')).length;

const getEdgeCountForTargetHandle = (
  edges: Edge[],
  targetId: string,
  targetHandle: string
): number =>
  edges.filter((edge) => edge.target === targetId && edge.targetHandle === targetHandle).length;

const getCountedHandles = (node: StudioNode, targetHandle: string): readonly string[] => {
  if (node.type === 'nanoGen' && isImageReferenceHandle(targetHandle)) {
    return VIDEO_IMAGE_REFERENCE_HANDLES;
  }

  if (isVideoGeneratorNode(node) && isImageReferenceHandle(targetHandle)) {
    return VIDEO_IMAGE_REFERENCE_HANDLES;
  }

  return [targetHandle];
};

export const getAllowedTargetHandles = (node: StudioNode): string[] => {
  switch (node.type) {
    case 'nanoGen':
      return ['prompt', ...VIDEO_IMAGE_REFERENCE_HANDLES, 'trigger'];
    case 'extendVideo':
      return ['prompt', 'video'];
    case 'string':
      return ['image', 'audio', 'document', 'video'];
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return [];
    default:
      if (isVideoGeneratorNode(node)) {
        return getVideoGeneratorTargetHandles(resolveVideoGeneratorModel(node));
      }
      return [];
  }
};

export const getAllowedSourceHandles = (node: StudioNode): string[] => {
  switch (node.type) {
    case 'string':
      return ['text'];
    case 'image':
      return ['image'];
    case 'video':
      return ['video'];
    case 'audio':
      return ['audio'];
    case 'document':
      return ['document'];
    case 'nanoGen':
      return ['image'];
    case 'extendVideo':
      return ['video'];
    default:
      if (isVideoGeneratorNode(node)) {
        return ['video'];
      }
      return [];
  }
};

export function getTargetHandleConnectionLimit(
  node: StudioNode,
  targetHandle: string,
  edges: Edge[]
): number | undefined {
  if (node.type === 'nanoGen' && isImageReferenceHandle(targetHandle)) {
    const configuredLimit =
      typeof (node.data as { maxReferenceImages?: unknown })?.maxReferenceImages === "number"
        ? Math.floor(
            (node.data as { maxReferenceImages?: number }).maxReferenceImages ?? 14
          )
        : undefined;
    if (configuredLimit !== undefined && Number.isFinite(configuredLimit) && configuredLimit > 0) {
      return configuredLimit;
    }
    return 14;
  }

  if (node.type === 'extendVideo' && targetHandle === 'video') {
    return 1;
  }

  if (!isVideoGeneratorNode(node)) {
    return undefined;
  }

  const model = resolveVideoGeneratorModel(node);
  if (model === 'veo-3.1-fast' || model === 'veo-3.1-lite') {
    if (targetHandle === 'first-frame' || targetHandle === 'last-frame') {
      return 1;
    }
    return undefined;
  }

  if (model === 'veo-3.1') {
    if (isImageReferenceHandle(targetHandle)) {
      return 3;
    }
    return undefined;
  }

  if (model === 'kling-omni') {
    if (targetHandle === VIDEO_REFERENCE_VIDEO_HANDLE) {
      const currentImageCount = getEdgeCountForTargetHandles(
        edges,
        node.id,
        VIDEO_IMAGE_REFERENCE_HANDLES
      );
      return currentImageCount > 4 ? 0 : 1;
    }
    if (isImageReferenceHandle(targetHandle)) {
      const hasReferenceVideo =
        getEdgeCountForTargetHandle(edges, node.id, VIDEO_REFERENCE_VIDEO_HANDLE) > 0;
      return getVideoGeneratorImageLimit(model, hasReferenceVideo);
    }
  }

  return undefined;
}

export function isValidConnection(
  connection: Connection | Edge,
  edges: Edge[],
  nodes: StudioNode[]
): boolean {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sourceNode = nodeById.get(connection.source);
  const targetNode = nodeById.get(connection.target);
  const targetHandle = connection.targetHandle ?? '';

  if (!sourceNode || !targetNode) return false;

  if (sourceNode.type === 'string' && ['prompt', 'prompt-in', 'negative'].includes(targetHandle)) {
    return !hasExistingTargetConnection(edges, connection.target, targetHandle);
  }

  if (targetNode.type === 'string') {
    const handle = targetHandle;
    if (!canAcceptSingleTextInput(edges, connection.target, handle)) {
      return false;
    }

    if (handle === 'image' && (sourceNode.type === 'image' || sourceNode.type === 'nanoGen')) return true;
    if (handle === 'audio' && sourceNode.type === 'audio') return true;
    if (handle === 'video' && sourceNode.type === 'video') return true;
    if (handle === 'document' && sourceNode.type === 'document') return true;

    return false;
  }

  if (targetNode.type === 'nanoGen') {
    if (isImageReferenceHandle(targetHandle)) {
      if (sourceNode.type !== 'image' && sourceNode.type !== 'nanoGen') return false;
    } else if (targetHandle === 'prompt') {
      if (sourceNode.type !== 'string') return false;
    } else {
      return false;
    }
  } else if (targetNode.type === 'extendVideo') {
    if (targetHandle === 'video') {
      if (!(sourceNode.type === 'video' || isVideoGeneratorNode(sourceNode) || sourceNode.type === 'extendVideo')) {
        return false;
      }
    } else if (targetHandle === 'prompt') {
      if (sourceNode.type !== 'string') return false;
    } else {
      return false;
    }
  } else if (isVideoGeneratorNode(targetNode)) {
    const model = resolveVideoGeneratorModel(targetNode);

    if (sourceNode.type === 'string') {
      if (!['prompt', 'prompt-in', 'negative'].includes(targetHandle)) return false;
    } else if (sourceNode.type === 'image' || sourceNode.type === 'nanoGen') {
      if (model === 'veo-3.1-fast' || model === 'veo-3.1-lite') {
        if (!isFrameHandle(targetHandle)) return false;
      } else if (!isImageReferenceHandle(targetHandle)) {
        return false;
      }
    } else if (sourceNode.type === 'video' || isVideoGeneratorNode(sourceNode) || sourceNode.type === 'extendVideo') {
      if (!(model === 'kling-omni' && targetHandle === VIDEO_REFERENCE_VIDEO_HANDLE)) {
        return false;
      }
    } else {
      return false;
    }
  } else if (sourceNode.type === 'string') {
    if (!['prompt', 'prompt-in', 'negative'].includes(targetHandle)) return false;
  } else if (sourceNode.type === 'image' || sourceNode.type === 'nanoGen') {
    if (!isImageReferenceHandle(targetHandle)) return false;
    if (targetNode.type === 'image' || targetNode.type === 'video') return false;
  } else if (sourceNode.type === 'video' || sourceNode.type === 'extendVideo' || isVideoGeneratorNode(sourceNode)) {
    return false;
  }

  if (!canAcceptSingleTextInput(edges, connection.target, targetHandle)) {
    return false;
  }

  const limit = getTargetHandleConnectionLimit(targetNode, targetHandle, edges);
  if (limit !== undefined) {
    if (limit <= 0) return false;
    const countedHandles = getCountedHandles(targetNode, targetHandle);
    const existingConnections = getEdgeCountForTargetHandles(edges, connection.target, countedHandles);
    if (existingConnections >= limit) {
      return false;
    }
  }

  return true;
}
