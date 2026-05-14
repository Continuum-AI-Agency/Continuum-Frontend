import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import type { Edge } from '@xyflow/react';
import { resolveClipSources } from './resolveClipSources';
import type { ClipSlot, StudioNode } from '../../types';
import type { NodeOutput } from '../../types/execution';

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
    const slots: ClipSlot[] = [
      slot('b', 1),
      slot('a', 0),
    ];

    const nodes: StudioNode[] = [
      { id: 'src-a', type: 'video', position: { x: 0, y: 0 }, data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` } } as StudioNode,
      { id: 'src-b', type: 'video', position: { x: 0, y: 0 }, data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` } } as StudioNode,
    ];

    const edges: Edge[] = [
      { id: 'e-a', source: 'src-a', target: editorId, sourceHandle: 'video', targetHandle: 'clip-a' },
      { id: 'e-b', source: 'src-b', target: editorId, sourceHandle: 'video', targetHandle: 'clip-b' },
    ];

    const resolved = await resolveClipSources(slots, edges, nodes, new Map<string, NodeOutput>(), editorId);
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
      { id: 'src-b', type: 'video', position: { x: 0, y: 0 }, data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` } } as StudioNode,
    ];
    const edges: Edge[] = [
      { id: 'e-a', source: 'src-a', target: editorId, sourceHandle: 'video', targetHandle: 'clip-a' },
      { id: 'e-b', source: 'src-b', target: editorId, sourceHandle: 'video', targetHandle: 'clip-b' },
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
      { id: 'src-a', type: 'videoGen', position: { x: 0, y: 0 }, data: { generatedVideo: dataUrl } } as StudioNode,
      { id: 'src-b', type: 'video', position: { x: 0, y: 0 }, data: { video: dataUrl } } as StudioNode,
    ];
    const resolvedOutputs = new Map<string, NodeOutput>([
      ['src-a', { type: 'video', url: liveUrl }],
    ]);
    const edges: Edge[] = [
      { id: 'e-a', source: 'src-a', target: editorId, sourceHandle: 'video', targetHandle: 'clip-a' },
      { id: 'e-b', source: 'src-b', target: editorId, sourceHandle: 'video', targetHandle: 'clip-b' },
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
      { id: 'src-a', type: 'video', position: { x: 0, y: 0 }, data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` } } as StudioNode,
      { id: 'src-b', type: 'video', position: { x: 0, y: 0 }, data: { video: `data:video/mp4;base64,${TINY_PNG_BASE64}` } } as StudioNode,
    ];
    const edges: Edge[] = [
      { id: 'e-a', source: 'src-a', target: editorId, sourceHandle: 'video', targetHandle: 'clip-a' },
      { id: 'e-b', source: 'src-b', target: editorId, sourceHandle: 'video', targetHandle: 'clip-b' },
    ];

    const resolved = await resolveClipSources(slots, edges, nodes, new Map<string, NodeOutput>(), editorId);
    expect(resolved[0].trimStartSec).toBe(1);
    expect(resolved[0].trimEndSec).toBe(5);
    expect(resolved[1].trimStartSec).toBe(0.5);
    expect(resolved[1].trimEndSec).toBeUndefined();
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
