import { describe, expect, it } from 'bun:test';

import { namespaceWorkflowSnapshot } from './namespaceWorkflowSnapshot';

describe('namespaceWorkflowSnapshot', () => {
  it('makes an editable workflow module collision-safe without hiding its nodes', () => {
    const result = namespaceWorkflowSnapshot(
      {
        nodes: [
          {
            id: 'prompt',
            type: 'string',
            position: { x: 0, y: 0 },
            data: { value: 'Hook' },
          },
          {
            id: 'shot',
            type: 'videoGen',
            position: { x: 400, y: 0 },
            data: { prompt: '' },
          },
        ],
        edges: [{ id: 'edge', source: 'prompt', target: 'shot' }],
      },
      'module:ugc-1',
    );

    expect(result.nodes.map((node) => node.id)).toEqual([
      'module:ugc-1:prompt',
      'module:ugc-1:shot',
    ]);
    expect(result.edges[0]).toMatchObject({
      id: 'module:ugc-1:edge',
      source: 'module:ugc-1:prompt',
      target: 'module:ugc-1:shot',
    });
  });
});

describe('node ids stored INSIDE data move with the nodes', () => {
  it('remaps a Layer Editor layer onto its namespaced source', () => {
    const result = namespaceWorkflowSnapshot(
      {
        nodes: [
          { id: 'logo', type: 'nanoGen', position: { x: 0, y: 0 }, data: {} },
          {
            id: 'stack',
            type: 'layerEditor',
            position: { x: 400, y: 0 },
            data: {
              frame: { width: 2048, height: 2048 },
              layers: [
                { id: 'l1', name: 'Logo', sourceNodeId: 'logo', position: { x: 10, y: 20 } },
              ],
            },
          },
        ],
        edges: [{ id: 'edge', source: 'logo', target: 'stack' }],
      },
      'module:ad-1',
    );

    const layers = (result.nodes[1].data as { layers: { sourceNodeId: string }[] }).layers;
    // Left unmapped this points at 'logo' while the edge points at 'module:ad-1:logo', so
    // the source pool misses every layer: placed, named, and completely invisible, with
    // Compose emitting a blank PNG rather than an error.
    expect(layers[0].sourceNodeId).toBe('module:ad-1:logo');
  });

  it('keeps the placement it was carrying', () => {
    const result = namespaceWorkflowSnapshot(
      {
        nodes: [
          { id: 'a', type: 'nanoGen', position: { x: 0, y: 0 }, data: {} },
          {
            id: 'stack',
            type: 'layerEditor',
            position: { x: 0, y: 0 },
            data: {
              layers: [
                {
                  id: 'l1',
                  name: 'Hero',
                  sourceNodeId: 'a',
                  position: { x: 512, y: 256 },
                  rotation: 45,
                },
              ],
            },
          },
        ],
        edges: [],
      },
      'module:ad-2',
    );

    expect((result.nodes[1].data as { layers: unknown[] }).layers[0]).toMatchObject({
      name: 'Hero',
      position: { x: 512, y: 256 },
      rotation: 45,
    });
  });

  it('covers Timeline items, which carry the same field', () => {
    const result = namespaceWorkflowSnapshot(
      {
        nodes: [
          { id: 'clip', type: 'videoGen', position: { x: 0, y: 0 }, data: {} },
          {
            id: 'cut',
            type: 'timelineEditor',
            position: { x: 0, y: 0 },
            data: { items: [{ id: 'i1', sourceNodeId: 'clip' }] },
          },
        ],
        edges: [],
      },
      'module:reel',
    );

    expect(
      (result.nodes[1].data as { items: { sourceNodeId: string }[] }).items[0].sourceNodeId,
    ).toBe('module:reel:clip');
  });

  it('leaves a source that is not part of the snapshot alone', () => {
    const result = namespaceWorkflowSnapshot(
      {
        nodes: [
          {
            id: 'stack',
            type: 'layerEditor',
            position: { x: 0, y: 0 },
            data: { layers: [{ id: 'l1', sourceNodeId: 'outside-the-selection' }] },
          },
        ],
        edges: [],
      },
      'module:partial',
    );

    expect(
      (result.nodes[0].data as { layers: { sourceNodeId: string }[] }).layers[0].sourceNodeId,
    ).toBe('outside-the-selection');
  });
});
