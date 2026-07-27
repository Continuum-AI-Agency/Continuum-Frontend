import { describe, expect, it } from 'bun:test';

import {
  applyOps,
  autoLayout,
  buildWorkflowGraph,
  mergeGraphs,
  resolveConnection,
  validateWorkflowGraph,
} from './workflow-builder';

const node = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

describe('resolveConnection', () => {
  it('routes a text source into a generator prompt', () => {
    const r = resolveConnection(node('t', 'string'), node('n', 'nanoGen'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sourceHandle).toBe('text');
      expect(r.targetHandle).toBe('prompt');
    }
  });

  it('routes an image source into a ref-image handle', () => {
    const r = resolveConnection(node('i', 'image'), node('n', 'nanoGen'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targetHandle).toBe('ref-image');
  });

  it('routes an image into a veo-fast first-frame (model gating)', () => {
    const r = resolveConnection(node('i', 'image'), node('v', 'veoFast'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targetHandle).toBe('first-frame');
  });

  it('honors a role hint when several handles are valid', () => {
    const r = resolveConnection(
      node('t', 'string'),
      node('v', 'videoGen', { model: 'kling-omni' }),
      { roleHint: 'negative' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targetHandle).toBe('negative');
  });

  it('fails when no compatible handle exists', () => {
    const r = resolveConnection(node('a', 'audio'), node('n', 'nanoGen'));
    expect(r.ok).toBe(false);
  });
});

describe('autoLayout', () => {
  it('places downstream nodes to the right of their sources', () => {
    const nodes = [node('a', 'string'), node('b', 'nanoGen'), node('c', 'veoFast')];
    const edges = [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'text', targetHandle: 'prompt' },
      { id: 'e2', source: 'b', target: 'c', sourceHandle: 'image', targetHandle: 'first-frame' },
    ];
    const laid = autoLayout(nodes, edges);
    const x = Object.fromEntries(laid.map((n) => [n.id, n.position.x]));
    expect(x.a).toBeLessThan(x.b);
    expect(x.b).toBeLessThan(x.c);
  });
});

describe('buildWorkflowGraph', () => {
  it('assembles a valid text → image → video pipeline with resolved handles', () => {
    const { graph, errors } = buildWorkflowGraph(
      [
        { ref: 'prompt', type: 'string', data: { value: 'a red sneaker' } },
        { ref: 'img', type: 'nanoGen' },
        // A generator needs a prompt of its own once nothing feeds its prompt
        // handle — the image reaches `vid` on first-frame, not on prompt.
        { ref: 'vid', type: 'veoFast', data: { prompt: 'pan slowly across the sneaker' } },
      ],
      [
        { from_ref: 'prompt', to_ref: 'img' },
        { from_ref: 'img', to_ref: 'vid' },
      ],
    );
    expect(errors).toHaveLength(0);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(validateWorkflowGraph(graph).ok).toBe(true);
  });

  it('stamps geometry from the node style so the layout has real boxes to work with', () => {
    const { graph } = buildWorkflowGraph([
      { ref: 'img', type: 'nanoGen', data: { positivePrompt: 'a red sneaker' } },
      { ref: 'vid', type: 'veoFast', data: { prompt: 'pan across it', aspectRatio: '9:16' } },
    ]);
    const portrait = graph.nodes.find((n) => n.id === 'vid');
    expect(portrait?.width).toBeGreaterThan(0);
    expect(portrait?.height).toBeGreaterThan(0);
    // 9:16 is taller than it is wide — the geometry must follow the ratio, not a
    // hardcoded landscape box (the shape bug #230 shipped through this builder).
    expect(portrait?.height).toBeGreaterThan(portrait?.width ?? 0);
    expect(portrait?.width).toBe(portrait?.style?.width);
    expect(portrait?.height).toBe(portrait?.style?.height);
  });

  it('warns about a generator it left without a prompt', () => {
    const { warnings, graph } = buildWorkflowGraph([
      { ref: 'prompt', type: 'string', data: { value: 'a red sneaker' } },
      { ref: 'img', type: 'nanoGen' },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('img');
    expect(validateWorkflowGraph(graph).ok).toBe(false);
  });

  it('warns about a prompt node it left empty', () => {
    const { warnings } = buildWorkflowGraph([{ ref: 'prompt', type: 'string' }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('prompt');
  });

  it('stays silent when every generator carries or is wired a prompt', () => {
    const { warnings } = buildWorkflowGraph(
      [
        { ref: 'prompt', type: 'string', data: { value: 'a red sneaker' } },
        { ref: 'img', type: 'nanoGen' },
        { ref: 'own', type: 'nanoGen', data: { positivePrompt: 'its own brief' } },
      ],
      [{ from_ref: 'prompt', to_ref: 'img' }],
    );
    expect(warnings).toHaveLength(0);
  });

  it('reports an error for an impossible connection but still builds the nodes', () => {
    const { graph, errors } = buildWorkflowGraph(
      [
        { ref: 'a', type: 'audio' },
        { ref: 'n', type: 'nanoGen' },
      ],
      [{ from_ref: 'a', to_ref: 'n' }],
    );
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('applyOps', () => {
  const seed = () =>
    buildWorkflowGraph(
      [
        { ref: 'prompt', type: 'string', data: { value: 'hi' } },
        { ref: 'img', type: 'nanoGen' },
      ],
      [{ from_ref: 'prompt', to_ref: 'img' }],
    ).graph;

  it('adds a node and connects it', () => {
    const { graph, errors } = applyOps(seed(), [
      { op: 'add_node', ref: 'vid', type: 'veoFast' },
      { op: 'connect', from: 'img', to: 'vid' },
    ]);
    expect(errors).toHaveLength(0);
    expect(graph.nodes.map((n) => n.id)).toContain('vid');
    expect(graph.edges.some((e) => e.source === 'img' && e.target === 'vid')).toBe(true);
  });

  it("rewires a node's output to a new target", () => {
    const base = applyOps(seed(), [
      { op: 'add_node', ref: 'img2', type: 'nanoGen' },
      { op: 'add_node', ref: 'vid', type: 'veoFast' },
      { op: 'connect', from: 'img', to: 'vid' },
    ]).graph;
    const { graph } = applyOps(base, [
      { op: 'rewire', from: 'img2', to: 'vid', role: 'last-frame' },
    ]);
    const intoVid = graph.edges.filter((e) => e.target === 'vid');
    expect(intoVid.some((e) => e.source === 'img2')).toBe(true);
  });

  it('removes a node and its edges', () => {
    const { graph } = applyOps(seed(), [{ op: 'remove_node', id: 'img' }]);
    expect(graph.nodes.map((n) => n.id)).not.toContain('img');
    expect(graph.edges).toHaveLength(0);
  });

  it('attaches an image asset to an image node and rejects a video asset there', () => {
    const withImg = applyOps(seed(), [{ op: 'add_node', ref: 'ref', type: 'image' }]).graph;
    const ok = applyOps(withImg, [
      {
        op: 'attach_media',
        id: 'ref',
        media: {
          bucket: 'media-library',
          storagePath: 'b/ref.png',
          fileName: 'ref.png',
          mediaKind: 'image',
        },
      },
    ]);
    expect(ok.errors).toHaveLength(0);
    const refNode = ok.graph.nodes.find((n) => n.id === 'ref');
    expect((refNode?.data as Record<string, unknown>).sourcePath).toBe('b/ref.png');

    const bad = applyOps(withImg, [
      {
        op: 'attach_media',
        id: 'ref',
        media: {
          bucket: 'media-library',
          storagePath: 'b/clip.mp4',
          fileName: 'clip.mp4',
          mediaKind: 'video',
        },
      },
    ]);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('keeps the library asset id on the node so the generation stays traceable', () => {
    const withImg = applyOps(seed(), [{ op: 'add_node', ref: 'ref', type: 'image' }]).graph;
    const attached = applyOps(withImg, [
      {
        op: 'attach_media',
        id: 'ref',
        media: {
          assetId: 'asset-77',
          bucket: 'media-library',
          storagePath: 'b/ref.png',
          fileName: 'ref.png',
          mediaKind: 'image',
        },
      },
    ]);
    expect(attached.errors).toHaveLength(0);
    const refNode = attached.graph.nodes.find((n) => n.id === 'ref');
    expect((refNode?.data as Record<string, unknown>).assetId).toBe('asset-77');

    // Re-attaching media that has no library row must not leave the old id behind:
    // the node would credit its generation to an asset it no longer holds.
    const reattached = applyOps(attached.graph, [
      {
        op: 'attach_media',
        id: 'ref',
        media: {
          bucket: 'media-library',
          storagePath: 'b/other.png',
          fileName: 'other.png',
          mediaKind: 'image',
        },
      },
    ]);
    const reattachedNode = reattached.graph.nodes.find((n) => n.id === 'ref');
    expect((reattachedNode?.data as Record<string, unknown>).assetId).toBeUndefined();
  });

  it('drops the library asset id on detach_media', () => {
    const withImg = applyOps(seed(), [{ op: 'add_node', ref: 'ref', type: 'image' }]).graph;
    const attached = applyOps(withImg, [
      {
        op: 'attach_media',
        id: 'ref',
        media: {
          assetId: 'asset-77',
          bucket: 'media-library',
          storagePath: 'b/ref.png',
          fileName: 'ref.png',
          mediaKind: 'image',
        },
      },
    ]).graph;

    const { graph } = applyOps(attached, [{ op: 'detach_media', id: 'ref' }]);
    const refNode = graph.nodes.find((n) => n.id === 'ref');
    expect((refNode?.data as Record<string, unknown>).assetId).toBeUndefined();
    expect((refNode?.data as Record<string, unknown>).sourcePath).toBeUndefined();
  });

  it('merges node data on update_node', () => {
    const { graph } = applyOps(seed(), [
      { op: 'update_node', id: 'img', data: { positivePrompt: 'studio light' } },
    ]);
    const img = graph.nodes.find((n) => n.id === 'img');
    expect((img?.data as Record<string, unknown>).positivePrompt).toBe('studio light');
  });
});

describe('validateWorkflowGraph', () => {
  it('flags a dangling edge', () => {
    const result = validateWorkflowGraph({
      nodes: [node('a', 'string')],
      edges: [
        { id: 'e1', source: 'a', target: 'ghost', sourceHandle: 'text', targetHandle: 'prompt' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('flags a generator that carries no prompt and has none wired in', () => {
    const result = validateWorkflowGraph({
      nodes: [node('n', 'nanoGen')],
      edges: [],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('missing_prompt');
    expect(result.issues[0]?.nodeId).toBe('n');
  });

  it('accepts a generator whose prompt arrives over an edge', () => {
    const result = validateWorkflowGraph({
      nodes: [node('t', 'string', { value: 'a red sneaker' }), node('n', 'nanoGen')],
      edges: [{ id: 'e1', source: 't', target: 'n', sourceHandle: 'text', targetHandle: 'prompt' }],
    });
    expect(result.ok).toBe(true);
  });

  it('flags an empty prompt node with nothing feeding it', () => {
    const result = validateWorkflowGraph({ nodes: [node('t', 'string')], edges: [] });
    expect(result.issues.map((issue) => issue.code)).toContain('missing_prompt');
  });

  it('flags an invalid handle pair', () => {
    const result = validateWorkflowGraph({
      nodes: [node('a', 'audio'), node('n', 'nanoGen')],
      edges: [
        { id: 'e1', source: 'a', target: 'n', sourceHandle: 'audio', targetHandle: 'prompt' },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('reports cycles as edit-time errors with user-facing copy', () => {
    const result = validateWorkflowGraph({
      nodes: [node('a', 'string', { value: 'a' }), node('b', 'string', { value: 'b' })],
      edges: [
        { id: 'a-b', source: 'a', target: 'b', sourceHandle: 'text', targetHandle: 'prompt' },
        { id: 'b-a', source: 'b', target: 'a', sourceHandle: 'text', targetHandle: 'prompt' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'cycle')).toBe(true);
    expect(result.issues.every((issue) => issue.severity === 'error')).toBe(true);
  });
});

describe('mergeGraphs', () => {
  const positioned = (id: string, type: string, x: number, y: number) => ({
    id,
    type,
    position: { x, y },
    data: {},
  });

  it('keeps every base node when incoming work is added', () => {
    const base = {
      nodes: [
        positioned('user-brief', 'string', 0, 0),
        positioned('user-image', 'nanoGen', 360, 0),
      ],
      edges: [
        {
          id: 'ue',
          source: 'user-brief',
          target: 'user-image',
          sourceHandle: 'text',
          targetHandle: 'prompt',
        },
      ],
    };
    const incoming = buildWorkflowGraph(
      [
        { ref: 'agent-prompt', type: 'string' },
        { ref: 'agent-image', type: 'nanoGen' },
      ],
      [{ from_ref: 'agent-prompt', to_ref: 'agent-image' }],
    ).graph;

    const graph = mergeGraphs(base, incoming);

    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      'agent-image',
      'agent-prompt',
      'user-brief',
      'user-image',
    ]);
    expect(graph.edges.map((e) => e.id).sort()).toEqual(
      ['ue', ...incoming.edges.map((e) => e.id)].sort(),
    );
  });

  it('does not disturb the positions the user already arranged', () => {
    const base = { nodes: [positioned('user-brief', 'string', 40, 90)], edges: [] };
    const incoming = buildWorkflowGraph([{ ref: 'agent-prompt', type: 'string' }]).graph;

    const graph = mergeGraphs(base, incoming);

    expect(graph.nodes.find((n) => n.id === 'user-brief')?.position).toEqual({ x: 40, y: 90 });
  });

  it("drops incoming nodes clear of the base so nothing lands on top of the user's work", () => {
    const base = { nodes: [positioned('user-brief', 'string', 0, 500)], edges: [] };
    const incoming = buildWorkflowGraph([{ ref: 'agent-prompt', type: 'string' }]).graph;

    const graph = mergeGraphs(base, incoming);
    const agent = graph.nodes.find((n) => n.id === 'agent-prompt');

    expect(agent?.position.y).toBeGreaterThan(500);
  });

  it('updates a colliding node in place rather than duplicating or dropping it', () => {
    const base = { nodes: [positioned('prompt', 'string', 12, 34)], edges: [] };
    const incoming = buildWorkflowGraph([
      { ref: 'prompt', type: 'string', data: { value: 'agent text' } },
    ]).graph;

    const graph = mergeGraphs(base, incoming);

    expect(graph.nodes).toHaveLength(1);
    expect((graph.nodes[0]?.data as Record<string, unknown>).value).toBe('agent text');
    // Overwriting the node's data must not yank it out from under the user's cursor.
    expect(graph.nodes[0]?.position).toEqual({ x: 12, y: 34 });
  });

  it('merging an empty incoming graph is a no-op', () => {
    const base = { nodes: [positioned('user-brief', 'string', 0, 0)], edges: [] };
    const graph = mergeGraphs(base, { nodes: [], edges: [] });
    expect(graph.nodes.map((n) => n.id)).toEqual(['user-brief']);
  });

  it('merging into an empty canvas keeps the incoming layout untouched', () => {
    const incoming = buildWorkflowGraph(
      [
        { ref: 'a', type: 'string' },
        { ref: 'b', type: 'nanoGen' },
      ],
      [{ from_ref: 'a', to_ref: 'b' }],
    ).graph;

    const graph = mergeGraphs({ nodes: [], edges: [] }, incoming);

    expect(graph.nodes.map((n) => n.position)).toEqual(incoming.nodes.map((n) => n.position));
  });
});

describe('handle resolution honours what the canvas actually renders', () => {
  // VideoGenBlock / VeoFastBlock / OmniGenBlock render `prompt-in`; there is no
  // `prompt` handle in their DOM even though the rules accept the name. A build
  // that resolved to `prompt` would produce an edge attached to nothing on screen.
  it.each([
    ['veoFast', 'veo-3.1-fast'],
    ['videoGen', undefined],
    ['omniGen', undefined],
  ])("routes role 'prompt' on %s to prompt-in", (type, model) => {
    const { graph, errors } = buildWorkflowGraph(
      [
        { ref: 'copy', type: 'string' },
        { ref: 'gen', type, ...(model ? { data: { model } } : {}) },
      ],
      [{ from_ref: 'copy', to_ref: 'gen', role: 'prompt' }],
    );

    expect(errors).toEqual([]);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].targetHandle).toBe('prompt-in');
  });

  it("still routes role 'prompt' on nanoGen to prompt — that IS its rendered handle", () => {
    const { graph } = buildWorkflowGraph(
      [
        { ref: 'copy', type: 'string' },
        { ref: 'img', type: 'nanoGen' },
      ],
      [{ from_ref: 'copy', to_ref: 'img', role: 'prompt' }],
    );
    expect(graph.edges[0].targetHandle).toBe('prompt');
  });

  it("keeps role 'negative' on the negative handle", () => {
    const { graph } = buildWorkflowGraph(
      [
        { ref: 'avoid', type: 'string' },
        { ref: 'gen', type: 'videoGen' },
      ],
      [{ from_ref: 'avoid', to_ref: 'gen', role: 'negative' }],
    );
    expect(graph.edges[0].targetHandle).toBe('negative');
  });
});

describe('set_timeline', () => {
  const timelineGraph = () =>
    buildWorkflowGraph(
      [
        { ref: 'clip-a', type: 'video' },
        { ref: 'clip-b', type: 'video' },
        { ref: 'still', type: 'image' },
        { ref: 'cut', type: 'timelineEditor' },
      ],
      [
        { from_ref: 'clip-a', to_ref: 'cut' },
        { from_ref: 'clip-b', to_ref: 'cut' },
        { from_ref: 'still', to_ref: 'cut' },
      ],
    ).graph;

  it('seeds an ordered cut from the wired pool and re-arms the manual gate', () => {
    const { graph, errors } = applyOps(timelineGraph(), [
      {
        op: 'set_timeline',
        id: 'cut',
        items: [
          { sourceNodeId: 'clip-b', order: 1, trimStartSec: 2, trimEndSec: 7 },
          { sourceNodeId: 'clip-a', order: 0 },
          {
            sourceNodeId: 'still',
            order: 2,
            kind: 'image',
            durationSec: 3,
            transition: { type: 'crossDissolve', durationSec: 0.5 },
          },
        ],
      },
    ]);

    expect(errors).toEqual([]);
    const editor = graph.nodes.find((n) => n.id === 'cut');
    const items = editor?.data.items as Array<Record<string, unknown>>;
    expect(items.map((i) => i.sourceNodeId)).toEqual(['clip-a', 'clip-b', 'still']);
    expect(items.map((i) => i.order)).toEqual([0, 1, 2]);
    expect(items.every((i) => typeof i.id === 'string' && (i.id as string).length > 0)).toBe(true);
    // The human reviews the agent's cut before it renders.
    expect(editor?.data.committed).toBe(false);
  });

  it('refuses to place a clip that is not wired into media-in', () => {
    const base = timelineGraph();
    const withStranger = {
      ...base,
      nodes: [...base.nodes, { id: 'stranger', type: 'video', position: { x: 0, y: 0 }, data: {} }],
    };

    const { graph, errors } = applyOps(withStranger, [
      {
        op: 'set_timeline',
        id: 'cut',
        items: [
          { sourceNodeId: 'clip-a', order: 0 },
          { sourceNodeId: 'stranger', order: 1 },
        ],
      },
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('stranger');
    expect(errors[0]).toContain('media-in');
    // The op is all-or-nothing: a half-applied cut is worse than no cut.
    expect(graph.nodes.find((n) => n.id === 'cut')?.data.items).toEqual([]);
  });

  it('rejects the op on anything that is not a timelineEditor', () => {
    const { errors } = applyOps(timelineGraph(), [
      { op: 'set_timeline', id: 'clip-a', items: [{ sourceNodeId: 'clip-b', order: 0 }] },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('only timelineEditor');
  });
});

describe('update_node cannot smuggle timeline items', () => {
  it('rejects items via update_node and points at set_timeline', () => {
    const base = buildWorkflowGraph([{ ref: 'cut', type: 'timelineEditor' }]).graph;

    const { graph, errors } = applyOps(base, [
      { op: 'update_node', id: 'cut', data: { items: ['0:clip-a', '1:clip-b'] } },
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('set_timeline');
    expect(graph.nodes[0]?.data.items).toEqual([]);
  });

  it('still allows harmless update_node config on a timelineEditor', () => {
    const base = buildWorkflowGraph([{ ref: 'cut', type: 'timelineEditor' }]).graph;
    const { errors, graph } = applyOps(base, [
      { op: 'update_node', id: 'cut', data: { label: 'Reel cut' } },
    ]);
    expect(errors).toEqual([]);
    expect(graph.nodes[0]?.data.label).toBe('Reel cut');
  });
});

describe('update_node coerces video reference modes', () => {
  it('accepts frames on the full Veo 3.1 and reports nothing', () => {
    const base = buildWorkflowGraph([{ ref: 'shot', type: 'veoDirector' }]).graph;

    const { graph, errors } = applyOps(base, [
      { op: 'update_node', id: 'shot', data: { referenceMode: 'frames' } },
    ]);

    expect(errors).toEqual([]);
    expect(graph.nodes[0]?.data.referenceMode).toBe('frames');
  });

  it('coerces a mode the model rejects and warns instead of failing', () => {
    const base = buildWorkflowGraph([{ ref: 'shot', type: 'videoGen' }]).graph;

    const { graph, errors } = applyOps(base, [
      { op: 'update_node', id: 'shot', data: { model: 'veo-3.1-lite', referenceMode: 'images' } },
    ]);

    expect(graph.nodes[0]?.data.referenceMode).toBe('frames');
    expect(errors.join(' ')).toContain('referenceMode');
  });
});

describe('resolveConnection honours the selected reference mode', () => {
  it('routes an image into first-frame on a frames-mode Veo 3.1 node', () => {
    const r = resolveConnection(
      node('img', 'image'),
      node('shot', 'veoDirector', { model: 'veo-3.1', referenceMode: 'frames' }),
      { roleHint: 'first-frame' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targetHandle).toBe('first-frame');
  });

  it('never lands on a frame handle when the node is in images mode', () => {
    const r = resolveConnection(
      node('img', 'image'),
      node('shot', 'veoDirector', { model: 'veo-3.1', referenceMode: 'images' }),
      { roleHint: 'first-frame' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(['ref-image', 'ref-images']).toContain(r.targetHandle);
    }
  });
});
