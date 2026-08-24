import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import { computeReadyNodeIds, computeStyledEdges } from './edgeStyling';

const node = (id: string, type: string, data: unknown = {}): StudioNode =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as StudioNode;

const edge = (partial: Partial<Edge> & { id: string; source: string; target: string }): Edge =>
  partial as Edge;

const styleOf = (styled: { style?: unknown }) => styled.style as Record<string, string>;

describe('computeReadyNodeIds', () => {
  it('marks a nanoGen ready when an incoming edge targets the `prompt` handle', () => {
    const nodes = [node('src', 'string', { value: 'hi' }), node('nano', 'nanoGen')];
    const edges = [
      edge({
        id: 'e1',
        source: 'src',
        target: 'nano',
        sourceHandle: 'text',
        targetHandle: 'prompt',
      }),
    ];

    expect(computeReadyNodeIds(nodes, edges).has('nano')).toBe(true);
  });

  it('marks a nanoGen ready when data.positivePrompt is non-empty after trimming', () => {
    const nodes = [node('nano', 'nanoGen', { positivePrompt: '  a moody portrait  ' })];

    expect(computeReadyNodeIds(nodes, []).has('nano')).toBe(true);
  });

  it('marks videoGen, veoDirector and veoFast ready via a `prompt-in` edge', () => {
    const nodes = [
      node('src', 'string', { value: 'hi' }),
      node('videoGen', 'videoGen'),
      node('veoDirector', 'veoDirector'),
      node('veoFast', 'veoFast'),
    ];
    const edges = [
      edge({ id: 'e1', source: 'src', target: 'videoGen', targetHandle: 'prompt-in' }),
      edge({ id: 'e2', source: 'src', target: 'veoDirector', targetHandle: 'prompt-in' }),
      edge({ id: 'e3', source: 'src', target: 'veoFast', targetHandle: 'prompt-in' }),
    ];

    const ready = computeReadyNodeIds(nodes, edges);
    expect([...ready].sort()).toEqual(['veoDirector', 'veoFast', 'videoGen']);
  });

  it('marks videoGen, veoDirector and veoFast ready via a non-empty data.prompt', () => {
    const nodes = [
      node('videoGen', 'videoGen', { prompt: 'a dog surfing' }),
      node('veoDirector', 'veoDirector', { prompt: '  padded  ' }),
      node('veoFast', 'veoFast', { prompt: 'x' }),
    ];

    const ready = computeReadyNodeIds(nodes, []);
    expect([...ready].sort()).toEqual(['veoDirector', 'veoFast', 'videoGen']);
  });

  it('does not mark a generator ready for a whitespace-only prompt', () => {
    const nodes = [
      node('nano', 'nanoGen', { positivePrompt: '   \n\t ' }),
      node('videoGen', 'videoGen', { prompt: '   ' }),
      node('empty', 'nanoGen', { positivePrompt: '' }),
    ];

    expect(computeReadyNodeIds(nodes, []).size).toBe(0);
  });

  it('does not mark a generator ready for a non-string prompt', () => {
    const nodes = [
      node('nano', 'nanoGen', { positivePrompt: 42 }),
      node('videoGen', 'videoGen', { prompt: { text: 'nope' } }),
      node('veoFast', 'veoFast', { prompt: null }),
    ];

    expect(computeReadyNodeIds(nodes, []).size).toBe(0);
  });

  it('never marks a non-generator node ready, even with a wired prompt edge', () => {
    const nodes = [
      node('string', 'string', { value: 'hi' }),
      node('image', 'image', { image: 'data:' }),
      node('video', 'video', { video: 'data:' }),
      node('note', 'note', { positivePrompt: 'typed', prompt: 'typed' }),
    ];
    const edges = [
      edge({ id: 'e1', source: 'x', target: 'string', targetHandle: 'prompt' }),
      edge({ id: 'e2', source: 'x', target: 'image', targetHandle: 'prompt' }),
      edge({ id: 'e3', source: 'x', target: 'video', targetHandle: 'prompt-in' }),
      edge({ id: 'e4', source: 'x', target: 'note', targetHandle: 'prompt' }),
    ];

    expect(computeReadyNodeIds(nodes, edges).size).toBe(0);
  });

  it('ignores an edge that targets the wrong handle for the node type', () => {
    const nodes = [node('nano', 'nanoGen'), node('videoGen', 'videoGen')];
    const edges = [
      edge({ id: 'e1', source: 'src', target: 'nano', targetHandle: 'prompt-in' }),
      edge({ id: 'e2', source: 'src', target: 'videoGen', targetHandle: 'prompt' }),
    ];

    expect(computeReadyNodeIds(nodes, edges).size).toBe(0);
  });

  it('ignores a prompt edge that targets a different node', () => {
    const nodes = [node('nano', 'nanoGen')];
    const edges = [edge({ id: 'e1', source: 'src', target: 'other', targetHandle: 'prompt' })];

    expect(computeReadyNodeIds(nodes, edges).size).toBe(0);
  });
});

describe('computeStyledEdges', () => {
  const nodes = [
    node('src', 'string', { value: 'hi' }),
    node('nano', 'nanoGen'),
    node('videoGen', 'videoGen'),
    node('veoDirector', 'veoDirector'),
    node('veoFast', 'veoFast'),
    node('image', 'image', { image: '' }),
  ];

  it('forces type `dataType` and animated false regardless of the input edge type', () => {
    const styled = computeStyledEdges(
      [
        edge({ id: 'e1', source: 'src', target: 'image', type: 'smoothstep', animated: true }),
        edge({ id: 'e2', source: 'src', target: 'image', type: 'straight' }),
        edge({ id: 'e3', source: 'src', target: 'image' }),
      ],
      nodes,
      new Set(),
    );

    for (const item of styled) {
      expect(item.type).toBe('dataType');
      expect(item.animated).toBe(false);
    }
  });

  it('always includes `studio-edge` and preserves a pre-existing className', () => {
    const [styled] = computeStyledEdges(
      [edge({ id: 'e1', source: 'src', target: 'image', className: 'legacy-edge' })],
      nodes,
      new Set(),
    );

    expect(styled.className).toBe('legacy-edge studio-edge');
  });

  it('adds `studio-edge--active` when the target is a generator in readyNodeIds', () => {
    const styled = computeStyledEdges(
      [
        edge({ id: 'e1', source: 'src', target: 'nano' }),
        edge({ id: 'e2', source: 'src', target: 'videoGen' }),
        edge({ id: 'e3', source: 'src', target: 'veoDirector' }),
        edge({ id: 'e4', source: 'src', target: 'veoFast' }),
      ],
      nodes,
      new Set(['nano', 'videoGen', 'veoDirector', 'veoFast']),
    );

    for (const item of styled) {
      expect(item.className).toBe('studio-edge studio-edge--active');
    }
  });

  it('adds `studio-edge--inactive` when the target is a generator not in readyNodeIds', () => {
    const [styled] = computeStyledEdges(
      [edge({ id: 'e1', source: 'src', target: 'nano', className: 'legacy-edge' })],
      nodes,
      new Set(['videoGen']),
    );

    expect(styled.className).toBe('legacy-edge studio-edge studio-edge--inactive');
  });

  it('adds neither modifier when the target is not a generator', () => {
    const styled = computeStyledEdges(
      [
        edge({ id: 'e1', source: 'src', target: 'image' }),
        edge({ id: 'e2', source: 'src', target: 'missing-node' }),
      ],
      nodes,
      new Set(['image', 'missing-node']),
    );

    for (const item of styled) {
      expect(item.className).toBe('studio-edge');
      expect(item.className).not.toContain('studio-edge--');
      expect(item.data.isActive).toBe(false);
      expect(item.data.isDotted).toBe(false);
    }
  });

  it('prefers a valid edge.data.dataType over the sourceHandle inference', () => {
    const [styled] = computeStyledEdges(
      [
        edge({
          id: 'e1',
          source: 'src',
          target: 'image',
          sourceHandle: 'video',
          data: { dataType: 'document' },
        }),
      ],
      nodes,
      new Set(),
    );

    expect(styled.data.dataType).toBe('document');
  });

  it('infers the dataType from the sourceHandle when edge.data.dataType is absent', () => {
    const styled = computeStyledEdges(
      [
        edge({ id: 'e1', source: 'src', target: 'image', sourceHandle: 'image' }),
        edge({ id: 'e2', source: 'src', target: 'image', sourceHandle: 'video' }),
        edge({ id: 'e3', source: 'src', target: 'image', sourceHandle: 'audio' }),
        edge({ id: 'e4', source: 'src', target: 'image', sourceHandle: 'document' }),
      ],
      nodes,
      new Set(),
    );

    expect(styled.map((item) => item.data.dataType)).toEqual([
      'image',
      'video',
      'audio',
      'document',
    ]);
  });

  it('falls back to `text` when neither data.dataType nor the sourceHandle resolves', () => {
    const styled = computeStyledEdges(
      [
        edge({ id: 'e1', source: 'src', target: 'image' }),
        edge({ id: 'e2', source: 'src', target: 'image', sourceHandle: 'prompt-out' }),
        edge({ id: 'e3', source: 'src', target: 'image', data: { dataType: 'text' } }),
      ],
      nodes,
      new Set(),
    );

    expect(styled.map((item) => item.data.dataType)).toEqual(['text', 'text', 'text']);
  });

  it('falls through an invalid edge.data.dataType to the sourceHandle inference', () => {
    const styled = computeStyledEdges(
      [
        edge({
          id: 'e1',
          source: 'src',
          target: 'image',
          sourceHandle: 'audio',
          data: { dataType: 'json' },
        }),
        edge({ id: 'e2', source: 'src', target: 'image', data: { dataType: 'json' } }),
      ],
      nodes,
      new Set(),
    );

    expect(styled.map((item) => item.data.dataType)).toEqual(['audio', 'text']);
  });

  it('sets --edge-color from the dataType and keeps pre-existing style keys', () => {
    const [styled] = computeStyledEdges(
      [
        edge({
          id: 'e1',
          source: 'src',
          target: 'image',
          sourceHandle: 'video',
          style: { strokeWidth: 3, stroke: 'red' },
        }),
      ],
      nodes,
      new Set(),
    );

    expect(styleOf(styled)['--edge-color']).toBe('var(--edge-video)');
    expect(styled.style).toMatchObject({ strokeWidth: 3, stroke: 'red' });
  });

  it('prefers a valid data.pathType, then a valid edge.type, then bezier', () => {
    const styled = computeStyledEdges(
      [
        edge({
          id: 'e1',
          source: 'src',
          target: 'image',
          type: 'straight',
          data: { pathType: 'step' },
        }),
        edge({
          id: 'e2',
          source: 'src',
          target: 'image',
          type: 'straight',
          data: { pathType: 'wiggly' },
        }),
        edge({ id: 'e3', source: 'src', target: 'image', type: 'smoothstep' }),
        edge({ id: 'e4', source: 'src', target: 'image', type: 'dataType' }),
        edge({ id: 'e5', source: 'src', target: 'image' }),
      ],
      nodes,
      new Set(),
    );

    expect(styled.map((item) => item.data.pathType)).toEqual([
      'step',
      'straight',
      'smoothstep',
      'bezier',
      'bezier',
    ]);
  });

  it('mirrors the class decision in data.isActive / data.isDotted and keeps pre-existing data keys', () => {
    const [active, inactive] = computeStyledEdges(
      [
        edge({ id: 'e1', source: 'src', target: 'nano', data: { label: 'keep me' } }),
        edge({ id: 'e2', source: 'src', target: 'videoGen', data: { label: 'keep me too' } }),
      ],
      nodes,
      new Set(['nano']),
    );

    expect(active.data).toMatchObject({
      label: 'keep me',
      isActive: true,
      isDotted: false,
      dataType: 'text',
      pathType: 'bezier',
    });
    expect(inactive.data).toMatchObject({
      label: 'keep me too',
      isActive: false,
      isDotted: true,
    });
  });
});
