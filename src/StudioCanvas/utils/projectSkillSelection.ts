// Projects a set of selected canvas nodes into the wire shape the Backend skill
// translator reads. Only nodes that carry usable creative context (a prompt or a
// reference role) are kept, so an empty/utility node never dilutes the draft.

import type {
  CreativeSkillSelection,
  CreativeSkillSelectionNode,
} from '@continuum/contracts';
import type {
  ImageNodeData,
  NanoGenNodeData,
  StringNodeData,
  StudioNode,
  VideoGenNodeData,
} from '../types';

const VIDEO_GEN_TYPES = new Set(['videoGen', 'veoDirector', 'veoFast']);

const trimmed = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

function projectNode(node: StudioNode): CreativeSkillSelectionNode | null {
  const type = node.type ?? '';

  if (type === 'nanoGen') {
    const data = node.data as NanoGenNodeData;
    const prompt = trimmed(data.positivePrompt);
    if (!prompt) return null;
    return { nodeType: 'nanoGen', prompt, model: trimmed(data.model), aspectRatio: trimmed(data.aspectRatio) };
  }

  if (VIDEO_GEN_TYPES.has(type)) {
    const data = node.data as VideoGenNodeData;
    const prompt = trimmed(data.prompt);
    if (!prompt) return null;
    return {
      nodeType: 'videoGen',
      prompt,
      negativePrompt: trimmed(data.negativePrompt),
      model: trimmed(data.model),
      aspectRatio: trimmed(data.aspectRatio),
    };
  }

  if (type === 'string') {
    const prompt = trimmed((node.data as StringNodeData).value);
    if (!prompt) return null;
    return { nodeType: 'string', prompt };
  }

  if (type === 'image') {
    const referenceType = (node.data as ImageNodeData).referenceType;
    if (!referenceType || referenceType === 'default') return null;
    return { nodeType: 'image', referenceRoles: [referenceType] };
  }

  return null;
}

export function projectSkillSelection(nodes: StudioNode[], brandId: string): CreativeSkillSelection {
  const projected = nodes
    .map(projectNode)
    .filter((node): node is CreativeSkillSelectionNode => node !== null);
  return { brandId, nodes: projected };
}
