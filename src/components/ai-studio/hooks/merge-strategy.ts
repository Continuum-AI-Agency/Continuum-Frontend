import type { StudioNode } from '@/StudioCanvas/types';
import type { Edge } from '@xyflow/react';

export function mergeNodes(
  local: StudioNode[],
  remote: StudioNode[],
  deletedIds: string[]
): StudioNode[] {
  const localFiltered = local.filter((n) => !deletedIds.includes(n.id));
  
  const remoteMap = new Map(remote.map((n) => [n.id, n]));
  const localMap = new Map(localFiltered.map((n) => [n.id, n]));
  
  const merged = new Map<string, StudioNode>();
  
  for (const remoteNode of remote) {
    const localNode = localMap.get(remoteNode.id);
    
    // Preserve local-only runtime state
    const mergedData = {
      ...remoteNode.data,
    };

    if (localNode) {
      // Keys to preserve from local state if they exist
      const runtimeKeys = [
        'isExecuting',
        'isComplete',
        'error',
        'executionTime',
        'isToolbarVisible',
        'generatedImage',
        'generatedVideo'
      ] as const;

      runtimeKeys.forEach(key => {
        if (localNode.data[key] !== undefined) {
          (mergedData as any)[key] = localNode.data[key];
        }
      });
    }

    merged.set(remoteNode.id, {
      ...remoteNode,
      selected: localNode?.selected,
      dragging: localNode?.dragging,
      data: mergedData,
    } as StudioNode);
  }
  
  for (const localNode of localFiltered) {
    if (!remoteMap.has(localNode.id)) {
      merged.set(localNode.id, localNode);
    }
  }
  
  return Array.from(merged.values());
}

export function mergeEdges(
  local: Edge[],
  remote: Edge[],
  deletedIds: string[]
): Edge[] {
  const localFiltered = local.filter((e) => !deletedIds.includes(e.id));
  
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
      merged.set(localEdge.id, localEdge);
    }
  }
  
  return Array.from(merged.values());
}
