import type { StudioNode } from '@/StudioCanvas/types';
import type { Edge } from '@xyflow/react';

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
    
    const mergedData = { ...remoteNode.data };
    if (localNode) {
      const runtimeKeys = [
        'isExecuting', 'isComplete', 'error', 'executionTime',
        'isToolbarVisible', 'generatedImage', 'generatedVideo'
      ] as const;
      runtimeKeys.forEach(key => {
        if (localNode.data[key] !== undefined) (mergedData as any)[key] = localNode.data[key];
      });
    }

    merged.set(remoteNode.id, {
      ...remoteNode,
      selected: localNode?.selected,
      dragging: localNode?.dragging,
      data: mergedData,
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
