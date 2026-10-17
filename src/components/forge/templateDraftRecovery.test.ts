import { describe, expect, test } from 'bun:test';
import type { TemplateAuthoringCommand, TemplateAuthoringScope } from '@continuum/contracts';
import { compareTemplateDrafts } from './templateDraftComparison';
import {
  listTemplateDraftRecoveries,
  readTemplateAuthoringViewState,
  saveTemplateAuthoringViewState,
  saveTemplateDraftRecovery,
  templateAuthoringViewStateKey,
} from './templateDraftRecovery';

const scope: TemplateAuthoringScope = {
  brandId: '00000000-0000-4000-8000-000000000001',
  assetId: '00000000-0000-4000-8000-000000000002',
  baseVersionId: '00000000-0000-4000-8000-000000000003',
};

describe('private draft recovery', () => {
  test('reports clear layer, property, order, and exposure differences', () => {
    const local: TemplateAuthoringCommand[] = [
      { type: 'layer.edit', nodeId: 'aep:7:31', edit: { compId: 7, layerId: 31, rotation: 15, visible: false } },
      { type: 'composition.order', compId: 7, layerIds: [31, 32] },
      { type: 'exposure.set', slotKey: 'headline', exposed: true },
    ];
    const server: TemplateAuthoringCommand[] = [
      { type: 'layer.edit', nodeId: 'aep:7:31', edit: { compId: 7, layerId: 31, rotation: 0, visible: true } },
      { type: 'composition.order', compId: 7, layerIds: [32, 31] },
      { type: 'exposure.set', slotKey: 'headline', exposed: false },
    ];
    expect(compareTemplateDrafts(local, server, new Map([['aep:7:31', 'Title']]))).toEqual([
      { label: 'Title · Rotation', local: '15', server: '0' },
      { label: 'Title · Visibility', local: 'Hidden', server: 'Shown' },
      { label: 'Composition 7 · Layer order', local: 'Title, Layer 32', server: 'Layer 32, Title' },
      { label: 'Exposure · headline', local: 'Shown', server: 'Hidden' },
    ]);
  });

  test('reports unavailable IndexedDB instead of treating recovery as saved', async () => {
    const original = globalThis.indexedDB;
    // Bun's component-test environment has no browser IndexedDB by default.
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    try {
      await expect(listTemplateDraftRecoveries('user', scope)).rejects.toThrow('Private recovery storage is unavailable');
      await expect(saveTemplateDraftRecovery({
        id: 'snapshot', userId: 'user', scope, sourceChecksum: 'a'.repeat(64), revision: 0,
        commands: [], persistedCommands: [], savedAt: new Date().toISOString(), reason: 'local',
      })).rejects.toThrow('Private recovery storage is unavailable');
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: original });
    }
  });

  test('persists editor view by actor, source scope, and exact workspace package identity', async () => {
    const original = globalThis.indexedDB;
    const stores = new Map<string, Map<IDBValidKey, unknown>>();
    const database = {
      objectStoreNames: { contains: (name: string) => stores.has(name) },
      createObjectStore(name: string) { stores.set(name, new Map()); return {}; },
      close() {},
      transaction(name: string) {
        const transaction = {
          oncomplete: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onabort: null as (() => void) | null,
        };
        const store = stores.get(name)!;
        const request = <T,>(result: T) => {
          const req = { result, error: null, onsuccess: null as (() => void) | null, onerror: null };
          queueMicrotask(() => { req.onsuccess?.(); transaction.oncomplete?.(); });
          return req;
        };
        return Object.assign(transaction, {
          objectStore: () => ({
            get: (key: IDBValidKey) => request(store.get(key)),
            put(value: { id?: IDBValidKey }) { if (value.id !== undefined) store.set(value.id, structuredClone(value)); return request(value.id); },
          }),
        });
      },
    };
    const fakeIndexedDb = {
      open() {
        const request = { result: database, error: null, onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null };
        queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); });
        return request;
      },
    } as unknown as IDBFactory;
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fakeIndexedDb });
    try {
      const workspaceIdentity = 'hyperframes_seed:seed-a:package-a';
      const state = {
        userId: 'actor-a', scope, workspaceIdentity, compositionKey: 'draft:board-a',
        selectedNodeId: 'draft:layer-a', playheadSec: 2.25, updatedAt: '2026-10-12T00:00:00.000Z',
      };
      expect(templateAuthoringViewStateKey('actor-a', scope, workspaceIdentity)).not.toBe(
        templateAuthoringViewStateKey('actor-b', scope, workspaceIdentity),
      );
      await saveTemplateAuthoringViewState(state);
      expect(await readTemplateAuthoringViewState('actor-a', scope, workspaceIdentity)).toMatchObject(state);
      expect(await readTemplateAuthoringViewState('actor-a', scope, 'hyperframes_seed:seed-b:package-b')).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: original });
    }
  });
});
