import { describe, expect, it } from 'bun:test';

import {
  buildCanvasRunResult,
  classifyNodeKind,
  type RunNode,
  type RunRequestStore,
  resolveRunNodeIds,
  runCanvasRequest,
} from './canvasRunRequests';

function makeStore(claimResult: boolean) {
  const calls = {
    claim: [] as string[],
    done: [] as Array<{ id: string; result: unknown }>,
    error: [] as Array<{ id: string; error: string }>,
  };
  const store: RunRequestStore = {
    async claim(id) {
      calls.claim.push(id);
      return claimResult;
    },
    async markDone(id, result) {
      calls.done.push({ id, result });
    },
    async markError(id, error) {
      calls.error.push({ id, error });
    },
  };
  return { store, calls };
}

const nodes: RunNode[] = [
  { id: 'prompt', type: 'string', data: { value: 'a red sneaker' } },
  { id: 'img', type: 'nanoGen', data: { generatedImageUrl: 'https://signed/img.png' } },
  { id: 'vid', type: 'veoFast', data: { generatedVideoStoragePath: 'b/vid.mp4' } },
  { id: 'broken', type: 'nanoGen', data: { error: 'model refused' } },
];

describe('classifyNodeKind', () => {
  it('classifies by produced media, falling back to text', () => {
    expect(classifyNodeKind(nodes[0])).toBe('text');
    expect(classifyNodeKind(nodes[1])).toBe('image');
    expect(classifyNodeKind(nodes[2])).toBe('video');
    expect(classifyNodeKind({ id: 'empty', type: 'nanoGen', data: {} })).toBeNull();
  });
});

describe('resolveRunNodeIds', () => {
  it('returns the requested subset filtered to existing nodes', () => {
    expect(resolveRunNodeIds(nodes, ['img', 'ghost'])).toEqual(['img']);
  });

  it('returns every runnable node when no subset is requested', () => {
    expect(resolveRunNodeIds(nodes, null).sort()).toEqual(['broken', 'img', 'prompt', 'vid']);
  });
});

describe('buildCanvasRunResult', () => {
  it('summarizes outputs and failures, omitting media payloads', () => {
    const result = buildCanvasRunResult(nodes, ['prompt', 'img', 'vid', 'broken']);
    expect(result.executed_node_ids).toEqual(['prompt', 'img', 'vid', 'broken']);
    expect(result.outputs).toEqual([
      { node_id: 'prompt', kind: 'text' },
      { node_id: 'img', kind: 'image' },
      { node_id: 'vid', kind: 'video' },
    ]);
    expect(result.failed).toEqual([{ node_id: 'broken', error: 'model refused' }]);
  });

  it('omits the failed key when nothing failed', () => {
    const result = buildCanvasRunResult(nodes, ['img']);
    expect(result.failed).toBeUndefined();
  });
});

describe('runCanvasRequest', () => {
  const baseParams = {
    runRequestId: 'run-1',
    roomId: 'room-1',
    brandId: 'brand-1',
    getNodes: () => nodes,
  };

  it('skips execution when the request is already claimed by another client', async () => {
    const { store, calls } = makeStore(false);
    const executed: unknown[] = [];
    await runCanvasRequest({
      ...baseParams,
      store,
      requestedNodeIds: null,
      execute: async (opts) => {
        executed.push(opts);
      },
    });
    expect(calls.claim).toEqual(['run-1']);
    expect(executed).toHaveLength(0);
    expect(calls.done).toHaveLength(0);
    expect(calls.error).toHaveLength(0);
  });

  it('runs the full graph once and marks done with a summary', async () => {
    const { store, calls } = makeStore(true);
    const executed: Array<{ targetNodeId?: string }> = [];
    await runCanvasRequest({
      ...baseParams,
      store,
      requestedNodeIds: null,
      execute: async (opts) => {
        executed.push(opts);
      },
    });
    expect(executed).toEqual([{ targetNodeId: undefined, roomId: 'room-1', brandId: 'brand-1' }]);
    expect(calls.done).toHaveLength(1);
    expect(calls.done[0].id).toBe('run-1');
  });

  it('runs each requested node with a targetNodeId', async () => {
    const { store, calls } = makeStore(true);
    const targets: Array<string | undefined> = [];
    await runCanvasRequest({
      ...baseParams,
      store,
      requestedNodeIds: ['img', 'vid'],
      execute: async (opts) => {
        targets.push(opts.targetNodeId);
      },
    });
    expect(targets).toEqual(['img', 'vid']);
    expect(calls.done).toHaveLength(1);
  });

  it('marks error when execution throws', async () => {
    const { store, calls } = makeStore(true);
    await runCanvasRequest({
      ...baseParams,
      store,
      requestedNodeIds: null,
      execute: async () => {
        throw new Error('generation exploded');
      },
    });
    expect(calls.done).toHaveLength(0);
    expect(calls.error).toEqual([{ id: 'run-1', error: 'generation exploded' }]);
  });
});

describe('resolveRunNodeIds — registry-derived runnable set', () => {
  // The three types that produced media, executed, and were missing from the old
  // hand-written list, so an MCP run summary never mentioned them.
  it('summarizes the reconciled generator types', () => {
    const nodes: RunNode[] = [
      { id: 'omni', type: 'omniGen', data: {} },
      { id: 'hyper', type: 'hyperframesAgent', data: {} },
      { id: 'frame', type: 'frameExtract', data: {} },
    ];
    expect(resolveRunNodeIds(nodes, null).sort()).toEqual(['frame', 'hyper', 'omni']);
  });

  it('summarizes the Canvas V3 runtime types', () => {
    const nodes: RunNode[] = [
      { id: 'act', type: 'action', data: {} },
      { id: 'route', type: 'router', data: {} },
      { id: 'bat', type: 'batch', data: {} },
    ];
    expect(resolveRunNodeIds(nodes, null).sort()).toEqual(['act', 'bat', 'route']);
  });

  it('leaves reference and annotation nodes out — they never run', () => {
    const nodes: RunNode[] = [
      { id: 'img', type: 'image', data: {} },
      { id: 'note', type: 'note', data: {} },
      { id: 'el', type: 'element', data: {} },
      { id: 'design', type: 'designRef', data: {} },
      { id: 'publish', type: 'organicPublish', data: {} },
    ];
    expect(resolveRunNodeIds(nodes, null)).toEqual([]);
  });
});
