import type { TemplateAuthoringCommand, TemplateAuthoringScope } from '@continuum/contracts';

export type TemplateDraftRecovery = {
  id: string;
  userId: string;
  scope: TemplateAuthoringScope;
  /** Exact editable package identity; absent only on recovery rows written by older clients. */
  workspaceIdentity?: string;
  sourceChecksum: string;
  revision: number;
  commands: TemplateAuthoringCommand[];
  persistedCommands: TemplateAuthoringCommand[];
  savedAt: string;
  reason: 'local' | 'conflict' | 'source-change';
  serverRevision?: number;
  serverCommands?: TemplateAuthoringCommand[];
};

const DB_NAME = 'continuum-forge-private-drafts';
const STORE = 'recoveries';
const VIEW_STORE = 'views';
const queues = new Map<string, Promise<unknown>>();

export const templateDraftScopeKey = (userId: string, scope: TemplateAuthoringScope) =>
  `${userId}:${scope.brandId}:${scope.assetId}:${scope.baseVersionId}`;

export type TemplateAuthoringViewState = {
  userId: string;
  scope: TemplateAuthoringScope;
  workspaceIdentity: string;
  compositionKey: string;
  selectedNodeId: string | null;
  playheadSec: number;
  updatedAt: string;
};

export const templateAuthoringViewStateKey = (
  userId: string,
  scope: TemplateAuthoringScope,
  workspaceIdentity: string,
) => `${templateDraftScopeKey(userId, scope)}:workspace:${workspaceIdentity}:view`;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('Private recovery storage is unavailable in this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts');
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains(VIEW_STORE))
        request.result.createObjectStore(VIEW_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Private recovery storage is unavailable.'));
  });
}

export async function readTemplateAuthoringViewState(
  userId: string,
  scope: TemplateAuthoringScope,
  workspaceIdentity: string,
): Promise<TemplateAuthoringViewState | null> {
  const db = await openDb();
  const key = templateAuthoringViewStateKey(userId, scope, workspaceIdentity);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIEW_STORE, 'readonly');
    const req = tx.objectStore(VIEW_STORE).get(key);
    req.onsuccess = () => resolve((req.result as TemplateAuthoringViewState | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('Could not read this private workspace view.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not read this private workspace view.')); };
  });
}

export function saveTemplateAuthoringViewState(state: TemplateAuthoringViewState): Promise<void> {
  const id = templateAuthoringViewStateKey(state.userId, state.scope, state.workspaceIdentity);
  return queued(id, async () => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIEW_STORE, 'readwrite');
      tx.objectStore(VIEW_STORE).put({ ...state, id });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not save this private workspace view.')); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Could not save this private workspace view.')); };
    });
  });
}

function queued<T>(key: string, run: () => Promise<T>): Promise<T> {
  const prior = queues.get(key) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(run);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
  return next;
}

export async function listTemplateDraftRecoveries(
  userId: string,
  scope: TemplateAuthoringScope,
): Promise<TemplateDraftRecovery[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as TemplateDraftRecovery[])
      .filter((item) => item.userId === userId && templateDraftScopeKey(item.userId, item.scope) === templateDraftScopeKey(userId, scope))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
    req.onerror = () => reject(req.error ?? new Error('Could not read private recovery snapshots.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not read private recovery snapshots.')); };
  });
}

export function saveTemplateDraftRecovery(snapshot: TemplateDraftRecovery): Promise<void> {
  return queued(snapshot.id, async () => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snapshot);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not save a private recovery snapshot.')); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Could not save a private recovery snapshot.')); };
    });
  });
}

export function removeTemplateDraftRecovery(id: string): Promise<void> {
  return queued(id, async () => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not clear a saved recovery snapshot.')); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Could not clear a saved recovery snapshot.')); };
    });
  });
}
