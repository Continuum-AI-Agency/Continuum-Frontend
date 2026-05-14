import type { Edge } from '@xyflow/react';
import type { StudioNode, ClipSlot } from '../../types';
import type { NodeOutput } from '../../types/execution';
import { parseDataUrl } from '../dataUrl';
import { isVideoGeneratorNodeType } from '../videoModel';

export type ResolvedClip = {
  slotId: string;
  blob: Blob;
  trimStartSec?: number;
  trimEndSec?: number;
};

function dataUrlToBlob(dataUrl: string): Blob {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('Clip data URL is malformed');
  }
  const binary = atob(parsed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: parsed.mimeType || 'video/mp4' });
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch clip source (${response.status})`);
  }
  return response.blob();
}

function readVideoFromSourceNode(node: StudioNode | undefined): string | undefined {
  if (!node) return undefined;

  if (node.type === 'video') {
    const value = (node.data as { video?: unknown }).video;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  if (isVideoGeneratorNodeType(node.type) || node.type === 'extendVideo' || node.type === 'videoEditor') {
    const data = node.data as { generatedVideo?: unknown; generatedVideoUrl?: unknown };
    const generated = typeof data.generatedVideo === 'string' && data.generatedVideo.trim() ? data.generatedVideo.trim() : undefined;
    if (generated) return generated;
    const url = typeof data.generatedVideoUrl === 'string' && data.generatedVideoUrl.trim() ? data.generatedVideoUrl.trim() : undefined;
    return url;
  }

  return undefined;
}

async function resolveSource(source: string): Promise<Blob> {
  if (source.startsWith('data:')) {
    return dataUrlToBlob(source);
  }
  return uriToBlob(source);
}

export async function resolveClipSources(
  slots: ClipSlot[],
  edges: Edge[],
  nodes: StudioNode[],
  resolvedOutputs: Map<string, NodeOutput>,
  targetNodeId: string,
): Promise<ResolvedClip[]> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ordered = [...slots].sort((a, b) => a.order - b.order);

  const resolved = await Promise.all(
    ordered.map(async (slot) => {
      const handleId = `clip-${slot.id}`;
      const edge = edges.find((e) => e.target === targetNodeId && e.targetHandle === handleId);
      if (!edge) {
        throw new Error(`Clip slot ${slot.order + 1}: no connected source`);
      }

      const upstream = resolvedOutputs.get(edge.source);
      let source: string | undefined;

      if (upstream?.type === 'video' && upstream.url) {
        source = upstream.url;
      } else {
        source = readVideoFromSourceNode(nodeById.get(edge.source));
      }

      if (!source) {
        throw new Error(`Clip slot ${slot.order + 1}: upstream did not produce a video`);
      }

      const blob = await resolveSource(source);
      return {
        slotId: slot.id,
        blob,
        trimStartSec: slot.trimStartSec,
        trimEndSec: slot.trimEndSec,
      } satisfies ResolvedClip;
    }),
  );

  return resolved;
}
