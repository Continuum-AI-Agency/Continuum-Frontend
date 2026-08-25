// The fold is the only thing standing between a collapsed technique and a lost edge,
// so these pin the two claims that matter: the real graph is never touched (which is
// what makes a run over a collapsed module identical to a run over the expanded one),
// and no boundary edge is dropped or left pointing at a handle that does not exist.

import { describe, expect, it } from 'bun:test';
import type { Edge, NodeChange } from '@xyflow/react';

import type { StudioNode } from '../types';
import {
  COLLAPSED_NODE_TYPE,
  collapsedModulePorts,
  collapsedNodeId,
  deriveModulesFromNodes,
  foldCollapsedModules,
  moduleIdForNode,
  resolveFoldedConnection,
  translateFoldedNodeChanges,
  type WorkflowModuleRecord,
} from './moduleFold';

const node = (id: string, type: string, x = 0, y = 0): StudioNode =>
  ({ id, type, position: { x, y }, data: {} }) as unknown as StudioNode;

const edge = (id: string, source: string, target: string, handles?: Partial<Edge>): Edge =>
  ({ id, source, target, ...handles }) as Edge;

const MODULE_A = 'module:aaa';
const MODULE_B = 'module:bbb';

/**
 * Two applied techniques and three un-namespaced nodes, wired so every edge class
 * shows up exactly once: internal, inbound, outbound, cross-module and untouched.
 */
function scene() {
  const nodes: StudioNode[] = [
    node('ref', 'image', 0, 0),
    node(`${MODULE_A}:p`, 'string', 100, 200),
    node(`${MODULE_A}:g`, 'nanoGen', 340, 260),
    node(`${MODULE_B}:g`, 'nanoGen', 700, 260),
    node('sink', 'image', 1000, 0),
    node('lonely', 'note', 0, 900),
  ];
  const edges: Edge[] = [
    edge('internal', `${MODULE_A}:p`, `${MODULE_A}:g`, {
      sourceHandle: 'text',
      targetHandle: 'prompt',
    }),
    edge('inbound', 'ref', `${MODULE_A}:g`, { targetHandle: 'ref-image' }),
    edge('outbound', `${MODULE_A}:g`, 'sink', { sourceHandle: 'image', targetHandle: 'image' }),
    edge('cross', `${MODULE_A}:g`, `${MODULE_B}:g`, {
      sourceHandle: 'image',
      targetHandle: 'ref-image',
    }),
    edge('untouched', 'ref', 'sink', { sourceHandle: 'image', targetHandle: 'image' }),
  ];
  return { nodes, edges };
}

const record = (id: string, nodes: StudioNode[]): WorkflowModuleRecord => ({
  id,
  label: id === MODULE_A ? 'Palette smash-up' : 'Second technique',
  nodeIds: nodes.filter((n) => moduleIdForNode(n.id) === id).map((n) => n.id),
});

describe('moduleIdForNode', () => {
  it('reads the namespace segment and ignores hand-made nodes', () => {
    expect(moduleIdForNode('module:aaa:prompt')).toBe('module:aaa');
    expect(moduleIdForNode('module:aaa:nested:id')).toBe('module:aaa');
    expect(moduleIdForNode('prompt')).toBeUndefined();
    expect(moduleIdForNode('module:aaa')).toBeUndefined();
    expect(moduleIdForNode('module:aaa:')).toBeUndefined();
  });
});

describe('deriveModulesFromNodes', () => {
  it('rebuilds membership off the node ids alone', () => {
    const { nodes } = scene();

    const modules = deriveModulesFromNodes(nodes);

    expect(modules.map((m) => m.id).sort()).toEqual([MODULE_A, MODULE_B]);
    expect(modules.find((m) => m.id === MODULE_A)?.nodeIds).toEqual([
      `${MODULE_A}:p`,
      `${MODULE_A}:g`,
    ]);
    // No label survives a reload; the fallback is named rather than blank.
    expect(modules.every((m) => m.label === 'Technique')).toBe(true);
  });

  it('takes the label from the apply-time record when it is still in memory', () => {
    const { nodes } = scene();

    const modules = deriveModulesFromNodes(nodes, {
      [MODULE_A]: record(MODULE_A, nodes),
    });

    expect(modules.find((m) => m.id === MODULE_A)?.label).toBe('Palette smash-up');
    expect(modules.find((m) => m.id === MODULE_B)?.label).toBe('Technique');
  });
});

describe('collapsedModulePorts', () => {
  it('surfaces edge, open and terminal ports with their types', () => {
    const { nodes, edges } = scene();
    const members = nodes.filter((n) => moduleIdForNode(n.id) === MODULE_B);

    const ports = collapsedModulePorts(members, edges);

    // The cross-module edge lands on ref-image; the generator's own prompt is required
    // and unwired; nothing reads its output, so the image port is terminal.
    expect(ports.inputPorts.map((p) => [p.handleId, p.dataType, p.origin]).sort()).toEqual([
      ['prompt', 'text', 'open'],
      ['ref-image', 'image', 'edge'],
    ]);
    expect(ports.outputPorts.map((p) => [p.handleId, p.dataType, p.origin])).toEqual([
      ['image', 'image', 'terminal'],
    ]);
  });

  it('gives every boundary edge a port even past the 12-port cap', () => {
    // Thirteen outside sources into thirteen distinct handles on one member: the
    // inference keeps 12, and the thirteenth would otherwise re-anchor onto a handle
    // the card never draws, which React Flow drops without a word.
    const member = node(`${MODULE_A}:g`, 'nanoGen', 0, 0);
    const edges = Array.from({ length: 13 }, (_, index) =>
      edge(`e${index}`, `outside-${index}`, member.id, { targetHandle: `slot-${index}` }),
    );

    const ports = collapsedModulePorts([member], edges);

    for (const boundary of edges) {
      const portId = ports.inputIdByRef.get(`${member.id}::${boundary.targetHandle}`);
      expect(portId, `no port for ${boundary.targetHandle}`).toBeDefined();
      expect(ports.inputPorts.some((port) => port.id === portId)).toBe(true);
    }
  });
});

describe('foldCollapsedModules', () => {
  it('returns its inputs by reference when nothing is collapsed', () => {
    const { nodes, edges } = scene();

    const folded = foldCollapsedModules(nodes, edges, []);

    expect(folded.nodes).toBe(nodes);
    expect(folded.edges).toBe(edges);
  });

  it('folds nothing for a record whose nodes are gone', () => {
    const { nodes, edges } = scene();

    const folded = foldCollapsedModules(nodes, edges, [
      { id: 'module:stale', label: 'Gone', nodeIds: ['module:stale:x'] },
    ]);

    expect(folded.nodes).toBe(nodes);
    expect(folded.edges).toBe(edges);
  });

  it('replaces the members with one card at their top-left', () => {
    const { nodes, edges } = scene();

    const folded = foldCollapsedModules(nodes, edges, [record(MODULE_A, nodes)]);

    expect(folded.nodes.map((n) => n.id)).toEqual([
      'ref',
      collapsedNodeId(MODULE_A),
      `${MODULE_B}:g`,
      'sink',
      'lonely',
    ]);
    const card = folded.nodes.find((n) => n.id === collapsedNodeId(MODULE_A));
    expect(card?.type).toBe(COLLAPSED_NODE_TYPE);
    // min(100,340) x min(200,260) — the members' own corner, so expanding puts them
    // back exactly where they were.
    expect(card?.position).toEqual({ x: 100, y: 200 });
    expect(card?.data.memberCount).toBe(2);
    expect(card?.data.label).toBe('Palette smash-up');
  });

  it('drops internal wiring and re-anchors every boundary edge onto a real port', () => {
    const { nodes, edges } = scene();

    const folded = foldCollapsedModules(nodes, edges, [record(MODULE_A, nodes)]);
    const byId = new Map(folded.edges.map((e) => [e.id, e]));
    const card = folded.nodes.find((n) => n.id === collapsedNodeId(MODULE_A));
    const handleIds = new Set([
      ...(card?.data.inputPorts ?? []).map((p) => p.id),
      ...(card?.data.outputPorts ?? []).map((p) => p.id),
    ]);

    // Internal wiring is what the fold is hiding.
    expect(byId.has('internal')).toBe(false);
    // Everything else survives, ids intact.
    expect([...byId.keys()].sort()).toEqual(['cross', 'inbound', 'outbound', 'untouched']);

    expect(byId.get('inbound')).toMatchObject({ source: 'ref', target: collapsedNodeId(MODULE_A) });
    expect(byId.get('outbound')).toMatchObject({
      source: collapsedNodeId(MODULE_A),
      target: 'sink',
    });
    expect(byId.get('untouched')).toBe(edges.find((e) => e.id === 'untouched') as Edge);

    for (const id of ['inbound', 'outbound', 'cross']) {
      const moved = byId.get(id) as Edge;
      const handle =
        moved.source === collapsedNodeId(MODULE_A) ? moved.sourceHandle : moved.targetHandle;
      expect(handleIds.has(handle ?? ''), `${id} points at a handle the card renders`).toBe(true);
    }
  });

  it('re-anchors BOTH ends of an edge between two collapsed modules', () => {
    const { nodes, edges } = scene();

    const folded = foldCollapsedModules(nodes, edges, [
      record(MODULE_A, nodes),
      record(MODULE_B, nodes),
    ]);
    const cross = folded.edges.find((e) => e.id === 'cross') as Edge;

    expect(cross.source).toBe(collapsedNodeId(MODULE_A));
    expect(cross.target).toBe(collapsedNodeId(MODULE_B));

    const cards = new Map(folded.nodes.map((n) => [n.id, n]));
    const sourcePorts = cards.get(collapsedNodeId(MODULE_A))?.data.outputPorts ?? [];
    const targetPorts = cards.get(collapsedNodeId(MODULE_B))?.data.inputPorts ?? [];
    expect(sourcePorts.some((p) => p.id === cross.sourceHandle)).toBe(true);
    expect(targetPorts.some((p) => p.id === cross.targetHandle)).toBe(true);
  });

  it('marks the card selected only when the whole module is', () => {
    const { nodes, edges } = scene();
    const all = nodes.map((n) =>
      moduleIdForNode(n.id) === MODULE_A ? ({ ...n, selected: true } as StudioNode) : n,
    );
    const partial = nodes.map((n) =>
      n.id === `${MODULE_A}:p` ? ({ ...n, selected: true } as StudioNode) : n,
    );

    const allCard = foldCollapsedModules(all, edges, [record(MODULE_A, nodes)]).nodes.find(
      (n) => n.id === collapsedNodeId(MODULE_A),
    );
    const partialCard = foldCollapsedModules(partial, edges, [record(MODULE_A, nodes)]).nodes.find(
      (n) => n.id === collapsedNodeId(MODULE_A),
    );

    expect(allCard?.selected).toBe(true);
    expect(partialCard?.selected).toBe(false);
  });

  it('leaves the real graph byte-equal across a fold/unfold round trip', () => {
    const { nodes, edges } = scene();
    const before = JSON.stringify({ nodes, edges });

    foldCollapsedModules(nodes, edges, [record(MODULE_A, nodes), record(MODULE_B, nodes)]);
    const unfolded = foldCollapsedModules(nodes, edges, []);

    expect(JSON.stringify({ nodes, edges })).toBe(before);
    expect(JSON.stringify({ nodes: unfolded.nodes, edges: unfolded.edges })).toBe(before);
  });
});

describe('translateFoldedNodeChanges', () => {
  const collapsed = () => {
    const { nodes } = scene();
    return [record(MODULE_A, nodes)];
  };

  it('passes changes for real nodes through untouched', () => {
    const { nodes } = scene();
    const changes: NodeChange<StudioNode>[] = [
      { id: 'ref', type: 'position', position: { x: 5, y: 5 } },
    ];

    const result = translateFoldedNodeChanges(changes, nodes, collapsed());

    expect(result.changes).toBe(changes);
    expect(result.nodes).toBeNull();
  });

  it('turns a card drag into the same translation on every member', () => {
    const { nodes } = scene();
    const changes: NodeChange<StudioNode>[] = [
      { id: collapsedNodeId(MODULE_A), type: 'position', position: { x: 150, y: 220 } },
    ];

    const result = translateFoldedNodeChanges(changes, nodes, collapsed());
    const moved = new Map((result.nodes ?? []).map((n) => [n.id, n.position]));

    // The card sat on (100,200); +50/+20 moves both members and nothing else.
    expect(moved.get(`${MODULE_A}:p`)).toEqual({ x: 150, y: 220 });
    expect(moved.get(`${MODULE_A}:g`)).toEqual({ x: 390, y: 280 });
    expect(moved.get('ref')).toEqual({ x: 0, y: 0 });
    expect(result.changes).toEqual([]);
  });

  it('fans selection out to the members', () => {
    const { nodes } = scene();

    const result = translateFoldedNodeChanges(
      [{ id: collapsedNodeId(MODULE_A), type: 'select', selected: true }],
      nodes,
      collapsed(),
    );

    const selected = (result.nodes ?? []).filter((n) => n.selected).map((n) => n.id);
    expect(selected).toEqual([`${MODULE_A}:p`, `${MODULE_A}:g`]);
  });

  it('deletes the whole module when the card is removed', () => {
    const { nodes } = scene();

    const result = translateFoldedNodeChanges(
      [{ id: collapsedNodeId(MODULE_A), type: 'remove' }],
      nodes,
      collapsed(),
    );

    expect((result.nodes ?? []).map((n) => n.id)).toEqual([
      'ref',
      `${MODULE_B}:g`,
      'sink',
      'lonely',
    ]);
  });

  it('passes an add change through — that union variant carries an item, not an id', () => {
    const { nodes } = scene();
    const changes = [
      { type: 'add', item: node('fresh', 'note', 10, 10) },
    ] as NodeChange<StudioNode>[];

    const result = translateFoldedNodeChanges(changes, nodes, collapsed());

    expect(result.changes).toBe(changes);
    expect(result.nodes).toBeNull();
  });

  it('consumes card dimensions rather than writing them onto members', () => {
    const { nodes } = scene();

    const result = translateFoldedNodeChanges(
      [
        {
          id: collapsedNodeId(MODULE_A),
          type: 'dimensions',
          dimensions: { width: 240, height: 120 },
        },
      ],
      nodes,
      collapsed(),
    );

    expect(result.changes).toEqual([]);
    expect(result.nodes).toBeNull();
  });
});

describe('resolveFoldedConnection', () => {
  const collapsed = () => {
    const { nodes } = scene();
    return [record(MODULE_A, nodes)];
  };

  it('leaves a connection between two real nodes alone', () => {
    const { nodes, edges } = scene();
    const connection = { source: 'ref', sourceHandle: 'image', target: 'sink', targetHandle: 'image' };

    expect(resolveFoldedConnection(connection, nodes, edges, collapsed())).toBe(connection);
  });

  it('rewrites a card port onto the member node behind it', () => {
    const { nodes, edges } = scene();
    const ports = collapsedModulePorts(
      nodes.filter((n) => moduleIdForNode(n.id) === MODULE_A),
      edges,
    );
    const inbound = ports.inputPorts.find((p) => p.handleId === 'ref-image');
    const outbound = ports.outputPorts.find((p) => p.handleId === 'image');

    const intoModule = resolveFoldedConnection(
      { source: 'ref', sourceHandle: 'image', target: collapsedNodeId(MODULE_A), targetHandle: inbound?.id },
      nodes,
      edges,
      collapsed(),
    );
    const outOfModule = resolveFoldedConnection(
      { source: collapsedNodeId(MODULE_A), sourceHandle: outbound?.id, target: 'sink', targetHandle: 'image' },
      nodes,
      edges,
      collapsed(),
    );

    expect(intoModule).toEqual({
      source: 'ref',
      sourceHandle: 'image',
      target: `${MODULE_A}:g`,
      targetHandle: 'ref-image',
    });
    expect(outOfModule).toEqual({
      source: `${MODULE_A}:g`,
      sourceHandle: 'image',
      target: 'sink',
      targetHandle: 'image',
    });
  });

  it('leaves a port id it does not recognise untouched rather than guessing', () => {
    const { nodes, edges } = scene();
    const connection = {
      source: 'ref',
      sourceHandle: 'image',
      target: collapsedNodeId(MODULE_A),
      targetHandle: 'in-99',
    };

    expect(resolveFoldedConnection(connection, nodes, edges, collapsed())).toBe(connection);
  });
});
