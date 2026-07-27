import { createHash } from 'node:crypto';

import type {
  PlannerCompositionClip,
  PlannerCompositionCluster,
  StudioGraphEdge,
  StudioGraphNode,
} from '@continuum/contracts';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const string = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function extractPlannerCompositionClips(contentJson: unknown): PlannerCompositionClip[] {
  const creative = record(record(contentJson).creative);
  const suggestion = record(creative.mediaSuggestion);
  const reel = record(suggestion.reel);
  const scenes = Array.isArray(reel.scenes) ? reel.scenes : [];
  if (scenes.length === 0) throw new Error('This reel has no prepared scene clips.');

  const clips = scenes.map((sceneValue, fallbackIndex) => {
    const scene = record(sceneValue);
    const bucket = string(scene.bucket);
    const storagePath = string(scene.clipUrl);
    const signedUrl = string(scene.signedClipUrl);
    const assetId = string(scene.assetId);
    const role = string(scene.role);
    const durationSec = number(scene.durationSec);
    const index = number(scene.index) ?? fallbackIndex;

    if (
      !bucket ||
      !storagePath ||
      !signedUrl ||
      !durationSec ||
      (role !== 'hook' && role !== 'body' && role !== 'cta')
    ) {
      throw new Error('One or more reel scene clips are not ready.');
    }

    return {
      index,
      role,
      durationSec,
      bucket,
      storagePath,
      signedUrl,
      assetId,
      mimeType: string(scene.mimeType) ?? 'video/mp4',
      captionText: string(scene.captionText) ?? null,
    } satisfies PlannerCompositionClip;
  });

  return clips.sort((left, right) => left.index - right.index);
}

export function fingerprintPlannerCompositionClips(
  clips: readonly PlannerCompositionClip[],
): string {
  const canonical = [...clips]
    .sort((left, right) => left.index - right.index)
    .map((clip) => [
      clip.index,
      clip.role,
      clip.durationSec,
      clip.bucket,
      clip.storagePath,
      clip.captionText ?? '',
    ]);
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
}

export function nextPlannerCompositionOrigin(nodes: readonly StudioGraphNode[]): {
  x: number;
  y: number;
} {
  const maxX = nodes.reduce((largest, node) => {
    const width = typeof node.style?.width === 'number' ? node.style.width : 320;
    return Math.max(largest, node.position.x + width);
  }, 0);
  return { x: nodes.length === 0 ? 120 : maxX + 160, y: 120 };
}

export function mergePlannerCompositionCluster(
  nodes: readonly StudioGraphNode[],
  edges: readonly StudioGraphEdge[],
  cluster: PlannerCompositionCluster,
): { nodes: StudioGraphNode[]; edges: StudioGraphEdge[] } {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  return {
    nodes: [...nodes, ...cluster.nodes.filter((node) => !nodeIds.has(node.id))],
    edges: [...edges, ...cluster.edges.filter((edge) => !edgeIds.has(edge.id))],
  };
}
