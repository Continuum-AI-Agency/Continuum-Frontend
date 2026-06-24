import { describe, it, expect } from 'bun:test';
import { resolveTimelineSources } from './resolveClipSources';
import type { StudioNode, TimelineItem } from '../../types';
import type { Edge } from '@xyflow/react';
import type { NodeOutput } from '../../types/execution';

const dataUrl = (mime: string, raw: string) => `data:${mime};base64,${btoa(raw)}`;

describe('resolveTimelineSources', () => {
  it('resolves items in track order and infers kind from the connected source', async () => {
    const nodes = [
      { id: 'vid', type: 'video', position: { x: 0, y: 0 }, data: { video: dataUrl('video/mp4', 'VID') } },
      { id: 'img', type: 'image', position: { x: 0, y: 0 }, data: { image: dataUrl('image/png', 'IMG') } },
    ] as unknown as StudioNode[];
    const items: TimelineItem[] = [
      { id: 'i-img', order: 1 },
      { id: 'i-vid', order: 0 },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'img', target: 'edit', targetHandle: 'media-i-img' },
      { id: 'e2', source: 'vid', target: 'edit', targetHandle: 'media-i-vid' },
    ];

    const resolved = await resolveTimelineSources(items, edges, nodes, new Map<string, NodeOutput>(), 'edit');

    expect(resolved.map((r) => r.itemId)).toEqual(['i-vid', 'i-img']);
    expect(resolved[0].kind).toBe('video');
    expect(resolved[1].kind).toBe('image');
    expect(resolved[0].blob.size).toBeGreaterThan(0);
    expect(resolved[1].blob.size).toBeGreaterThan(0);
  });

  it('prefers a resolved upstream video output over static node data', async () => {
    const nodes = [
      { id: 'gen', type: 'veoDirector', position: { x: 0, y: 0 }, data: {} },
    ] as unknown as StudioNode[];
    const items: TimelineItem[] = [{ id: 'i1', order: 0 }];
    const edges: Edge[] = [{ id: 'e1', source: 'gen', target: 'edit', targetHandle: 'media-i1' }];
    const outputs = new Map<string, NodeOutput>([['gen', { type: 'video', url: dataUrl('video/mp4', 'GEN') }]]);

    const resolved = await resolveTimelineSources(items, edges, nodes, outputs, 'edit');

    expect(resolved[0].kind).toBe('video');
    expect(resolved[0].blob.size).toBeGreaterThan(0);
  });

  it('throws when a timeline item has no connected source', async () => {
    const items: TimelineItem[] = [{ id: 'i1', order: 0 }];
    await expect(
      resolveTimelineSources(items, [], [], new Map<string, NodeOutput>(), 'edit'),
    ).rejects.toThrow(/no connected source/);
  });
});
