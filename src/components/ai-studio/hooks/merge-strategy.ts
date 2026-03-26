import type { StudioNode } from '@/StudioCanvas/types';
import type { Edge } from '@xyflow/react';

const runtimeDataKeys = [
  'isExecuting',
  'isComplete',
  'error',
  'executionTime',
  'generatedImage',
  'generatedVideo',
] as const;

const richInputDataKeys = [
  'image',
  'video',
  'audio',
  'documents',
  'inputs',
  'frameList',
  'fileName',
  'sourcePath',
  'sourceUrl',
] as const;

const richTextDataKeys = ['positivePrompt', 'prompt', 'negativePrompt'] as const;

const localOnlyDataKeys = ['isToolbarVisible'] as const;

const isRemoteValueEffectivelyMissing = (key: (typeof richInputDataKeys)[number], value: unknown) => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    if (key === 'documents') {
      return value.every((entry) => {
        if (!entry || typeof entry !== 'object') return true;
        const content = (entry as Record<string, unknown>).content;
        return typeof content !== 'string' || content.trim().length === 0;
      });
    }
    if (key === 'inputs' || key === 'frameList') {
      return value.every((entry) => {
        if (!entry || typeof entry !== 'object') return true;
        const src = (entry as Record<string, unknown>).src;
        return typeof src !== 'string' || src.trim().length === 0;
      });
    }
  }

  return false;
};

const isRemoteRuntimeValueMissing = (value: unknown) => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
};

const isRemoteTextValueMissing = (value: unknown) => {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  return value.trim().length === 0;
};

const mergeExecutionFlags = (
  localData: Record<string, unknown>,
  mergedData: Record<string, unknown>
) => {
  const localIsExecuting = localData.isExecuting === true;
  const localIsComplete = localData.isComplete === true;
  const remoteIsExecuting = mergedData.isExecuting === true;
  const remoteIsComplete = mergedData.isComplete === true;
  const remoteHasIsExecuting = typeof mergedData.isExecuting === 'boolean';
  const remoteHasIsComplete = typeof mergedData.isComplete === 'boolean';

  if (remoteIsComplete) {
    mergedData.isComplete = true;
    mergedData.isExecuting = false;
    return;
  }

  if (localIsExecuting && remoteHasIsExecuting && !remoteIsExecuting) {
    mergedData.isExecuting = true;
  }

  if (localIsComplete && remoteHasIsComplete && !remoteIsComplete && !remoteIsExecuting) {
    mergedData.isComplete = true;
  }
};

export function mergeNodes(
  local: StudioNode[],
  remote: StudioNode[],
  remoteDeletedIds: string[],
  prevRemoteIds: Set<string> = new Set()
): StudioNode[] {
  const localFiltered = local.filter((n) => !remoteDeletedIds.includes(n.id));
  
  const remoteMap = new Map(remote.map((n) => [n.id, n]));
  const localMap = new Map(localFiltered.map((n) => [n.id, n]));
  
  const merged = new Map<string, StudioNode>();
  
  // 1. All remote nodes are authoritative
  for (const remoteNode of remote) {
    const localNode = localMap.get(remoteNode.id);
    
    const mergedData: Record<string, unknown> = { ...remoteNode.data };
    if (localNode) {
      const localData = localNode.data as Record<string, unknown>;

      localOnlyDataKeys.forEach((key) => {
        const localValue = localData[key];
        if (localValue !== undefined) {
          mergedData[key] = localValue;
        }
      });

      runtimeDataKeys.forEach(key => {
        const localValue = localData[key];
        if (localValue === undefined) return;
        const remoteValue = mergedData[key];
        if (isRemoteRuntimeValueMissing(remoteValue)) {
          mergedData[key] = localValue;
        }
      });

      richInputDataKeys.forEach((key) => {
        const localValue = localData[key];
        if (localValue === undefined) return;
        const remoteValue = mergedData[key];
        if (isRemoteValueEffectivelyMissing(key, remoteValue)) {
          mergedData[key] = localValue;
        }
      });

      richTextDataKeys.forEach((key) => {
        const localValue = localData[key];
        if (typeof localValue !== 'string' || localValue.trim().length === 0) return;
        const remoteValue = mergedData[key];
        if (isRemoteTextValueMissing(remoteValue)) {
          mergedData[key] = localValue;
        }
      });

      mergeExecutionFlags(localData, mergedData);
    }

    merged.set(remoteNode.id, {
      ...remoteNode,
      selected: localNode?.selected,
      dragging: localNode?.dragging,
      data: mergedData as StudioNode['data'],
    } as StudioNode);
  }
  
  // 2. Handle local nodes that are not in the remote update
  for (const localNode of localFiltered) {
    if (!remoteMap.has(localNode.id)) {
      // If the node WAS in the previous remote state but is now missing,
      // it means it was deleted remotely. Don't resurrect it.
      if (prevRemoteIds.has(localNode.id)) {
        continue;
      }
      
      // Otherwise, it's a new local-only addition. Keep it.
      merged.set(localNode.id, localNode);
    }
  }
  
  return Array.from(merged.values());
}

export function mergeEdges(
  local: Edge[],
  remote: Edge[],
  remoteDeletedIds: string[],
  prevRemoteIds: Set<string> = new Set()
): Edge[] {
  const localFiltered = local.filter((e) => !remoteDeletedIds.includes(e.id));
  
  const remoteMap = new Map(remote.map((e) => [e.id, e]));
  const localMap = new Map(localFiltered.map((e) => [e.id, e]));
  
  const merged = new Map<string, Edge>();
  
  for (const remoteEdge of remote) {
    const localEdge = localMap.get(remoteEdge.id);
    merged.set(remoteEdge.id, {
      ...remoteEdge,
      selected: localEdge?.selected,
    });
  }
  
  for (const localEdge of localFiltered) {
    if (!remoteMap.has(localEdge.id)) {
      if (prevRemoteIds.has(localEdge.id)) {
        continue;
      }
      merged.set(localEdge.id, localEdge);
    }
  }
  
  return Array.from(merged.values());
}
