import type { Edge } from '@xyflow/react';

const TEXT_INPUT_HANDLES = new Set(['prompt', 'prompt-in', 'trigger', 'negative', 'input', 'audio', 'video']);

export function isTextInputHandle(handleId?: string | null): boolean {
  if (!handleId) return false;
  return TEXT_INPUT_HANDLES.has(handleId);
}

export function hasExistingTargetConnection(
  edges: Edge[],
  targetId: string,
  targetHandle?: string | null,
): boolean {
  if (!targetHandle) return false;
  return edges.some((edge) => edge.target === targetId && edge.targetHandle === targetHandle);
}

export function canAcceptSingleTextInput(
  edges: Edge[],
  targetId: string,
  targetHandle?: string | null,
): boolean {
  if (!isTextInputHandle(targetHandle)) return true;
  return !hasExistingTargetConnection(edges, targetId, targetHandle);
}

export const textInputHandles = TEXT_INPUT_HANDLES;
