import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode, TimelineItem } from '../../types';
import type { NodeOutput } from '../../types/execution';
import { resolveTimelineInputPool, resolveTimelineSources } from './resolveClipSources';

const dataUrl = (mime: string, raw: string) => `data:${mime};base64,${btoa(raw)}`;

describe('resolveTimelineSources', () => {
  it('resolves placements in track order and infers kind from the pool source', async () => {
    const nodes = [
      {
        id: 'vid',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: dataUrl('video/mp4', 'VID') },
      },
      {
        id: 'img',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { image: dataUrl('image/png', 'IMG') },
      },
    ] as unknown as StudioNode[];
    const items: TimelineItem[] = [
      { id: 'i-img', order: 1, sourceNodeId: 'img' },
      { id: 'i-vid', order: 0, sourceNodeId: 'vid' },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'img', target: 'edit', targetHandle: 'media-in' },
      { id: 'e2', source: 'vid', target: 'edit', targetHandle: 'media-in' },
    ];

    const resolved = await resolveTimelineSources(
      items,
      edges,
      nodes,
      new Map<string, NodeOutput>(),
      'edit',
    );

    expect(resolved.map((r) => r.itemId)).toEqual(['i-vid', 'i-img']);
    expect(resolved[0].kind).toBe('video');
    expect(resolved[1].kind).toBe('image');
    expect(resolved[0].blob.size).toBeGreaterThan(0);
    expect(resolved[1].blob.size).toBeGreaterThan(0);
  });

  it('shares one fetch when a source is placed more than once (split)', async () => {
    const nodes = [
      {
        id: 'vid',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: dataUrl('video/mp4', 'VID') },
      },
    ] as unknown as StudioNode[];
    const items: TimelineItem[] = [
      { id: 'a', order: 0, sourceNodeId: 'vid', trimStartSec: 0, trimEndSec: 1 },
      { id: 'b', order: 1, sourceNodeId: 'vid', trimStartSec: 1, trimEndSec: 2 },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'vid', target: 'edit', targetHandle: 'media-in' }];

    const resolved = await resolveTimelineSources(
      items,
      edges,
      nodes,
      new Map<string, NodeOutput>(),
      'edit',
    );

    expect(resolved.map((r) => r.itemId)).toEqual(['a', 'b']);
    expect(resolved[0].kind).toBe('video');
    expect(resolved[1].kind).toBe('video');
    expect(resolved[0].blob).toBe(resolved[1].blob);
  });

  it('prefers a resolved upstream video output over static node data', async () => {
    const nodes = [
      { id: 'gen', type: 'veoDirector', position: { x: 0, y: 0 }, data: {} },
    ] as unknown as StudioNode[];
    const items: TimelineItem[] = [{ id: 'i1', order: 0, sourceNodeId: 'gen' }];
    const edges: Edge[] = [{ id: 'e1', source: 'gen', target: 'edit', targetHandle: 'media-in' }];
    const outputs = new Map<string, NodeOutput>([
      ['gen', { type: 'video', url: dataUrl('video/mp4', 'GEN') }],
    ]);

    const resolved = await resolveTimelineSources(items, edges, nodes, outputs, 'edit');

    expect(resolved[0].kind).toBe('video');
    expect(resolved[0].blob.size).toBeGreaterThan(0);
  });

  it('throws when a placement references a source not in the pool', async () => {
    const items: TimelineItem[] = [{ id: 'i1', order: 0, sourceNodeId: 'ghost' }];
    await expect(
      resolveTimelineSources(items, [], [], new Map<string, NodeOutput>(), 'edit'),
    ).rejects.toThrow(/no connected source/);
  });
});

describe('resolveTimelineInputPool', () => {
  it('enumerates connected image/video sources with kind, de-duplicated', () => {
    const nodes = [
      {
        id: 'vid',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: dataUrl('video/mp4', 'VID'), fileName: 'clip.mp4' },
      },
      {
        id: 'img',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { image: dataUrl('image/png', 'IMG') },
      },
      {
        id: 'nano',
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: { generatedImageUrl: 'https://x/y.png' },
      },
      { id: 'other', type: 'string', position: { x: 0, y: 0 }, data: {} },
    ] as unknown as StudioNode[];
    const edges: Edge[] = [
      { id: 'e1', source: 'vid', target: 'edit', targetHandle: 'media-in' },
      { id: 'e2', source: 'img', target: 'edit', targetHandle: 'media-in' },
      { id: 'e3', source: 'nano', target: 'edit', targetHandle: 'media-in' },
      { id: 'e4', source: 'vid', target: 'edit', targetHandle: 'media-in' },
      { id: 'e5', source: 'other', target: 'edit', targetHandle: 'prompt' },
    ];

    const pool = resolveTimelineInputPool('edit', edges, nodes);

    expect(pool.map((p) => p.nodeId)).toEqual(['vid', 'img', 'nano']);
    expect(pool[0]).toMatchObject({ kind: 'video', label: 'clip.mp4' });
    expect(pool[1].kind).toBe('image');
    expect(pool[2].kind).toBe('image');
    expect(pool[2].previewUrl).toBe('https://x/y.png');
  });
});
