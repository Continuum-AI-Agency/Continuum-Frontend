import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type {
  TemplateAuthoringCommand,
  TemplateAuthoringDocument,
  TemplateAuthoringDraft,
  TemplateAuthoringScope,
} from '@continuum/contracts';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { listTemplateDraftRecoveries } from './templateDraftRecovery';

const scope: TemplateAuthoringScope = {
  brandId: '00000000-0000-4000-8000-000000000001',
  assetId: '00000000-0000-4000-8000-000000000002',
  baseVersionId: '00000000-0000-4000-8000-000000000003',
};
const checksum = 'a'.repeat(64);
const document: TemplateAuthoringDocument = {
  scope, sourceChecksum: checksum, workspacePackage: { kind: 'pinned_source', packageChecksum: checksum },
} as TemplateAuthoringDocument;
const draft = (revision: number, commands: TemplateAuthoringCommand[] = []): TemplateAuthoringDraft => ({
  scope, sourceChecksum: checksum, revision, commands, updatedAt: new Date().toISOString(),
  requiresReconciliation: false,
  currentSource: {
    templateSourceVersionId: scope.baseVersionId, templateSourceChecksum: checksum,
    assetHeadVersionId: scope.baseVersionId, assetHeadChecksum: checksum,
  },
  projectedDocument: document,
});
const edit: TemplateAuthoringCommand = {
  type: 'layer.edit', nodeId: 'aep:7:31', edit: { compId: 7, layerId: 31, rotation: 15 },
};
const emptyCommands: TemplateAuthoringCommand[] = [];
const noopRestore = () => {};

let currentDraft: TemplateAuthoringDraft | null = null;
const fetchDraft = mock(async () => currentDraft);
mock.module('@/lib/library/templateSources', () => ({
  fetchTemplateAuthoringDocument: mock(async () => document),
  fetchTemplateAuthoringDraft: fetchDraft,
  fetchTemplateAuthoringUserId: mock(async () => 'actor-a'),
  putTemplateAuthoringDraft: mock(async (_assetId: string, request: { expectedRevision: number; commands: TemplateAuthoringCommand[] }) => {
    currentDraft = draft(request.expectedRevision + 1, request.commands);
    return currentDraft;
  }),
}));
const { useTemplateAuthoringDraft } = await import('./useTemplateAuthoringDraft');

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  closed = false;
  constructor(readonly name: string) { FakeBroadcastChannel.instances.push(this); }
  postMessage(data: unknown) {
    for (const peer of FakeBroadcastChannel.instances) {
      if (!peer.closed && peer !== this && peer.name === this.name) peer.onmessage?.({ data } as MessageEvent<unknown>);
    }
  }
  close() { this.closed = true; }
}

function installIndexedDb() {
  const stores = new Map<string, Map<IDBValidKey, unknown>>();
  const database = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore(name: string) { stores.set(name, new Map()); return {}; },
    close() {},
    transaction(name: string) {
      const store = stores.get(name)!;
      const tx = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => ({
          get: (key: IDBValidKey) => request(store.get(key)),
          getAll: () => request([...store.values()]),
          put: (value: { id?: IDBValidKey }, key?: IDBValidKey) => {
            const id = key ?? value.id;
            if (id !== undefined) store.set(id, structuredClone(value));
            return request(id);
          },
          delete: (key: IDBValidKey) => { store.delete(key); return request(undefined); },
        }),
      };
      function request<T>(result: T) {
        const req = { result, error: null, onsuccess: null as (() => void) | null, onerror: null };
        queueMicrotask(() => { req.onsuccess?.(); tx.oncomplete?.(); });
        return req;
      }
      return tx;
    },
  };
  return {
    open() {
      const req = { result: database, error: null, onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null };
      queueMicrotask(() => { req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  } as unknown as IDBFactory;
}

const originals = { indexedDB: globalThis.indexedDB, BroadcastChannel: globalThis.BroadcastChannel };
beforeEach(() => {
  currentDraft = null;
  fetchDraft.mockClear();
  FakeBroadcastChannel.instances = [];
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: installIndexedDb() });
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: FakeBroadcastChannel });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originals.indexedDB });
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: originals.BroadcastChannel });
});

describe('mounted authoring draft tab sync', () => {
  test('a clean tab reloads the server draft after a peer save message', async () => {
    const { result } = renderHook(() => useTemplateAuthoringDraft({ scope, enabled: true, commands: emptyCommands, onRestore: noopRestore }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.userId).toBe('actor-a');
    expect(globalThis.BroadcastChannel).toBe(FakeBroadcastChannel);
    await waitFor(() => expect(FakeBroadcastChannel.instances).toHaveLength(1));
    expect(result.current.revision).toBe(0);

    currentDraft = draft(1, [edit]);
    const peer = new FakeBroadcastChannel(FakeBroadcastChannel.instances[0]!.name);
    await act(async () => peer.postMessage({ tabId: 'peer-tab', revision: 1 }));

    await waitFor(() => expect(result.current.revision).toBe(1));
    expect(fetchDraft).toHaveBeenCalledTimes(2);
  });

  test('a dirty tab records its command and stays in explicit conflict after a peer save', async () => {
    const { result } = renderHook(() => useTemplateAuthoringDraft({ scope, enabled: true, commands: emptyCommands, onRestore: noopRestore }));
    await waitFor(() => expect(FakeBroadcastChannel.instances).toHaveLength(1));
    const tab = FakeBroadcastChannel.instances[0]!;
    const peer = new FakeBroadcastChannel(tab.name);
    act(() => result.current.update([edit]));
    await act(async () => peer.postMessage({ tabId: 'peer-tab', revision: 1 }));

    await waitFor(() => expect(result.current.status).toBe('conflict'));
    const recoveries = await listTemplateDraftRecoveries('actor-a', scope);
    expect(recoveries.some((recovery) => recovery.commands.some((command) => JSON.stringify(command) === JSON.stringify(edit)))).toBe(true);
    expect(fetchDraft).toHaveBeenCalledTimes(2);
    expect(result.current.error).toContain('Another tab saved a newer draft');
  });
});
