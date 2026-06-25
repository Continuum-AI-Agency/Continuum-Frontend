import type { Edge } from '@xyflow/react';
import { TIMELINE_MEDIA_INPUT_HANDLE } from '@continuum/contracts';
import type { StudioNode, ClipSlot, TimelineItem, TimelineInputSource } from '../../types';
import type { NodeOutput } from '../../types/execution';
import type { TimelineRenderItem } from './composeTimeline';
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

const isUsableUrl = (value?: string | null): value is string =>
  typeof value === 'string' && (value.startsWith('data:') || /^(https?|blob):/i.test(value.trim()));

function readImageFromSourceNode(node: StudioNode | undefined): string | undefined {
  if (!node) return undefined;

  if (node.type === 'image') {
    const value = (node.data as { image?: unknown }).image;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  if (node.type === 'nanoGen') {
    const data = node.data as { generatedImage?: unknown; generatedImageUrl?: unknown };
    const generated =
      typeof data.generatedImage === 'string' && data.generatedImage.trim() ? data.generatedImage.trim() : undefined;
    if (generated) return generated;
    const url =
      typeof data.generatedImageUrl === 'string' && data.generatedImageUrl.trim() ? data.generatedImageUrl.trim() : undefined;
    return url;
  }

  return undefined;
}

// Resolve each Video Editor (timelineEditor) item to its source bytes + kind.
// The visual kind is authoritative from the connected source node/output (an
// image node → still; any video producer → clip), independent of any UI hint on
// the item. Mirrors resolveClipSources but spans both media kinds.
export async function resolveTimelineSources(
  items: TimelineItem[],
  edges: Edge[],
  nodes: StudioNode[],
  resolvedOutputs: Map<string, NodeOutput>,
  targetNodeId: string,
): Promise<TimelineRenderItem[]> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ordered = [...items].sort((a, b) => a.order - b.order);

  return Promise.all(
    ordered.map(async (item) => {
      const handleId = `media-${item.id}`;
      const edge = edges.find((e) => e.target === targetNodeId && e.targetHandle === handleId);
      if (!edge) {
        throw new Error(`Timeline item ${item.order + 1}: no connected source`);
      }

      const upstream = resolvedOutputs.get(edge.source);
      let kind: 'video' | 'image';
      let source: string | undefined;

      if (upstream?.type === 'video' && upstream.url) {
        kind = 'video';
        source = upstream.url;
      } else if (upstream?.type === 'image' && (isUsableUrl(upstream.url) || upstream.base64)) {
        kind = 'image';
        source = isUsableUrl(upstream.url)
          ? upstream.url
          : `data:${upstream.mimeType || 'image/png'};base64,${upstream.base64}`;
      } else {
        const sourceNode = nodeById.get(edge.source);
        if (sourceNode?.type === 'image' || sourceNode?.type === 'nanoGen') {
          kind = 'image';
          source = readImageFromSourceNode(sourceNode);
        } else {
          kind = 'video';
          source = readVideoFromSourceNode(sourceNode);
        }
      }

      if (!source) {
        throw new Error(`Timeline item ${item.order + 1}: upstream produced no media`);
      }

      const blob = await resolveSource(source);
      return {
        itemId: item.id,
        kind,
        blob,
        trimStartSec: item.trimStartSec,
        trimEndSec: item.trimEndSec,
        durationSec: item.durationSec,
        muteAudio: item.muteAudio,
      } satisfies TimelineRenderItem;
    }),
  );
}
