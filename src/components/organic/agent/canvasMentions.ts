import type { AgentMentionReference, AgentMentionSuggestion } from '@/lib/agent-references';
import type { StudioNode } from '@/StudioCanvas/types';

function readStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function inferCanvasOutputKind(node: StudioNode): 'image' | 'video' | 'canvas' {
  const data = node.data as Record<string, unknown>;
  if (readStringField(data, 'generatedVideoUrl') ?? readStringField(data, 'generatedVideo'))
    return 'video';
  if (readStringField(data, 'video') ?? readStringField(data, 'sourceUrl')) {
    return node.type === 'video' ? 'video' : 'canvas';
  }
  if (
    readStringField(data, 'generatedImageUrl') ??
    readStringField(data, 'generatedImage') ??
    readStringField(data, 'image')
  ) {
    return 'image';
  }
  return 'canvas';
}

export function getCanvasPreview(node: StudioNode): AgentMentionSuggestion['preview'] {
  const data = node.data as Record<string, unknown>;
  const kind = inferCanvasOutputKind(node);
  const url =
    kind === 'video'
      ? (readStringField(data, 'generatedVideoUrl') ??
        readStringField(data, 'generatedVideo') ??
        readStringField(data, 'video') ??
        readStringField(data, 'sourceUrl'))
      : (readStringField(data, 'generatedImageUrl') ??
        readStringField(data, 'generatedImage') ??
        readStringField(data, 'image') ??
        readStringField(data, 'sourceUrl'));
  return { url, kind, label: readStringField(data, 'label') ?? node.type ?? node.id };
}

// Builds the agent reference for a grabbed canvas node. The preview URL is
// forwarded into metadata (not just the suggestion preview) because only the
// reference crosses the wire to the backend resolver — without it, the backend
// cannot resolve a grabbed canvas node to pixels (Gap B).
export function buildCanvasReference(node: StudioNode): AgentMentionReference {
  const data = node.data as Record<string, unknown>;
  const label = readStringField(data, 'label') ?? node.type ?? node.id;
  const preview = getCanvasPreview(node);
  return {
    id: node.id,
    type: 'canvas_node',
    label,
    source: 'organic',
    metadata: {
      nodeId: node.id,
      nodeType: node.type,
      outputKind: preview?.kind ?? 'canvas',
      previewUrl: preview?.url ?? null,
      label,
    },
  };
}
