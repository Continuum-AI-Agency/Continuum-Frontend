import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { TIMELINE_MEDIA_INPUT_HANDLE } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { ClipSlot, StudioNode, TimelineItem } from '../../types';
import type { NodeOutput } from '../../types/execution';
import {
  resolveClipSources,
  resolveTimelineAudioTracks,
  resolveTimelineInputPool,
  resolveTimelineSources,
} from './resolveClipSources';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const slot = (id: string, order: number, overrides: Partial<ClipSlot> = {}): ClipSlot => ({
  id,
  order,
  ...overrides,
});

describe('resolveClipSources', () => {
  const editorId = 'editor-1';

  it('resolves clips in slot order (not insertion order)', async () => {
    const slots: ClipSlot[] = [slot('b', 1), slot('a', 0)];

    const nodes: StudioNode[] = [
      {
        id: 'src-a',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` },
      } as StudioNode,
      {
        id: 'src-b',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` },
      } as StudioNode,
    ];

    const edges: Edge[] = [
      {
        id: 'e-a',
        source: 'src-a',
        target: editorId,
        sourceHandle: 'video',
        targetHandle: 'clip-a',
      },
      {
        id: 'e-b',
        source: 'src-b',
        target: editorId,
        sourceHandle: 'video',
        targetHandle: 'clip-b',
      },
    ];

    const resolved = await resolveClipSources(
      slots,
      edges,
      nodes,
      new Map<string, NodeOutput>(),
      editorId,
    );
    expect(resolved.map((clip) => clip.slotId)).toEqual(['a', 'b']);
  });

  it('throws when a slot has no connected edge', async () => {
    const slots: ClipSlot[] = [slot('a', 0), slot('b', 1)];
    const nodes: StudioNode[] = [];
    const edges: Edge[] = [];

    await expect(
      resolveClipSources(slots, edges, nodes, new Map<string, NodeOutput>(), editorId),
    ).rejects.toThrow(/no connected source/i);
  });

  it('throws when an upstream node has no video', async () => {
    const slots: ClipSlot[] = [slot('a', 0), slot('b', 1)];
    const nodes: StudioNode[] = [
      { id: 'src-a', type: 'video', position: { x: 0, y: 0 }, data: {} } as StudioNode,
      {
        id: 'src-b',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` },
      } as StudioNode,
    ];
    const edges: Edge[] = [
      {
        id: 'e-a',
        source: 'src-a',
        target: editorId,
        sourceHandle: 'video',
        targetHandle: 'clip-a',
      },
      {
        id: 'e-b',
        source: 'src-b',
        target: editorId,
        sourceHandle: 'video',
        targetHandle: 'clip-b',
      },
    ];

    await expect(
      resolveClipSources(slots, edges, nodes, new Map<string, NodeOutput>(), editorId),
    ).rejects.toThrow(/did not produce a video/i);
  });

  it('prefers resolvedOutputs over node data when both are present', async () => {
    const slots: ClipSlot[] = [slot('a', 0), slot('b', 1)];
    const dataUrl = `data:video/mp4;base64,${TINY_PNG_BASE64}`;
    const liveUrl = `data:video/webm;base64,${TINY_PNG_BASE64}`;
    const nodes: StudioNode[] = [
      {
        id: 'src-a',
        type: 'videoGen',
        position: { x: 0, y: 0 },
        data: { generatedVideo: dataUrl },
      } as StudioNode,
      {
        id: 'src-b',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: dataUrl },
      } as StudioNode,
    ];
    const resolvedOutputs = new Map<string, NodeOutput>([
      ['src-a', { type: 'video', url: liveUrl }],
    ]);
    const edges: Edge[] = [
      {
        id: 'e-a',
        source: 'src-a',
        target: editorId,
        sourceHandle: 'video',
        targetHandle: 'clip-a',
      },
      {
        id: 'e-b',
        source: 'src-b',
        target: editorId,
        sourceHandle: 'video',
        targetHandle: 'clip-b',
      },
    ];

    const resolved = await resolveClipSources(slots, edges, nodes, resolvedOutputs, editorId);
    expect(resolved[0].blob.type).toBe('video/webm');
    expect(resolved[1].blob.type).toBe('video/mp4');
  });

  it('passes trim values through to resolved clips', async () => {
    const slots: ClipSlot[] = [
      slot('a', 0, { trimStartSec: 1, trimEndSec: 5 }),
      slot('b', 1, { trimStartSec: 0.5 }),
    ];
    const nodes: StudioNode[] = [
      {
        id: 'src-a',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` },
      } as StudioNode,
      {
        id: 'src-b',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` },
      } as StudioNode,
    ];
    const edges: Edge[] = [
      {
        id: 'e-a',
        source: 'src-a',
        target: editorId,
        sourceHandle: 'video',
        targetHandle: 'clip-a',
      },
      {
        id: 'e-b',
        source: 'src-b',
        target: editorId,
        sourceHandle: 'video',
        targetHandle: 'clip-b',
      },
    ];

    const resolved = await resolveClipSources(
      slots,
      edges,
      nodes,
      new Map<string, NodeOutput>(),
      editorId,
    );
    expect(resolved[0].trimStartSec).toBe(1);
    expect(resolved[0].trimEndSec).toBe(5);
    expect(resolved[1].trimStartSec).toBe(0.5);
    expect(resolved[1].trimEndSec).toBeUndefined();
  });
});

describe('resolveTimelineSources — Video Editor (timelineEditor) as a source', () => {
  const targetId = 'timeline-1';
  const clip = `data:video/mp4;base64,${TINY_PNG_BASE64}`;
  const mediaInEdge = (source: string): Edge => ({
    id: `e-${source}`,
    source,
    target: targetId,
    targetHandle: TIMELINE_MEDIA_INPUT_HANDLE,
  });

  // Regression: readVideoFromSourceNode listed videoEditor but not timelineEditor,
  // so a Video Editor output could be connected + placed but failed the render with
  // "upstream produced no media". Both editor node types emit generatedVideo.
  it('resolves a timelineEditor output as a placeable video clip', async () => {
    const nodes: StudioNode[] = [
      {
        id: 'src',
        type: 'timelineEditor',
        position: { x: 0, y: 0 },
        data: { generatedVideo: clip },
      } as StudioNode,
      { id: targetId, type: 'timelineEditor', position: { x: 0, y: 0 }, data: {} } as StudioNode,
    ];
    const items = [{ id: 'i1', order: 0, sourceNodeId: 'src' }] as unknown as TimelineItem[];

    const resolved = await resolveTimelineSources(
      items,
      [mediaInEdge('src')],
      nodes,
      new Map<string, NodeOutput>(),
      targetId,
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].kind).toBe('video');
    expect(resolved[0].blob).toBeInstanceOf(Blob);
    expect(resolved[0].blob.type).toBe('video/mp4');
  });

  it('keeps the durable Library asset id on Canvas pool entries', () => {
    const nodes: StudioNode[] = [
      {
        id: 'src',
        type: 'video',
        position: { x: 0, y: 0 },
        data: {
          assetId: '4e250533-6dc0-46c9-98db-fd8902cfa847',
          generatedVideoUrl: clip,
        },
      } as StudioNode,
      { id: targetId, type: 'timelineEditor', position: { x: 0, y: 0 }, data: {} } as StudioNode,
    ];

    expect(resolveTimelineInputPool(targetId, [mediaInEdge('src')], nodes)).toEqual([
      expect.objectContaining({
        nodeId: 'src',
        sourceAssetId: '4e250533-6dc0-46c9-98db-fd8902cfa847',
      }),
    ]);
  });

  it('exposes AudioNode sources and resolves audio placements', async () => {
    const audio = `data:audio/wav;base64,${TINY_PNG_BASE64}`;
    const nodes: StudioNode[] = [
      {
        id: 'voice',
        type: 'audio',
        position: { x: 0, y: 0 },
        data: { audio, fileName: 'voice.wav' },
      } as StudioNode,
      { id: targetId, type: 'timelineEditor', position: { x: 0, y: 0 }, data: {} } as StudioNode,
    ];
    const edges = [mediaInEdge('voice')];

    expect(resolveTimelineInputPool(targetId, edges, nodes)).toEqual([
      expect.objectContaining({ nodeId: 'voice', kind: 'audio', label: 'voice.wav' }),
    ]);
    const resolved = await resolveTimelineAudioTracks(
      [
        {
          id: 'audio-1',
          kind: 'audio',
          items: [
            {
              id: 'bed-1',
              order: 0,
              sourceNodeId: 'voice',
              kind: 'audio',
              startSec: 1.5,
              trimStartSec: 0.25,
              trimEndSec: 2,
              volume: 0.6,
            },
          ],
        },
      ],
      edges,
      nodes,
      new Map<string, NodeOutput>(),
      targetId,
    );

    expect(resolved[0]).toMatchObject({
      itemId: 'bed-1',
      startSec: 1.5,
      trimStartSec: 0.25,
      trimEndSec: 2,
      volume: 0.6,
    });
    expect(resolved[0].blob.type).toBe('audio/wav');
  });
});

let originalFetch: typeof fetch | undefined;
beforeAll(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('fetch should not be called in these tests');
  }) as unknown as typeof fetch;
});
afterAll(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});
