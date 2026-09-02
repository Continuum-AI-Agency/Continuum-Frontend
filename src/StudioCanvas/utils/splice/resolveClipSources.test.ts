import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  isValidConnection,
  STUDIO_NODE_TYPES,
  TIMELINE_MEDIA_INPUT_HANDLE,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode, TimelineItem } from '../../types';
import type { NodeOutput } from '../../types/execution';
import {
  resolveTimelineAudioTracks,
  resolveTimelineInputPool,
  resolveTimelineSources,
} from './resolveClipSources';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('resolveTimelineSources — Video Editor (timelineEditor) as a source', () => {
  const targetId = 'timeline-1';
  const clip = `data:video/mp4;base64,${TINY_PNG_BASE64}`;
  const mediaInEdge = (source: string): Edge => ({
    id: `e-${source}`,
    source,
    target: targetId,
    targetHandle: TIMELINE_MEDIA_INPUT_HANDLE,
  });

  // Regression: a Video Editor output can be connected and placed as another
  // editor's input without losing its rendered video.
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

// The connection validator admits every media-producing node onto `media-in`
// (contracts `timelineMediaKind`), and the resolver used to enumerate a much
// shorter hand-written list. Everything in the gap connected, showed a blank
// mis-kinded bin tile, and then threw "upstream produced no media" on render.
describe('resolveTimelineInputPool — every source the validator admits', () => {
  const targetId = 'timeline-1';
  const clip = `data:video/mp4;base64,${TINY_PNG_BASE64}`;
  const still = `data:image/png;base64,${TINY_PNG_BASE64}`;
  const target = {
    id: targetId,
    type: 'timelineEditor',
    position: { x: 0, y: 0 },
    data: {},
  } as StudioNode;
  const mediaInEdge = (source: string, sourceHandle?: string): Edge => ({
    id: `e-${source}`,
    source,
    target: targetId,
    targetHandle: TIMELINE_MEDIA_INPUT_HANDLE,
    ...(sourceHandle ? { sourceHandle } : {}),
  });

  it.each([
    [
      'a sourceModality node (action)',
      { id: 'act', type: 'action', data: { actionId: 'video.reverse', generatedVideoUrl: clip } },
      { kind: 'video', label: 'Reverse', previewUrl: clip },
    ],
    [
      'hyperframesAgent',
      { id: 'hf', type: 'hyperframesAgent', data: { generatedVideoUrl: clip } },
      { kind: 'video', label: 'HyperFrames Agent', previewUrl: clip },
    ],
    [
      'frameExtract',
      { id: 'frame', type: 'frameExtract', data: { generatedImageUrl: still } },
      { kind: 'image', label: 'Continuity Frame', previewUrl: still },
    ],
    [
      'omniGen',
      { id: 'omni', type: 'omniGen', data: { generatedVideo: clip } },
      { kind: 'video', label: 'Omni 1.1 Flash (Edit)', previewUrl: clip },
    ],
  ])('lists %s with its real kind, label and preview', (_name, source, expected) => {
    const node = { ...source, position: { x: 0, y: 0 } } as unknown as StudioNode;
    const pool = resolveTimelineInputPool(targetId, [mediaInEdge(node.id)], [node, target]);
    expect(pool).toEqual([expect.objectContaining({ nodeId: node.id, ...expected })]);
  });

  // A designRef emits a specimen on `image` and a token summary on `text`; only the
  // edge's sourceHandle tells them apart.
  it('reads a designRef specimen from the handle the edge left on', () => {
    const node = {
      id: 'design',
      type: 'designRef',
      position: { x: 0, y: 0 },
      data: { section: 'palette', mode: 'both', specimenUrl: still },
    } as unknown as StudioNode;

    expect(
      resolveTimelineInputPool(targetId, [mediaInEdge('design', 'image')], [node, target]),
    ).toEqual([
      expect.objectContaining({ kind: 'image', label: 'Design Reference', previewUrl: still }),
    ]);
  });

  it('prefers a just-executed run output over the node data behind it', () => {
    const node = {
      id: 'act',
      type: 'action',
      position: { x: 0, y: 0 },
      data: { actionId: 'video.reverse' },
    } as unknown as StudioNode;
    const outputs = new Map<string, NodeOutput>([
      ['act', { type: 'video', url: 'https://cdn/reversed.mp4' }],
    ]);

    expect(
      resolveTimelineInputPool(targetId, [mediaInEdge('act')], [node, target], outputs),
    ).toEqual([expect.objectContaining({ kind: 'video', previewUrl: 'https://cdn/reversed.mp4' })]);
  });

  it('places an action clip as real bytes instead of throwing "upstream produced no media"', async () => {
    const node = {
      id: 'act',
      type: 'action',
      position: { x: 0, y: 0 },
      data: { actionId: 'video.reverse', generatedVideoUrl: clip },
    } as unknown as StudioNode;
    const items = [{ id: 'i1', order: 0, sourceNodeId: 'act' }] as unknown as TimelineItem[];

    const resolved = await resolveTimelineSources(
      items,
      [mediaInEdge('act')],
      [node, target],
      new Map<string, NodeOutput>(),
      targetId,
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].kind).toBe('video');
    expect(resolved[0].blob.type).toBe('video/mp4');
  });
});

// The drift guard. A node type the canvas lets you WIRE into `media-in` but cannot
// RESOLVE is a blank tile followed by "upstream produced no media" — which is exactly
// what every action/agent/frame type became when the action catalog landed. The two
// sets are one contracts predicate now; this fails if they ever come apart again.
describe('the connectable set and the resolvable set are the same set', () => {
  const targetId = 'timeline-1';
  const clip = `data:video/mp4;base64,${TINY_PNG_BASE64}`;
  const still = `data:image/png;base64,${TINY_PNG_BASE64}`;
  const bed = `data:audio/wav;base64,${TINY_PNG_BASE64}`;
  // Everything a configured node of ANY type could carry, so admission is decided by
  // the node type and not by a missing fixture field.
  const configured = {
    actionId: 'video.reverse',
    lockedType: 'video',
    itemType: 'video',
    items: [],
    generatedVideo: clip,
    generatedImage: still,
    audio: bed,
  };
  const target = {
    id: targetId,
    type: 'timelineEditor',
    position: { x: 0, y: 0 },
    data: {},
  } as StudioNode;

  it('resolves a real kind and preview for every admitted source type', () => {
    const admitted: string[] = [];

    for (const type of STUDIO_NODE_TYPES) {
      const source = {
        id: 'src',
        type,
        position: { x: 0, y: 0 },
        data: configured,
      } as unknown as StudioNode;
      const edge: Edge = {
        id: 'e1',
        source: 'src',
        target: targetId,
        targetHandle: TIMELINE_MEDIA_INPUT_HANDLE,
      };
      if (!isValidConnection({ source: 'src', target: targetId, targetHandle: TIMELINE_MEDIA_INPUT_HANDLE }, [], [source, target]))
        continue;
      admitted.push(type);

      const [entry] = resolveTimelineInputPool(targetId, [edge], [source, target]);
      expect(entry, `${type} is connectable but produced no pool entry`).toBeDefined();
      expect(entry.previewUrl, `${type} resolves to a blank bin tile`).toBeTruthy();
      expect(
        { type, url: entry.previewUrl },
        `${type} resolved to the wrong modality (${entry.kind})`,
      ).toEqual({ type, url: { video: clip, image: still, audio: bed }[entry.kind] });
    }

    // Guards the guard: an empty admitted set would make every assertion above vacuous.
    expect(admitted).toEqual(
      expect.arrayContaining(['action', 'hyperframesAgent', 'frameExtract', 'omniGen', 'audio']),
    );
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
