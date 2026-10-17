import { describe, expect, test } from 'bun:test';
import type {
  TemplateAuthoringCommand,
  TemplateAuthoringDraft,
  TemplateAuthoringScope,
} from '@continuum/contracts';
import {
  appendLayerDraftCommand,
  commandsFromLayerSnapshot,
  LayerDraftAutosaver,
  layerSnapshotFromCommands,
  TemplateAuthoringDraftError,
} from './layerDraft';
import { layerDraftStorageKey, templateAuthoringWorkspaceIdentity } from './useTemplateAuthoringDraft';

const scope: TemplateAuthoringScope = {
  brandId: '00000000-0000-4000-8000-000000000001',
  assetId: '00000000-0000-4000-8000-000000000002',
  baseVersionId: '00000000-0000-4000-8000-000000000003',
};
const checksum = 'a'.repeat(64);
const edit = (rotation: number): TemplateAuthoringCommand => ({
  type: 'layer.edit',
  nodeId: 'aep:7:31',
  edit: { compId: 7, layerId: 31, rotation },
});
const persistedDraft = (
  revision: number,
  commands: TemplateAuthoringCommand[],
): TemplateAuthoringDraft => ({
  scope,
  sourceChecksum: checksum,
  requiresReconciliation: false,
  currentSource: {
    templateSourceVersionId: scope.baseVersionId,
    templateSourceChecksum: checksum,
    assetHeadVersionId: scope.baseVersionId,
    assetHeadChecksum: checksum,
  },
  revision,
  commands,
  projectedDocument: null,
  updatedAt: '2026-10-11T00:00:00.000Z',
});
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i += 1) await wait(5);
  expect(check()).toBe(true);
}

describe('private layer draft commands', () => {
  test('round-trips precise edits, order, and exposure for reload restoration', () => {
    const snapshot = {
      edits: {
        31: {
          compId: 7,
          layerId: 31,
          position: [12.125, 49.875] as [number, number],
          rotation: -0.03125,
        },
      },
      orders: { 7: [31, 22] },
      nodeOrders: {},
      exposures: { headline: false },
      operations: [],
    };
    const commands = commandsFromLayerSnapshot(snapshot);
    expect(commands[0]).toEqual({
      type: 'layer.edit',
      nodeId: 'aep:7:31',
      edit: snapshot.edits[31],
    });
    const restored = layerSnapshotFromCommands(commands);
    expect(restored.edits).toEqual(snapshot.edits);
    expect(restored.orders).toEqual(snapshot.orders);
    expect(restored.exposures).toEqual(snapshot.exposures);
    expect(restored.operations).toEqual(commands);
    expect(commandsFromLayerSnapshot(restored)).toEqual(commands);
  });

  test('round-trips authored UUID nodes, draft edits, deletes, and complete stable-ID order', () => {
    const createdId = 'draft:11111111-1111-4111-8111-111111111111';
    const duplicateId = 'draft:22222222-2222-4222-8222-222222222222';
    const commands: TemplateAuthoringCommand[] = [
      {
        type: 'text.create', nodeId: createdId, compId: 7, name: 'Headline', text: 'Studio',
        fontRef: { fontId: '33333333-3333-4333-8333-333333333333', postScriptName: 'Studio-Bold', sha256: checksum },
        fontSize: 48, fillColor: [0.2, 0.3, 0.4], position: [30.125, 42.5],
      },
      { type: 'layer.edit', nodeId: createdId, edit: { position: [31.25, 43.75], visible: false } },
      { type: 'layer.duplicate', nodeId: duplicateId, sourceNodeId: createdId, name: 'Headline copy' },
      { type: 'layer.delete', nodeId: 'aep:7:31' },
      { type: 'composition.order', compId: 7, nodeIds: [duplicateId, createdId, 'aep:7:22'] },
      { type: 'exposure.set', slotKey: 'headline', exposed: false },
    ];
    const snapshot = layerSnapshotFromCommands(commands);
    expect(snapshot.edits).toEqual({});
    expect(snapshot.orders).toEqual({});
    expect(snapshot.nodeOrders[7]).toEqual([duplicateId, createdId, 'aep:7:22']);
    expect(snapshot.operations).toEqual(commands);
    expect(commandsFromLayerSnapshot(snapshot)).toEqual(commands);
  });

  test('round-trips create, duplicate, edit and order commands for draft artboards through reload', () => {
    const sourceArtboardId = 'draft:33333333-3333-4333-8333-333333333333';
    const copiedArtboardId = 'draft:44444444-4444-4444-8444-444444444444';
    const firstLayer = 'draft:55555555-5555-4555-8555-555555555555';
    const secondLayer = 'draft:66666666-6666-4666-8666-666666666666';
    const commands: TemplateAuthoringCommand[] = [
      { type: 'artboard.create', artboardId: sourceArtboardId, name: 'Base', width: 1080, height: 1920, frameRate: 30, durationSec: 5 },
      { type: 'shape.create', artboardId: sourceArtboardId, nodeId: firstLayer, shape: 'rectangle', name: 'Base shape',
        position: [540, 960], size: [100, 80], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'artboard.duplicate', artboardId: copiedArtboardId, sourceArtboardId, name: 'Copy' },
      { type: 'shape.create', artboardId: copiedArtboardId, nodeId: secondLayer, shape: 'ellipse', name: 'Copy shape',
        position: [400, 600], size: [60, 45], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'composition.order', artboardId: copiedArtboardId, nodeIds: [firstLayer, secondLayer] },
    ];
    const snapshot = layerSnapshotFromCommands(commands);
    expect(snapshot.operations).toEqual(commands);
    expect(commandsFromLayerSnapshot(snapshot)).toEqual(commands);
  });

  test('round-trips scoped authored mask update and delete commands without changing target identity', () => {
    const commands: TemplateAuthoringCommand[] = [
      { type: 'mask.create', nodeId: 'aep:7:31', draftMaskId: '20000000-0000-4000-8000-000000000031',
        name: 'Inset', shape: 'ellipse', center: [-20.25, 9.5], size: [18, 10], mode: 'subtract', opacity: 82, feather: [1, 2] },
      { type: 'mask.update', nodeId: 'aep:7:31', draftMaskId: '20000000-0000-4000-8000-000000000031', patch: { center: [-14.125, 9.5], opacity: 64 } },
      { type: 'mask.delete', nodeId: 'aep:7:31', draftMaskId: '20000000-0000-4000-8000-000000000031' },
    ];
    const snapshot = layerSnapshotFromCommands(commands);
    expect(commandsFromLayerSnapshot(snapshot)).toEqual(commands);
  });

  test('keeps duplication-time appearance before later source edits and preserves delete order', () => {
    let snapshot = layerSnapshotFromCommands([edit(5)]);
    snapshot = appendLayerDraftCommand(snapshot, {
      type: 'layer.duplicate',
      nodeId: 'draft:10000000-0000-4000-8000-000000000001',
      sourceNodeId: 'aep:7:31',
      name: 'Copy',
    });
    snapshot = appendLayerDraftCommand(snapshot, edit(20));
    snapshot = appendLayerDraftCommand(snapshot, {
      type: 'layer.delete',
      nodeId: 'draft:10000000-0000-4000-8000-000000000001',
    });
    expect(commandsFromLayerSnapshot(snapshot)).toEqual([
      edit(5),
      { type: 'layer.duplicate', nodeId: 'draft:10000000-0000-4000-8000-000000000001', sourceNodeId: 'aep:7:31', name: 'Copy' },
      edit(20),
      { type: 'layer.delete', nodeId: 'draft:10000000-0000-4000-8000-000000000001' },
    ]);
  });

  test('storage keys isolate the signed-in user, brand, template, and pinned source version', () => {
    expect(layerDraftStorageKey('u1', scope)).not.toBe(layerDraftStorageKey('u2', scope));
    expect(layerDraftStorageKey('u1', scope)).not.toBe(
      layerDraftStorageKey('u1', { ...scope, brandId: '00000000-0000-4000-8000-000000000004' }),
    );
    expect(layerDraftStorageKey('u1', scope)).not.toBe(
      layerDraftStorageKey('u1', { ...scope, assetId: '00000000-0000-4000-8000-000000000004' }),
    );
    expect(layerDraftStorageKey('u1', scope)).not.toBe(
      layerDraftStorageKey('u1', {
        ...scope,
        baseVersionId: '00000000-0000-4000-8000-000000000004',
      }),
    );
  });

  test('workspace identity and recovery keys isolate each exact imported package', () => {
    const sourceChecksum = 'a'.repeat(64);
    const packageChecksum = 'b'.repeat(64);
    const seed = {
      kind: 'hyperframes_seed' as const,
      artifactId: '00000000-0000-4000-8000-000000000005',
      packageChecksum,
      sourceRevisionId: '00000000-0000-4000-8000-000000000006',
      sourceHtmlSha256: 'c'.repeat(64),
      extractedSceneSha256: 'd'.repeat(64),
    };
    const sourceIdentity = templateAuthoringWorkspaceIdentity(undefined, sourceChecksum);
    const seedIdentity = templateAuthoringWorkspaceIdentity(seed, sourceChecksum);
    expect(seedIdentity).toContain(packageChecksum);
    expect(seedIdentity).not.toBe(sourceIdentity);
    expect(layerDraftStorageKey('u1', scope, seedIdentity)).not.toBe(
      layerDraftStorageKey('u1', scope, sourceIdentity),
    );
    expect(layerDraftStorageKey('u1', scope, seedIdentity)).not.toBe(
      layerDraftStorageKey('u2', scope, seedIdentity),
    );
  });
});

describe('LayerDraftAutosaver', () => {
  test('new input and undo keep reconciliation locks until an explicit choice', async () => {
    for (const sourceMismatch of [false, true]) {
      let writes = 0;
      const observed: TemplateAuthoringCommand[][] = [];
      const autosaver = new LayerDraftAutosaver({
        scope, revision: 2, persistedCommands: [], delayMs: 1,
        write: async (_scope, revision, commands) => {
          writes += 1;
          return persistedDraft(revision + 1, commands);
        },
        onChange: (_view, commands) => observed.push(commands),
      });
      autosaver.setConflict('Reconcile these snapshots.', sourceMismatch);
      autosaver.update([edit(42)], true);
      await wait(10);
      expect(autosaver.view.status).toBe(sourceMismatch ? 'source-mismatch' : 'conflict');
      expect(observed.at(-1)).toEqual([edit(42)]);
      expect(await autosaver.flush()).toBe(false);
      autosaver.update([]);
      expect(await autosaver.flush()).toBe(false);
      expect(autosaver.view.error).toBe('Reconcile these snapshots.');
      expect(writes).toBe(0);
      autosaver.dispose();
    }
  });

  test('choosing the server copy does not reconcile a changed source', async () => {
    let writes = 0;
    const autosaver = new LayerDraftAutosaver({
      scope, revision: 2, persistedCommands: [],
      write: async (_scope, revision, commands) => {
        writes += 1;
        return persistedDraft(revision + 1, commands);
      },
    });
    autosaver.setConflict('The base source changed.', true);
    autosaver.adoptServerDraft(3, [edit(7)]);
    expect(autosaver.view.status).toBe('source-mismatch');
    expect(autosaver.view.error).toBe('The base source changed.');
    expect(await autosaver.retry()).toBe(false);
    expect(await autosaver.flush()).toBe(false);
    expect(writes).toBe(0);
    autosaver.dispose();
  });

  test('an explicit server choice clears a same-source revision conflict', async () => {
    const writes: number[] = [];
    const autosaver = new LayerDraftAutosaver({
      scope, revision: 2, persistedCommands: [],
      write: async (_scope, revision, commands) => {
        writes.push(revision);
        return persistedDraft(revision + 1, commands);
      },
    });
    autosaver.setConflict('Another editor saved.');
    autosaver.adoptServerDraft(3, [edit(7)]);
    autosaver.update([edit(8)]);
    expect(await autosaver.flush()).toBe(true);
    expect(writes).toEqual([3]);
    autosaver.dispose();
  });

  test('coalesces idle typing and persists once after the idle delay', async () => {
    const writes: Array<{ revision: number; commands: TemplateAuthoringCommand[] }> = [];
    const autosaver = new LayerDraftAutosaver({
      scope,
      revision: 0,
      persistedCommands: [],
      delayMs: 30,
      write: async (_scope, expectedRevision, commands) => {
        writes.push({ revision: expectedRevision, commands });
        return persistedDraft(expectedRevision + 1, commands);
      },
    });
    autosaver.update([edit(1)]);
    await wait(15);
    autosaver.update([edit(2)]);
    await wait(15);
    expect(writes).toHaveLength(0);
    await until(() => writes.length === 1);
    expect(writes[0]).toEqual({ revision: 0, commands: [edit(2)] });
    await until(() => !autosaver.view.dirty);
    expect(autosaver.view.revision).toBe(1);
    autosaver.dispose();
  });

  test('a completed gesture flushes immediately and a newer edit during flight gets the next CAS revision', async () => {
    const first = deferred<TemplateAuthoringDraft>();
    const writes: Array<{ revision: number; commands: TemplateAuthoringCommand[] }> = [];
    const autosaver = new LayerDraftAutosaver({
      scope,
      revision: 0,
      persistedCommands: [],
      delayMs: 500,
      write: (_scope, expectedRevision, commands) => {
        writes.push({ revision: expectedRevision, commands });
        return writes.length === 1
          ? first.promise
          : Promise.resolve(persistedDraft(expectedRevision + 1, commands));
      },
    });
    autosaver.update([edit(10)], true);
    const flushed = autosaver.flush();
    await until(() => writes.length === 1);
    autosaver.update([edit(20)], true);
    first.resolve(persistedDraft(1, [edit(10)]));
    expect(await flushed).toBe(true);
    await until(() => writes.length === 2 && !autosaver.view.dirty);
    expect(writes).toEqual([
      { revision: 0, commands: [edit(10)] },
      { revision: 1, commands: [edit(20)] },
    ]);
    expect(autosaver.view.revision).toBe(2);
    autosaver.dispose();
  });

  test('retry preserves the local commands after a transient failure', async () => {
    let attempts = 0;
    const autosaver = new LayerDraftAutosaver({
      scope,
      revision: 0,
      persistedCommands: [],
      delayMs: 500,
      write: async (_scope, revision, commands) => {
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
        return persistedDraft(revision + 1, commands);
      },
    });
    autosaver.update([edit(3)]);
    expect(await autosaver.flush()).toBe(false);
    expect(autosaver.view.status).toBe('error');
    expect(autosaver.view.dirty).toBe(true);
    expect(await autosaver.retry()).toBe(true);
    expect(attempts).toBe(2);
    expect(autosaver.view.dirty).toBe(false);
    autosaver.dispose();
  });

  test('revision conflicts and stale source conflicts stop retries without losing local edits', async () => {
    for (const [code, status] of [
      ['revision_conflict', 'conflict'],
      ['source_mismatch', 'source-mismatch'],
    ] as const) {
      let attempts = 0;
      const autosaver = new LayerDraftAutosaver({
        scope,
        revision: 2,
        persistedCommands: [],
        delayMs: 500,
        write: async () => {
          attempts += 1;
          throw new TemplateAuthoringDraftError(409, code, code, { currentRevision: 3 });
        },
      });
      autosaver.update([edit(9)]);
      expect(await autosaver.flush()).toBe(false);
      expect(autosaver.view.status).toBe(status);
      expect(autosaver.view.dirty).toBe(true);
      expect(await autosaver.retry()).toBe(false);
      await wait(10);
      expect(attempts).toBe(1);
      autosaver.dispose();
    }
  });
});
