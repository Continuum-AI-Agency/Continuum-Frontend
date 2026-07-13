import { describe, expect, it } from 'bun:test';
import { type CanvasGraphStore, CanvasSeedConflictError, seedCanvasGraph } from './canvasSeeding';
import type { CanvasTemplateGraph, PersistedGraph } from './canvasTemplates';

const seed: CanvasTemplateGraph = {
  nodes: [
    {
      id: 'library-seed-ref',
      type: 'image',
      position: { x: 0, y: 0 },
      data: { bucket: 'media-library', sourcePath: 'a/b.png' },
      style: { width: 208, height: 208 },
    },
    {
      id: 'library-seed-gen',
      type: 'nanoGen',
      position: { x: 620, y: 0 },
      data: { brandBookPieces: ['full'] },
      style: { width: 400, height: 400 },
    },
  ],
  edges: [
    {
      id: 'e-library-seed-ref-library-seed-gen-ref',
      source: 'library-seed-ref',
      sourceHandle: 'image',
      target: 'library-seed-gen',
      targetHandle: 'ref-image',
      type: 'dataType',
      data: { dataType: 'image', pathType: 'bezier' },
    },
  ],
};

// A canvas_sessions row with a revision the writer must match, plus a hook to let a
// test simulate another writer landing between the read and the write.
class FakeCanvasStore implements CanvasGraphStore {
  graph: PersistedGraph;
  revision: number | null;
  reads = 0;
  writes = 0;
  inserts = 0;
  onRead?: () => void;

  constructor(graph: PersistedGraph, revision: number | null) {
    this.graph = graph;
    this.revision = revision;
  }

  async read(): Promise<{ graph: PersistedGraph; revision: number | null }> {
    this.reads += 1;
    const snapshot = { graph: this.graph, revision: this.revision };
    this.onRead?.();
    return snapshot;
  }

  async insert(_roomId: string, graph: PersistedGraph): Promise<boolean> {
    this.inserts += 1;
    if (this.revision !== null) return false;
    this.graph = graph;
    this.revision = 1;
    return true;
  }

  async update(_roomId: string, graph: PersistedGraph, expectedRevision: number): Promise<boolean> {
    this.writes += 1;
    if (this.revision !== expectedRevision) return false;
    this.graph = graph;
    this.revision = expectedRevision + 1;
    return true;
  }
}

describe('seedCanvasGraph', () => {
  it('appends the seed to an existing graph without dropping the user work', async () => {
    const store = new FakeCanvasStore(
      { nodes: [{ id: 'user-node' }], edges: [{ id: 'user-edge' }] },
      7,
    );

    const { graph, attempts } = await seedCanvasGraph(store, 'room-1', seed);

    expect(attempts).toBe(1);
    expect(graph.nodes.map((n) => (n as { id: string }).id)).toEqual([
      'user-node',
      'library-seed-ref',
      'library-seed-gen',
    ]);
    expect(graph.edges).toHaveLength(2);
    expect(store.revision).toBe(8);
    expect(store.graph).toEqual(graph);
  });

  it('inserts the row when the room has no canvas_sessions row yet', async () => {
    const store = new FakeCanvasStore({ nodes: [], edges: [] }, null);

    const { graph } = await seedCanvasGraph(store, 'room-1', seed);

    expect(store.inserts).toBe(1);
    expect(store.writes).toBe(0);
    expect(graph.nodes).toHaveLength(2);
  });

  it('re-reads and re-applies the seed when another writer wins the revision race', async () => {
    const store = new FakeCanvasStore({ nodes: [{ id: 'user-node' }], edges: [] }, 3);

    // The user saves a new node between our read and our write, exactly once.
    store.onRead = () => {
      store.graph = { nodes: [{ id: 'user-node' }, { id: 'raced-node' }], edges: [] };
      store.revision = 4;
      store.onRead = undefined;
    };

    const { graph, attempts } = await seedCanvasGraph(store, 'room-1', seed);

    expect(attempts).toBe(2);
    expect(store.reads).toBe(2);
    // The seed replayed against the graph that won — the raced node survived.
    expect(graph.nodes.map((n) => (n as { id: string }).id)).toEqual([
      'user-node',
      'raced-node',
      'library-seed-ref',
      'library-seed-gen',
    ]);
    expect(store.revision).toBe(5);
  });

  it('gives up with a conflict error when the canvas never settles', async () => {
    const store = new FakeCanvasStore({ nodes: [], edges: [] }, 1);
    // Every read is immediately invalidated by another writer.
    store.onRead = () => {
      store.revision = (store.revision ?? 0) + 1;
    };

    await expect(seedCanvasGraph(store, 'room-1', seed, 3)).rejects.toBeInstanceOf(
      CanvasSeedConflictError,
    );
    expect(store.reads).toBe(3);
  });
});
