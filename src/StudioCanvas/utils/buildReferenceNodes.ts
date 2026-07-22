// Builds unattached canvas reference nodes from unfurled media items. Pure (id
// generation is injected) so it is testable without React Flow context. The
// media url is referenced directly (not re-hosted): it drives both the node's
// preview (data.image/data.video) and its durable reference (data.sourceUrl).

import type { UnfurlMediaItem } from '@continuum/contracts';

import type { Point } from './layoutImportedNodes';

const NODE_SIZE = 192;

export interface BuiltReferenceNode {
  id: string;
  type: 'image' | 'video';
  position: Point;
  data: Record<string, unknown>;
  style: { width: number; height: number };
}

const fileNameFromUrl = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl);
    const segment = url.pathname.split('/').filter(Boolean).pop();
    if (segment) return decodeURIComponent(segment);
    return `${url.hostname}-media`;
  } catch {
    return 'imported-media';
  }
};

export function buildReferenceNodes(
  items: UnfurlMediaItem[],
  positions: Point[],
  makeId: () => string,
): BuiltReferenceNode[] {
  return items.map((item, index) => {
    const position = positions[index] ?? { x: 0, y: 0 };
    const fileName = fileNameFromUrl(item.url);
    const style = { width: NODE_SIZE, height: NODE_SIZE };

    if (item.kind === 'video') {
      return {
        id: makeId(),
        type: 'video',
        position,
        data: { video: item.url, sourceUrl: item.url, fileName },
        style,
      };
    }
    return {
      id: makeId(),
      type: 'image',
      position,
      data: { image: item.url, sourceUrl: item.url, fileName, aspectRatio: '1:1' },
      style,
    };
  });
}
