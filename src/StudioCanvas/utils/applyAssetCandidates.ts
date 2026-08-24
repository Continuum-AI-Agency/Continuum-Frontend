import type { StudioNode } from '../types';

export type ApplyAssetCandidate = {
  nodeId: string;
  role: string;
  kind: 'image' | 'video';
  source: string;
};

export function sortNodesByCanvasPosition(nodes: StudioNode[]): StudioNode[] {
  return [...nodes].sort((left, right) => {
    const xDiff = (left.position?.x ?? 0) - (right.position?.x ?? 0);
    if (Math.abs(xDiff) > 16) return xDiff;
    return (left.position?.y ?? 0) - (right.position?.y ?? 0);
  });
}

export function collectApplyAssetCandidates(nodes: StudioNode[]): ApplyAssetCandidate[] {
  const sorted = sortNodesByCanvasPosition(nodes);
  const imageCandidates: ApplyAssetCandidate[] = [];
  const videoCandidates: ApplyAssetCandidate[] = [];

  sorted.forEach((node) => {
    if (node.type === 'nanoGen') {
      const nodeData = node.data as { generatedImage?: unknown; generatedImageUrl?: unknown };
      const generatedImage =
        typeof nodeData.generatedImage === 'string' ? (nodeData.generatedImage ?? '').trim() : '';
      const generatedImageUrl =
        typeof nodeData.generatedImageUrl === 'string'
          ? (nodeData.generatedImageUrl ?? '').trim()
          : '';
      const source = generatedImage || generatedImageUrl;
      if (!source) return;
      imageCandidates.push({
        nodeId: node.id,
        role: `image_${imageCandidates.length + 1}`,
        kind: 'image',
        source,
      });
      return;
    }

    if (node.type === 'videoGen' || node.type === 'extendVideo') {
      const nodeData = node.data as { generatedVideo?: unknown; generatedVideoUrl?: unknown };
      const generatedVideo =
        typeof nodeData.generatedVideo === 'string' ? (nodeData.generatedVideo ?? '').trim() : '';
      const generatedVideoUrl =
        typeof nodeData.generatedVideoUrl === 'string'
          ? (nodeData.generatedVideoUrl ?? '').trim()
          : '';
      const source = generatedVideo || generatedVideoUrl;
      if (!source) return;
      videoCandidates.push({
        nodeId: node.id,
        role: `video_${videoCandidates.length + 1}`,
        kind: 'video',
        source,
      });
    }
  });

  return [...imageCandidates, ...videoCandidates];
}
