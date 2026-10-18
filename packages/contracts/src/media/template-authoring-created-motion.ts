import type { TemplateAuthoringNode } from './template-authoring';

/** Supported fresh 2D writers use authoring IDs until the compiler proves their allocated native UIDs. */
export function createdAuthoringMotionChannels(
  node: Pick<TemplateAuthoringNode, 'nodeId' | 'kind' | 'position' | 'scale' | 'rotation' | 'opacity'>,
  frameRate: number | null,
): TemplateAuthoringNode['keyframeChannels'] {
  if (!['shape', 'text', 'artwork'].includes(node.kind) || !node.nodeId.startsWith('draft:') ||
      frameRate === null || !Number.isFinite(frameRate) || frameRate <= 0 || !node.position) return [];
  const scale = node.scale ?? [100, 100];
  const base: Record<'position' | 'scale' | 'rotation' | 'opacity', number | [number, number, number]> = {
    position: [node.position[0], node.position[1], 0], scale: [scale[0], scale[1], 100],
    rotation: node.rotation ?? 0, opacity: node.opacity ?? 100,
  };
  const channels = [ ['position', 'ADBE Position'], ['scale', 'ADBE Scale'], ['rotation', 'ADBE Rotate Z'], ['opacity', 'ADBE Opacity'] ] as const;
  return channels.map(([channel, matchName]) => ({
    channelId: `authoring:${node.nodeId}:${matchName}`, channel, matchName, frameRate,
    dimensions: channel === 'position' || channel === 'scale' ? 3 : 1, separated: false,
    baseValue: base[channel], reason: null, keyframes: [],
  }));
}
