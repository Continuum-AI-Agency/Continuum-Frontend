import { describe, expect, it } from 'bun:test';

import { migrateStudioWorkflowGraph } from './workflow-migration';

describe('migrateStudioWorkflowGraph', () => {
  it('converts a Video Splicer into the existing Video Editor without losing order', () => {
    const result = migrateStudioWorkflowGraph({
      nodes: [
        { id: 'a', type: 'video', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'video', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'splice',
          type: 'videoEditor',
          position: { x: 100, y: 0 },
          data: {
            clipSlots: [
              { id: 'second', order: 1, muteAudio: true },
              { id: 'first', order: 0, trimStartSec: 1 },
            ],
            generatedVideoStoragePath: 'brand/render.mp4',
          },
        },
      ],
      edges: [
        {
          id: 'e2',
          source: 'b',
          sourceHandle: 'video',
          target: 'splice',
          targetHandle: 'clip-second',
        },
        {
          id: 'e1',
          source: 'a',
          sourceHandle: 'video',
          target: 'splice',
          targetHandle: 'clip-first',
        },
      ],
    });

    expect(result.migrated).toBe(true);
    const editor = result.graph.nodes.find((node) => node.id === 'splice');
    expect(editor?.type).toBe('timelineEditor');
    expect(editor?.data.items).toEqual([
      {
        id: 'migrated-splicer:splice:first',
        order: 0,
        sourceNodeId: 'a',
        kind: 'video',
        trimStartSec: 1,
      },
      {
        id: 'migrated-splicer:splice:second',
        order: 1,
        sourceNodeId: 'b',
        kind: 'video',
        muteAudio: true,
      },
    ]);
    expect(editor?.data.committed).toBe(true);
    expect(result.graph.edges.map((edge) => edge.targetHandle)).toEqual(['media-in', 'media-in']);
  });

  it('converts Publish to Planner into the Organic Publisher video mode', () => {
    const result = migrateStudioWorkflowGraph({
      nodes: [
        {
          id: 'publish',
          type: 'publishToPlanner',
          position: { x: 0, y: 0 },
          data: { draftId: 'draft-1', platform: 'instagram' },
        },
      ],
      edges: [],
    });

    expect(result.graph.nodes[0]).toMatchObject({
      type: 'organicPublisher',
      data: { format: 'video', targetDraftId: 'draft-1' },
    });
  });
});

describe('video reference mode reconciliation', () => {
  const videoGraph = (data: Record<string, unknown>, targetHandle: string) => ({
    nodes: [
      { id: 'img', type: 'image', position: { x: 0, y: 0 }, data: {} },
      { id: 'shot', type: 'videoGen', position: { x: 100, y: 0 }, data },
    ],
    edges: [{ id: 'e1', source: 'img', sourceHandle: 'image', target: 'shot', targetHandle }],
  });

  it('rescues a frames-wired node whose stored mode would prune its own edges', () => {
    // The dangerous case: 'images' is legal for veo-3.1-fast now, so without this pass
    // the resolver honours it and normalizeEdges drops the live first-frame edge.
    const result = migrateStudioWorkflowGraph(
      videoGraph({ model: 'veo-3.1-fast', referenceMode: 'images' }, 'first-frame'),
    );

    expect(result.migrated).toBe(true);
    expect(result.graph.nodes[1]?.data.referenceMode).toBe('frames');
  });

  it('rescues a ref-image-wired node stored in frames mode', () => {
    const result = migrateStudioWorkflowGraph(
      videoGraph({ model: 'veo-3.1', referenceMode: 'frames' }, 'ref-images'),
    );

    expect(result.migrated).toBe(true);
    expect(result.graph.nodes[1]?.data.referenceMode).toBe('images');
  });

  it('leaves a node whose stored mode already agrees with its wiring', () => {
    const result = migrateStudioWorkflowGraph(
      videoGraph({ model: 'veo-3.1', referenceMode: 'frames' }, 'first-frame'),
    );

    expect(result.migrated).toBe(false);
    expect(result.graph.nodes[1]?.data.referenceMode).toBe('frames');
  });

  it('leaves an unwired node untouched rather than churning every canvas', () => {
    const result = migrateStudioWorkflowGraph({
      nodes: [
        { id: 'shot', type: 'videoGen', position: { x: 0, y: 0 }, data: { model: 'veo-3.1' } },
      ],
      edges: [],
    });

    expect(result.migrated).toBe(false);
    expect('referenceMode' in (result.graph.nodes[0]?.data ?? {})).toBe(false);
  });

  it('never stamps a mode the model does not accept', () => {
    // veo-3.1-lite is frames-only; a stray ref-images edge must not force 'images'.
    const result = migrateStudioWorkflowGraph(videoGraph({ model: 'veo-3.1-lite' }, 'ref-images'));

    expect(result.migrated).toBe(false);
  });
});
