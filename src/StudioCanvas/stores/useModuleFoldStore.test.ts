// The claim this file exists to prove: collapsing a technique changes what you SEE and
// nothing about what RUNS. `executeWorkflow` opens with `useStudioStore.getState()` and
// scopes with `buildDependencyGraph`, so pinning those two against a real collapse is
// the run-equivalence anchor — not a re-implementation of the executor's own walk.

import { beforeEach, describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';

import type { StudioNode } from '../types';
import { buildDependencyGraph } from '../utils/buildDependencyGraph';
import { computeReadyNodeIds } from '../utils/edgeStyling';
import { collapsedNodeId, foldCollapsedModules, moduleIdForNode } from '../utils/moduleFold';
import { useModuleFoldStore } from './useModuleFoldStore';
import { useStudioStore } from './useStudioStore';

const MODULE_A = 'module:aaa';

const node = (id: string, type: string, x = 0, y = 0): StudioNode =>
  ({ id, type, position: { x, y }, data: {} }) as unknown as StudioNode;

const nodes: StudioNode[] = [
  node('ref', 'image', 0, 0),
  node(`${MODULE_A}:p`, 'string', 100, 200),
  node(`${MODULE_A}:g`, 'nanoGen', 340, 260),
  node('sink', 'nanoGen', 900, 0),
];

const edges: Edge[] = [
  {
    id: 'internal',
    source: `${MODULE_A}:p`,
    target: `${MODULE_A}:g`,
    sourceHandle: 'text',
    targetHandle: 'prompt',
  } as Edge,
  { id: 'inbound', source: 'ref', target: `${MODULE_A}:g`, targetHandle: 'ref-image' } as Edge,
  {
    id: 'outbound',
    source: `${MODULE_A}:g`,
    target: 'sink',
    sourceHandle: 'image',
    targetHandle: 'ref-image',
  } as Edge,
];

const moduleRecord = {
  id: MODULE_A,
  label: 'Palette smash-up',
  nodeIds: nodes.filter((n) => moduleIdForNode(n.id) === MODULE_A).map((n) => n.id),
};

/** A stand-in executor: walks the same order the real one derives, counting nodes. */
function runCounting(): { order: string[]; invocations: number } {
  const state = useStudioStore.getState();
  const { executionOrder } = buildDependencyGraph(state.nodes, state.edges);
  const order: string[] = [];
  for (const nodeId of executionOrder) order.push(nodeId);
  return { order, invocations: order.length };
}

describe('useModuleFoldStore', () => {
  beforeEach(() => {
    useModuleFoldStore.getState().reset();
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);
  });

  it('collapses and expands idempotently', () => {
    const { collapseModule, expandModule } = useModuleFoldStore.getState();

    collapseModule(MODULE_A);
    collapseModule(MODULE_A);
    expect(useModuleFoldStore.getState().collapsedModuleIds).toEqual([MODULE_A]);

    expandModule(MODULE_A);
    expandModule(MODULE_A);
    expect(useModuleFoldStore.getState().collapsedModuleIds).toEqual([]);
  });

  it('keeps the apply-time record for its label', () => {
    useModuleFoldStore.getState().registerModule(moduleRecord);

    expect(useModuleFoldStore.getState().modules[MODULE_A]).toEqual(moduleRecord);
  });

  it('writes nothing into the graph the runtime reads', () => {
    const before = JSON.stringify({
      nodes: useStudioStore.getState().nodes,
      edges: useStudioStore.getState().edges,
    });

    useModuleFoldStore.getState().registerModule(moduleRecord);
    useModuleFoldStore.getState().collapseModule(MODULE_A);
    const whileCollapsed = JSON.stringify({
      nodes: useStudioStore.getState().nodes,
      edges: useStudioStore.getState().edges,
    });
    useModuleFoldStore.getState().expandModule(MODULE_A);

    expect(whileCollapsed).toBe(before);
    expect(
      JSON.stringify({
        nodes: useStudioStore.getState().nodes,
        edges: useStudioStore.getState().edges,
      }),
    ).toBe(before);
  });

  it('runs identically collapsed and expanded', () => {
    // Both baselines are read back OUT of the store: setEdges normalizes, so the
    // arrays this file declares are not what the runtime would have seen.
    const seeded = useStudioStore.getState();
    const expanded = runCounting();
    const expandedReady = [...computeReadyNodeIds(seeded.nodes, seeded.edges)].sort();
    const expandedDeps = JSON.stringify([
      ...buildDependencyGraph(seeded.nodes, seeded.edges).dependencies.entries(),
    ]);

    useModuleFoldStore.getState().registerModule(moduleRecord);
    useModuleFoldStore.getState().collapseModule(MODULE_A);

    const collapsed = runCounting();
    const state = useStudioStore.getState();
    const collapsedReady = [...computeReadyNodeIds(state.nodes, state.edges)].sort();
    const collapsedDeps = JSON.stringify([
      ...buildDependencyGraph(state.nodes, state.edges).dependencies.entries(),
    ]);

    expect(collapsed.invocations).toBe(expanded.invocations);
    expect(collapsed.order).toEqual(expanded.order);
    expect(collapsedReady).toEqual(expandedReady);
    expect(collapsedDeps).toBe(expandedDeps);
    // …and the members really were folded out of sight, so the assertions above are
    // not passing because nothing happened.
    const folded = foldCollapsedModules(state.nodes, state.edges, [moduleRecord]);
    expect(folded.nodes.map((n) => n.id)).toContain(collapsedNodeId(MODULE_A));
    expect(folded.nodes.map((n) => n.id)).not.toContain(`${MODULE_A}:g`);
    expect(collapsed.order).toContain(`${MODULE_A}:g`);
  });
});
