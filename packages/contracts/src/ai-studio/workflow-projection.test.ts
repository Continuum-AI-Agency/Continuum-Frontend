import { describe, expect, it } from 'bun:test';

import { buildWorkflowGraph, validateWorkflowGraph } from './workflow-builder';
import {
  AGENT_FIELD_WHITELIST,
  FREE_TEXT_CAP,
  findNodeIds,
  MAX_PROJECTED_NODES,
  MAX_PROJECTED_WIRING,
  projectGraphForAgent,
  selectSubgraph,
} from './workflow-projection';

const SIGNED_URL =
  'https://signed.example.com/object/sign/media-library/brand-1/p.png?token=' + 'x'.repeat(300);

const fatGraph = {
  nodes: [
    {
      id: 'prompt',
      type: 'string',
      position: { x: 12.5, y: 880.2 },
      style: { width: 320, height: 120 },
      width: 320,
      height: 120,
      selected: true,
      dragging: false,
      measured: { width: 320, height: 120 },
      data: {
        value: 'a red sneaker on wet concrete, dramatic lighting',
        isExecuting: false,
        isToolbarVisible: true,
        label: 'Brief',
      },
    },
    {
      id: 'ref',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        fileName: 'product-shot.png',
        sourcePath: 'brand-1/uploads/product-shot.png',
        bucket: 'media-library',
        sourceUrl: SIGNED_URL,
        referenceType: 'product',
        assetId: 'asset-99',
        assetVersionId: 'version-7',
        image: 'data:image/png;base64,' + 'A'.repeat(500),
      },
    },
    {
      id: 'img',
      type: 'nanoGen',
      position: { x: 360, y: 0 },
      data: {
        model: 'nano-banana-2',
        positivePrompt: '',
        aspectRatio: '16:9',
        imageSize: '512px',
        generatedImageUrl: SIGNED_URL,
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'prompt', target: 'img', sourceHandle: 'text', targetHandle: 'prompt' },
    { id: 'e2', source: 'ref', target: 'img', sourceHandle: 'image', targetHandle: 'ref-image' },
  ],
};

describe('projectGraphForAgent', () => {
  const projection = projectGraphForAgent(fatGraph);
  const json = JSON.stringify(projection);

  it('counts nodes, edges, and node types', () => {
    expect(projection.node_count).toBe(3);
    expect(projection.edge_count).toBe(2);
    expect(projection.node_types).toEqual({ string: 1, image: 1, nanoGen: 1 });
  });

  it('collapses edges into readable wiring strings', () => {
    expect(projection.wiring).toContain('prompt.text → img.prompt');
    expect(projection.wiring).toContain('ref.image → img.ref-image');
  });

  it('surfaces only whitelisted node config and keeps the label', () => {
    const promptNode = projection.nodes.find((n) => n.id === 'prompt');
    expect(promptNode?.label).toBe('Brief');
    expect(promptNode?.config?.value).toBe('a red sneaker on wet concrete, dramatic lighting');
    // runtime + xyflow internals never reach the agent
    expect(JSON.stringify(promptNode)).not.toContain('isExecuting');
    expect(JSON.stringify(promptNode)).not.toContain('isToolbarVisible');
  });

  it('reports attachments by identity, on the handle they feed', () => {
    const attachment = projection.attachments.find((a) => a.node_id === 'ref');
    expect(attachment).toBeDefined();
    expect(attachment?.file_name).toBe('product-shot.png');
    expect(attachment?.media_kind).toBe('image');
    expect(attachment?.handle).toBe('ref-image');
    expect(attachment?.asset_ref).toBe('asset-99');
    expect(attachment?.version_ref).toBe('version-7');
  });

  it('never leaks signed URLs, buckets, storage paths, or base64 into the agent payload', () => {
    expect(json).not.toContain('token=');
    expect(json).not.toContain('media-library');
    expect(json).not.toContain('uploads/product-shot.png');
    expect(json).not.toContain('data:image');
    expect(json).not.toContain('base64');
    expect(json).not.toContain('sourceUrl');
    expect(json).not.toContain('generatedImageUrl');
  });

  it('is dramatically smaller than the raw graph', () => {
    expect(json.length).toBeLessThan(JSON.stringify(fatGraph).length / 2);
  });

  it('caps long free-text fields', () => {
    const longText = 'word '.repeat(200);
    const projected = projectGraphForAgent({
      nodes: [{ id: 's', type: 'string', position: { x: 0, y: 0 }, data: { value: longText } }],
      edges: [],
    });
    const value = projected.nodes[0].config?.value as string;
    expect(value.length).toBeLessThan(longText.length);
    expect(value.endsWith('…')).toBe(true);
  });

  it('exposes a per-type field whitelist', () => {
    expect(AGENT_FIELD_WHITELIST.nanoGen).toContain('model');
    expect(AGENT_FIELD_WHITELIST.string).toEqual(['value']);
  });

  // An element node binds to a saved element by id, and the agent now gets those ids from
  // the `list_elements` tool — so hiding the binding from the projection would leave it
  // unable to read back what it just wired.
  it('projects the element binding, and the name that makes it readable', () => {
    const projected = projectGraphForAgent({
      nodes: [
        {
          id: 'el',
          type: 'element',
          position: { x: 0, y: 0 },
          data: {
            elementId: '7f3c1c9e-0000-4000-8000-00000000abcd',
            elementName: 'Nova, the founder',
            elementCategory: 'model',
            previewUrl: SIGNED_URL,
          },
        },
      ],
      edges: [],
    });
    expect(projected.nodes[0].config).toEqual({
      elementId: '7f3c1c9e-0000-4000-8000-00000000abcd',
      elementName: 'Nova, the founder',
    });
    // Preview URLs are exactly the noise the projection exists to strip.
    expect(JSON.stringify(projected)).not.toContain('previewUrl');
  });

  it("projects an action node's op and the config the vocabulary told it to write", () => {
    const projected = projectGraphForAgent({
      nodes: [
        {
          id: 'act',
          type: 'action',
          position: { x: 0, y: 0 },
          data: { actionId: 'video.speed', config: { rate: 0.5 }, isExecuting: false },
        },
      ],
      edges: [],
    });
    expect(projected.nodes[0].config).toEqual({ actionId: 'video.speed', config: { rate: 0.5 } });
  });

  it('projects the batch lock, and its items compactly', () => {
    const projected = projectGraphForAgent({
      nodes: [
        {
          id: 'b',
          type: 'batch',
          position: { x: 0, y: 0 },
          data: {
            combine: 'zip',
            itemType: 'text',
            items: [
              { id: 'i1', kind: 'text', value: 'a red sneaker', label: 'one' },
              { id: 'i2', kind: 'text', value: 'a blue sneaker', storagePath: 'brand/x.png' },
            ],
          },
        },
      ],
      edges: [],
    });
    expect(projected.nodes[0].config?.itemType).toBe('text');
    expect(projected.nodes[0].config?.items).toEqual([
      { id: 'i1', kind: 'text', label: 'one', value: 'a red sneaker' },
      { id: 'i2', kind: 'text', value: 'a blue sneaker' },
    ]);
    expect(JSON.stringify(projected)).not.toContain('storagePath');
  });

  it('says so when the item cap engaged rather than serving a silent slice', () => {
    const items = Array.from({ length: 45 }, (_, index) => ({
      id: `i${index}`,
      kind: 'image',
      assetId: `asset-${index}`,
    }));
    const projected = projectGraphForAgent({
      nodes: [{ id: 'b', type: 'batch', position: { x: 0, y: 0 }, data: { items } }],
      edges: [],
    });
    const projectedItems = projected.nodes[0].config?.items as Record<string, unknown>[];
    expect(projectedItems).toHaveLength(21);
    expect(projectedItems.at(-1)).toEqual({ items_omitted: 25 });
  });

  // The whole reason `itemType` is on the whitelist: without it the batch has no output
  // modality, so `connectNodes` finds no compatible handle and the edge is never built.
  // Nothing derives this lock from the wiring the way a router's is derived.
  it('lets a batch reach a generator once itemType is set, and not before', () => {
    const wire = (data: Record<string, unknown>) =>
      buildWorkflowGraph(
        [
          { ref: 'b', type: 'batch', data },
          { ref: 'gen', type: 'nanoGen', data: { positivePrompt: 'a sneaker' } },
        ],
        [{ from_ref: 'b', to_ref: 'gen' }],
      );

    const unlocked = wire({});
    expect(unlocked.errors).toEqual(['no compatible handle from batch to nanoGen']);
    expect(unlocked.graph.edges).toHaveLength(0);

    const locked = wire({ itemType: 'text' });
    expect(locked.errors).toEqual([]);
    expect(locked.graph.edges).toHaveLength(1);
    expect(validateWorkflowGraph(locked.graph).ok).toBe(true);

    // The same lock, arrived at the other way the contracts helper allows.
    const byFirstItem = wire({ items: [{ id: 'i1', kind: 'text', value: 'a sneaker' }] });
    expect(byFirstItem.graph.edges).toHaveLength(1);
  });

  // Widened deliberately and narrowly: a layer document is authored in a dialog and a
  // router's lock is derived from its wiring, so neither has a field an agent can set.
  it('keeps the node types with nothing agent-settable empty', () => {
    // A router's lock is DERIVED from its wiring, so there is nothing to set.
    expect(AGENT_FIELD_WHITELIST.router).toEqual([]);
    expect(AGENT_FIELD_WHITELIST.document).toEqual([]);
    expect(AGENT_FIELD_WHITELIST.element).toContain('elementId');
  });

  // The layer document itself stays editor-owned, exactly like timelineEditor.items —
  // but the frame is a thing an agent can be asked for ("make it 9:16") and must be able
  // to read back, so the node is half-writable rather than invisible.
  it('lets an agent set a layerEditor frame but never its layers', () => {
    expect(AGENT_FIELD_WHITELIST.layerEditor).toEqual(['frameWidth', 'frameHeight', 'aspectRatio']);
    expect(AGENT_FIELD_WHITELIST.layerEditor).not.toContain('layers');
  });

  it('leaves small graphs untruncated', () => {
    expect(projection.truncated).toBeUndefined();
  });
});

// A canvas can grow without bound; the agent's context cannot. The projection
// serves a window, but the counts must keep describing the whole graph.
function oversizedGraph(nodeCount: number, edgeCount: number) {
  return {
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i}`,
      type: 'string',
      position: { x: i, y: i },
      data: { value: `node ${i}` },
    })),
    edges: Array.from({ length: edgeCount }, (_, i) => ({
      id: `e${i}`,
      source: `n${i % nodeCount}`,
      target: `n${(i + 1) % nodeCount}`,
      sourceHandle: 'text',
      targetHandle: 'prompt',
    })),
  };
}

describe('projectGraphForAgent truncation', () => {
  const nodeCount = MAX_PROJECTED_NODES + 25;
  const edgeCount = MAX_PROJECTED_WIRING + 40;
  const projection = projectGraphForAgent(oversizedGraph(nodeCount, edgeCount));

  it('caps the projected nodes and wiring', () => {
    expect(projection.nodes).toHaveLength(MAX_PROJECTED_NODES);
    expect(projection.wiring).toHaveLength(MAX_PROJECTED_WIRING);
  });

  it('still reports the true totals so the agent knows the real graph size', () => {
    expect(projection.node_count).toBe(nodeCount);
    expect(projection.edge_count).toBe(edgeCount);
    expect(projection.node_types).toEqual({ string: nodeCount });
  });

  it('announces exactly what it omitted', () => {
    expect(projection.truncated).toEqual({
      nodes_omitted: nodeCount - MAX_PROJECTED_NODES,
      edges_omitted: edgeCount - MAX_PROJECTED_WIRING,
    });
  });

  it('omits nodes only, never invents them', () => {
    expect(projection.nodes[0].id).toBe('n0');
    expect(projection.nodes.at(-1)?.id).toBe(`n${MAX_PROJECTED_NODES - 1}`);
  });

  it('derives attachments from the projected window, not the whole graph', () => {
    const withAttachments = projectGraphForAgent({
      nodes: Array.from({ length: MAX_PROJECTED_NODES + 5 }, (_, i) => ({
        id: `img${i}`,
        type: 'image',
        position: { x: 0, y: 0 },
        data: { fileName: `f${i}.png`, sourcePath: `b/f${i}.png`, bucket: 'media-library' },
      })),
      edges: [],
    });
    expect(withAttachments.attachments).toHaveLength(MAX_PROJECTED_NODES);
    expect(withAttachments.truncated?.nodes_omitted).toBe(5);
  });

  it('truncates only the axis that overflows', () => {
    const manyNodesFewEdges = projectGraphForAgent(oversizedGraph(MAX_PROJECTED_NODES + 3, 2));
    expect(manyNodesFewEdges.truncated).toEqual({ nodes_omitted: 3, edges_omitted: 0 });
    expect(manyNodesFewEdges.wiring).toHaveLength(2);
  });
});

describe('timeline projection', () => {
  it('compacts timeline items to placement facts the agent can re-emit', () => {
    const projection = projectGraphForAgent({
      nodes: [
        {
          id: 'cut',
          type: 'timelineEditor',
          data: {
            items: [
              { id: 'ti:0', order: 0, sourceNodeId: 'clip-a' },
              {
                id: 'ti:1',
                order: 1,
                sourceNodeId: 'clip-b',
                trimStartSec: 2,
                trimEndSec: 7,
                effects: { filterPreset: 'noir', keyframes: [{ t: 0.5, huge: 'payload' }] },
              },
            ],
          },
        },
      ],
      edges: [],
    });

    const config = projection.nodes[0]?.config;
    expect(config?.items).toEqual([
      { id: 'ti:0', order: 0, sourceNodeId: 'clip-a' },
      {
        id: 'ti:1',
        order: 1,
        sourceNodeId: 'clip-b',
        trimStartSec: 2,
        trimEndSec: 7,
        effects: { filterPreset: 'noir' },
        keyframeCount: 1,
      },
    ]);
    expect(config?.documentFingerprint).toEqual(expect.any(String));
    // The snapshot preserves stable ids and authorable effect settings, while
    // the dedicated editor inspection owns verbose keyframe payloads.
    expect(JSON.stringify(config)).not.toContain('keyframes');
    expect(JSON.stringify(config)).toContain('noir');
  });
});

describe('scoped projection', () => {
  // A chain long enough that hop counts matter: a → b → c → d → e, plus an
  // island node nothing connects to.
  const chain = {
    nodes: ['a', 'b', 'c', 'd', 'e', 'island'].map((id) => ({
      id,
      type: 'string',
      data: { value: `text of ${id}` },
    })),
    edges: [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'text', targetHandle: 'image' },
      { id: 'e2', source: 'b', target: 'c', sourceHandle: 'text', targetHandle: 'image' },
      { id: 'e3', source: 'c', target: 'd', sourceHandle: 'text', targetHandle: 'image' },
      { id: 'e4', source: 'd', target: 'e', sourceHandle: 'text', targetHandle: 'image' },
    ],
  };

  it('selectSubgraph walks N undirected hops and keeps only fully-in-scope edges', () => {
    const scoped = selectSubgraph(chain, ['c'], 1);
    expect(scoped.nodes.map((n) => n.id).sort()).toEqual(['b', 'c', 'd']);
    expect(scoped.edges.map((e) => e.id).sort()).toEqual(['e2', 'e3']);
  });

  it('selectSubgraph ignores focus ids that are not on the canvas', () => {
    const scoped = selectSubgraph(chain, ['ghost', 'a'], 1);
    expect(scoped.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('findNodeIds locates nodes by id, type, label and free text', () => {
    const graph = {
      nodes: [
        { id: 'n1', type: 'plannerDraft', data: { label: 'Ship it' } },
        { id: 'n2', type: 'nanoGen', data: { positivePrompt: 'copper espresso machine' } },
        { id: 'hero-3', type: 'string', data: {} },
      ],
      edges: [],
    };
    expect(findNodeIds(graph, 'planner')).toEqual(['n1']);
    expect(findNodeIds(graph, 'ship')).toEqual(['n1']);
    expect(findNodeIds(graph, 'copper')).toEqual(['n2']);
    expect(findNodeIds(graph, 'hero')).toEqual(['hero-3']);
    expect(findNodeIds(graph, '')).toEqual([]);
  });

  it('scoping keeps WHOLE-graph counts — the viewport never misleads', () => {
    const projection = projectGraphForAgent(chain, { focus: ['c'], hops: 1 });
    expect(projection.node_count).toBe(6);
    expect(projection.edge_count).toBe(4);
    expect(projection.nodes.map((n) => n.id).sort()).toEqual(['b', 'c', 'd']);
    expect(projection.scope).toEqual({ focus: ['c'], hops: 1, nodes_in_scope: 3 });
    // Scoping is not truncation: nothing in the requested scope was dropped.
    expect(projection.truncated).toBeUndefined();
  });

  it('a query scopes without ids, and merges with explicit focus', () => {
    const projection = projectGraphForAgent(chain, { query: 'text of e', hops: 0 });
    expect(projection.nodes.map((n) => n.id)).toEqual(['e']);
    expect(projection.scope?.focus).toEqual(['e']);
  });

  it('empty scope options fall back to the full projection', () => {
    const projection = projectGraphForAgent(chain, { query: 'matches nothing' });
    expect(projection.nodes).toHaveLength(6);
    expect(projection.scope).toBeUndefined();
  });
});

describe('worst-case projection budget', () => {
  it('a maxed-out window stays under 7k tokens', () => {
    // 60 nodes of the chattiest kind (string, free text at the cap, long ids and
    // labels) and 120 wires — the largest projection the ceilings allow. Measured
    // at ~6.4k tokens when this guard landed; the budget pins that reality so a
    // FREE_TEXT_CAP / whitelist / ceiling change that grows it trips loudly. The
    // real mitigation for big canvases is scoped inspection, not a bigger window.
    const nodes = Array.from({ length: MAX_PROJECTED_NODES }, (_, i) => ({
      id: `bench-node-with-a-long-id-${String(i).padStart(3, '0')}`,
      type: 'string',
      data: { value: 'x'.repeat(FREE_TEXT_CAP * 2), label: `A fairly descriptive label ${i}` },
    }));
    const edges = Array.from({ length: MAX_PROJECTED_WIRING }, (_, i) => ({
      id: `e${i}`,
      source: `bench-node-with-a-long-id-${String(i % MAX_PROJECTED_NODES).padStart(3, '0')}`,
      target: `bench-node-with-a-long-id-${String((i + 1) % MAX_PROJECTED_NODES).padStart(3, '0')}`,
      sourceHandle: 'text',
      targetHandle: 'image',
    }));

    const projection = projectGraphForAgent({ nodes, edges });
    const estimatedTokens = Math.ceil(JSON.stringify(projection).length / 4);
    expect(estimatedTokens).toBeLessThan(7000);
  });
});
