'use client';

import type {
  TemplateAuthoringCommand,
  TemplateAuthoringDocument,
  TemplateAuthoringDraft,
  TemplateAuthoringDraftPut,
  TemplateAuthoringScope,
  TemplateAuthoringWorkspacePackage,
} from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayerDraftAutosaver,
  TemplateAuthoringDraftError,
  type LayerDraftAutosaveView,
  type LayerDraftSyncStatus,
  layerSnapshotFromCommands,
} from '@/components/forge/layerDraft';
import type { LayerDraftSnapshot } from '@/components/forge/layerHistory';
import {
  listTemplateDraftRecoveries,
  removeTemplateDraftRecovery,
  saveTemplateDraftRecovery,
  openTemplateDraftDb as openDraftDb,
  type TemplateDraftRecovery,
  templateDraftScopeKey,
} from '@/components/forge/templateDraftRecovery';
import {
  fetchTemplateAuthoringDocument,
  fetchTemplateAuthoringDraft,
  fetchTemplateAuthoringUserId,
  putTemplateAuthoringDraft,
  appendTemplateAuthoringHistory,
} from '@/lib/library/templateSources';
import { TemplateOperationJournal, type ForgeDraftAction } from './templateOperationJournal';
import { templateAuthoringEqual } from '@/components/forge/templateAuthoringEquality';
import { authoringScopeIdentity, sameAuthoringScope } from './authoringScope';

export type LocalTemplateAuthoringDraft = {
  userId: string;
  scope: TemplateAuthoringScope;
  /** Exact package whose native IDs the saved commands address. */
  workspaceIdentity?: string;
  sourceChecksum: string;
  revision: number;
  commands: TemplateAuthoringCommand[];
  persistedCommands: TemplateAuthoringCommand[];
  serverCopy?: TemplateAuthoringDraft | null;
};

type UseTemplateAuthoringDraftArgs = {
  scope: TemplateAuthoringScope | null;
  enabled: boolean;
  commands: TemplateAuthoringCommand[];
  onRestore: (snapshot: LayerDraftSnapshot) => void;
  baseRevisionId?: string;
};

type DraftState = LayerDraftAutosaveView & {
  status: LayerDraftSyncStatus;
  ready: boolean;
  workspaceIdentity: string | null;
  userId: string | null;
  update: (commands: TemplateAuthoringCommand[], immediate?: boolean) => void;
  recordOperation: (action: ForgeDraftAction) => string | null;
  serverDraft: TemplateAuthoringDraft | null;
  persistedDraft: TemplateAuthoringDraft | null;
  sourceDocument: TemplateAuthoringDocument | null;
  adoptServerDraft: () => Promise<boolean>;
  /** The agent wrote the server draft: take it as saved, and return it for one history step. */
  adoptAgentDraft: () => Promise<TemplateAuthoringDraft | null>;
  retry: () => Promise<boolean>;
  refresh: () => void;
  save: () => Promise<boolean>;
  park: (commands?: TemplateAuthoringCommand[]) => Promise<boolean>;
  recoveries: TemplateDraftRecovery[];
  restoreRecovery: (id: string) => Promise<boolean>;
};

const equal = templateAuthoringEqual;
export const templateAuthoringWorkspaceIdentity = (
  workspacePackage: TemplateAuthoringWorkspacePackage | undefined,
  sourceChecksum: string,
) => {
  const checksum = sourceChecksum.toLowerCase();
  if (workspacePackage?.kind === 'hyperframes_seed') {
    return [
      'hyperframes_seed',
      workspacePackage.artifactId,
      workspacePackage.packageChecksum.toLowerCase(),
      workspacePackage.sourceRevisionId,
      workspacePackage.sourceHtmlSha256.toLowerCase(),
      workspacePackage.extractedSceneSha256.toLowerCase(),
    ].join(':');
  }
  return `pinned_source:${workspacePackage?.packageChecksum.toLowerCase() ?? checksum}`;
};

const identityFromDraft = (draft: TemplateAuthoringDraft | null) => draft?.seed
  ? templateAuthoringWorkspaceIdentity({
      kind: 'hyperframes_seed',
      artifactId: draft.seed.artifactId,
      packageChecksum: draft.seed.packageChecksum,
      sourceRevisionId: draft.seed.sourceRevisionId,
      sourceHtmlSha256: draft.seed.sourceHtmlSha256,
      extractedSceneSha256: draft.seed.extractedSceneSha256,
    }, draft.sourceChecksum)
  : draft ? templateAuthoringWorkspaceIdentity(undefined, draft.sourceChecksum) : null;

const identityForLocal = (draft: LocalTemplateAuthoringDraft) =>
  draft.workspaceIdentity ?? templateAuthoringWorkspaceIdentity(undefined, draft.sourceChecksum);

async function writePinnedDraft(
  scope: TemplateAuthoringScope,
  sourceChecksum: string,
  userId: string,
  frozen: TemplateAuthoringDraftPut,
) {
  if (frozen.brandId !== scope.brandId || frozen.baseVersionId !== scope.baseVersionId || frozen.workingCopyId !== scope.workingCopyId)
    throw new Error('The frozen save belongs to a different private working copy.');
  const acknowledged = await putTemplateAuthoringDraft(scope.assetId, frozen, userId);
  if (!sameAuthoringScope(acknowledged.scope, scope))
    throw new Error('The server returned a draft for a different template.');
  if (acknowledged.sourceChecksum !== sourceChecksum)
    throw new TemplateAuthoringDraftError(409, 'source_mismatch',
      'The source package changed. Your local edits are preserved for reconciliation.');
  return acknowledged;
}

export function reconcileTemplateAuthoringTabSave(
  autosaver: LayerDraftAutosaver,
  revision: number,
  refresh: () => void,
) {
  if (revision <= autosaver.view.revision) return;
  if (autosaver.view.dirty) {
    autosaver.setConflict('Another tab saved a newer draft. Your local edits are preserved; reconcile before saving.');
  } else {
    refresh();
  }
}

export const layerDraftStorageKey = (
  userId: string,
  scope: TemplateAuthoringScope,
  workspaceIdentity = `pinned_source:${scope.baseVersionId}`,
) => `${templateDraftScopeKey(userId, scope)}:workspace:${workspaceIdentity}`;

/** A restart can adopt one exact local state; divergent tab snapshots require a choice. */
export function uniqueWorkingCopyRecovery(items: TemplateDraftRecovery[], scope: TemplateAuthoringScope) {
  const local = items.filter((item) => item.reason === 'local' && sameAuthoringScope(item.scope, scope));
  const first = local[0];
  return first && local.every((item) => item.revision === first.revision && item.workspaceIdentity === first.workspaceIdentity &&
    equal(item.commands, first.commands) && equal(item.persistedCommands, first.persistedCommands)) ? first : null;
}

async function readLocalDraft(key: string): Promise<LocalTemplateAuthoringDraft | null> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readonly');
    const request = transaction.objectStore('drafts').get(key);
    request.onsuccess = () =>
      resolve((request.result as LocalTemplateAuthoringDraft | undefined) ?? null);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? request.error ?? new Error('Private recovery storage is unavailable.'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? request.error ?? new Error('Private recovery storage is unavailable.'));
    };
  });
}

async function writeLocalDraft(key: string, draft: LocalTemplateAuthoringDraft): Promise<void> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').put(draft, key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Private recovery storage is unavailable.'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('Private recovery storage is unavailable.'));
    };
  });
}

async function removeLocalDraft(key: string): Promise<void> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Private recovery storage is unavailable.'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('Private recovery storage is unavailable.'));
    };
  });
}

export function useTemplateAuthoringDraft({
  scope,
  enabled,
  commands,
  onRestore,
  baseRevisionId,
}: UseTemplateAuthoringDraftArgs): DraftState {
  const [view, setView] = useState<LayerDraftAutosaveView>({
    status: scope && enabled ? 'loading' : 'saved',
    revision: 0,
    dirty: false,
    error: null,
  });
  const [loaded, setLoaded] = useState(!scope || !enabled);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [serverDraft, setServerDraft] = useState<TemplateAuthoringDraft | null>(null);
  const [persistedDraft, setPersistedDraft] = useState<TemplateAuthoringDraft | null>(null);
  const [sourceDocument, setSourceDocument] = useState<TemplateAuthoringDocument | null>(null);
  const [workspaceIdentity, setWorkspaceIdentity] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [recoveries, setRecoveries] = useState<TemplateDraftRecovery[]>([]);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const journalRef = useRef<TemplateOperationJournal | null>(null);
  const draftRecoveryRequired = useRef(false);
  const autosaverRef = useRef<LayerDraftAutosaver | null>(null);
  const baseRevisionRef = useRef(baseRevisionId);
  baseRevisionRef.current = baseRevisionId;
  const scopeKey = scope ? authoringScopeIdentity(scope) : '';
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;
  const localKeyRef = useRef<string | null>(null);
  const recoveryKeyRef = useRef<string | null>(null);
  const conflictFetchRef = useRef(false);
  const skipNextCommandsUpdate = useRef(false);
  const hydratedCommands = useRef<TemplateAuthoringCommand[]>([]);
  const generation = useRef(0);
  const tabId = useRef<string | null>(null);
  if (!tabId.current) tabId.current = globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random()}`;
  const recoveryQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingRecovery = useRef<{ key: string; local: LocalTemplateAuthoringDraft; recovery: TemplateDraftRecovery } | null>(null);
  const activeSourceChecksum = useRef<string | null>(null);
  const activeWorkspaceIdentity = useRef<string | null>(null);
  const tabChannel = useRef<BroadcastChannel | null>(null);

  const makeAutosaver = useCallback(
    (args: {
      userId: string;
      scope: TemplateAuthoringScope;
      sourceChecksum: string;
      workspaceIdentity: string;
      revision: number;
      persistedCommands: TemplateAuthoringCommand[];
      commands: TemplateAuthoringCommand[];
      conflict?: boolean;
      sourceMismatch?: boolean;
      initialError?: string;
    }) => {
      const key = `${layerDraftStorageKey(args.userId, args.scope, args.workspaceIdentity)}:tab:${tabId.current}`;
      const autosaverGeneration = generation.current;
      localKeyRef.current = key;
      const isCurrent = () => key === localKeyRef.current && generation.current === autosaverGeneration;
      const journal: TemplateOperationJournal = new TemplateOperationJournal({
        userId: args.userId, scope: args.scope, workspaceIdentity: args.workspaceIdentity,
        sourceChecksum: args.sourceChecksum,
        baseRevisionId: baseRevisionRef.current,
        append: (events) => appendTemplateAuthoringHistory(args.userId, args.scope.assetId, args.scope.brandId, events),
        onError: (error) => { if (isCurrent()) setOperationError(error instanceof Error ? error.message : 'Forge operation history could not be preserved.'); },
        onSaved: () => { if (isCurrent()) { setOperationError(null); setOperationPending(journal.busy); } },
      });
      journalRef.current = journal;
      setOperationPending(true);
      void journal.flush().then(() => { if (isCurrent()) { setOperationError(null); setOperationPending(journal.busy); } }, (error: unknown) => {
        if (isCurrent()) setOperationError(error instanceof Error ? error.message : 'Forge operation history could not be synchronized.');
      });
      const autosaver = new LayerDraftAutosaver({
        scope: args.scope,
        revision: args.revision,
        persistedCommands: args.persistedCommands,
        commands: args.commands,
        write: async (draftScope, expectedRevision, nextCommands) => {
          await journal.flush();
          const { result, matched } = await journal.writeDraft({
            brandId: draftScope.brandId,
            baseVersionId: draftScope.baseVersionId,
            ...(draftScope.workingCopyId ? { workingCopyId: draftScope.workingCopyId } : {}),
            expectedRevision,
            commands: nextCommands,
            origin: { tool: 'Forge web private draft' },
          }, (frozen) => writePinnedDraft(draftScope, args.sourceChecksum, args.userId, frozen));
          if (!matched) throw new TemplateAuthoringDraftError(409, 'revision_conflict',
            'An earlier frozen save was acknowledged. Your newer edits are preserved; review both draft copies before saving.');
          tabChannel.current?.postMessage({ tabId: tabId.current, revision: result.revision });
          if (key === localKeyRef.current && generation.current === autosaverGeneration)
            setPersistedDraft(result);
          return result;
        },
        initialError: args.conflict || args.initialError ? args.initialError : undefined,
        initialConflict: args.conflict,
        onChange: (nextView, nextCommands, persistedCommands) => {
          if (key !== localKeyRef.current || generation.current !== autosaverGeneration) return;
          setView(nextView);
          setDraftError(nextView.error);
          if (!nextView.dirty && nextView.status === 'saved') {
            recoveryQueue.current = recoveryQueue.current.catch(() => undefined).then(async () => {
              await removeLocalDraft(key);
              // The legacy key is unscoped by workspace package. Clear it only when this is
              // still the pinned-source workspace; a seeded draft must never erase its
              // pre-seed recovery snapshot.
              if (args.workspaceIdentity === `pinned_source:${args.scope.baseVersionId}`)
                await removeLocalDraft(layerDraftStorageKey(args.userId, args.scope));
              await removeTemplateDraftRecovery(`${key}:latest`);
              if (key === localKeyRef.current) {
                setRecoveryError(null);
                setRecoveries(await listTemplateDraftRecoveries(args.userId, args.scope, true));
              }
            }).catch((error: unknown) => {
              if (key === localKeyRef.current) setRecoveryError(error instanceof Error ? error.message : 'Could not clear private recovery.');
            });
            return;
          }
          const localSnapshot: LocalTemplateAuthoringDraft = {
            userId: args.userId,
            scope: args.scope,
            workspaceIdentity: args.workspaceIdentity,
            sourceChecksum: args.sourceChecksum,
            revision: nextView.revision,
            commands: nextCommands,
            persistedCommands,
          };
          const recovery: TemplateDraftRecovery = {
            id: `${key}:latest`,
            userId: args.userId,
            scope: args.scope,
            workspaceIdentity: args.workspaceIdentity,
            sourceChecksum: args.sourceChecksum,
            revision: nextView.revision,
            commands: structuredClone(nextCommands),
            persistedCommands: structuredClone(persistedCommands),
            savedAt: new Date().toISOString(),
            reason: 'local',
          };
          pendingRecovery.current = { key, local: localSnapshot, recovery };
          recoveryQueue.current = recoveryQueue.current.catch(() => undefined).then(async () => {
            await writeLocalDraft(key, localSnapshot);
            await saveTemplateDraftRecovery(recovery);
            if (key === localKeyRef.current) {
              if (pendingRecovery.current?.recovery.id === recovery.id) pendingRecovery.current = null;
              setRecoveryError(null);
              setRecoveries(await listTemplateDraftRecoveries(args.userId, args.scope, true));
            }
          }).catch((error: unknown) => {
            if (key === localKeyRef.current)
              setRecoveryError(error instanceof Error ? error.message : 'Could not preserve private recovery.');
          });
          if (nextView.status === 'conflict' && !conflictFetchRef.current) {
            conflictFetchRef.current = true;
            void fetchTemplateAuthoringDraft(
              args.scope.assetId,
              args.scope.brandId,
              args.scope.baseVersionId,
              args.scope.workingCopyId,
            )
              .then(async (serverCopy) => {
                const isCurrent = () => key === localKeyRef.current && generation.current === autosaverGeneration;
                if (!serverCopy || !isCurrent()) return;
                const recoveryKey = `${key}:recovery:${crypto.randomUUID()}`;
                recoveryKeyRef.current = recoveryKey;
                await writeLocalDraft(recoveryKey, {
                  userId: args.userId,
                  scope: args.scope,
                  workspaceIdentity: args.workspaceIdentity,
                  sourceChecksum: args.sourceChecksum,
                  revision: nextView.revision,
                  commands: nextCommands,
                  persistedCommands,
                  serverCopy,
                });
                if (!isCurrent()) return;
                await saveTemplateDraftRecovery({
                  id: recoveryKey, userId: args.userId, scope: args.scope,
                  workspaceIdentity: args.workspaceIdentity,
                  sourceChecksum: args.sourceChecksum, revision: nextView.revision,
                  commands: structuredClone(nextCommands), persistedCommands: structuredClone(persistedCommands),
                  savedAt: new Date().toISOString(), reason: 'conflict',
                  serverRevision: serverCopy.revision, serverCommands: structuredClone(serverCopy.commands),
                });
                if (!isCurrent()) return;
                const nextRecoveries = await listTemplateDraftRecoveries(args.userId, args.scope, true);
                if (!isCurrent()) return;
                setRecoveries(nextRecoveries);
                setServerDraft(serverCopy);
              })
              .catch((error: unknown) => {
                if (key === localKeyRef.current && generation.current === autosaverGeneration)
                  setRecoveryError(error instanceof Error ? error.message : 'Could not preserve both draft copies.');
              });
          }
        },
      });
      if (args.conflict)
        autosaver.setConflict(
          args.initialError ??
            'Another editor saved a newer draft. Review both copies before choosing one.',
          args.sourceMismatch ?? false,
        );
      autosaverRef.current?.dispose();
      autosaverRef.current = autosaver;
      skipNextCommandsUpdate.current = true;
      hydratedCommands.current = structuredClone(args.commands);
      setView(autosaver.view);
      return autosaver;
    },
    [],
  );

  useEffect(() => {
    const run = ++generation.current;
    conflictFetchRef.current = false;
    activeSourceChecksum.current = null;
    activeWorkspaceIdentity.current = null;
    journalRef.current = null;
    draftRecoveryRequired.current = false;
    setOperationError(null);
    setOperationPending(false);
    setWorkspaceIdentity(null);
    setDraftError(null);
    setServerDraft(null);
    setPersistedDraft(null);
    setSourceDocument(null);
    autosaverRef.current?.dispose();
    autosaverRef.current = null;
    tabChannel.current?.close();
    tabChannel.current = null;
    if (!scope || !enabled) {
      setLoaded(!enabled);
      setView({ status: 'saved', revision: 0, dirty: false, error: null });
      return;
    }
    let cancelled = false;
    setLoaded(false);
    setView({ status: 'loading', revision: 0, dirty: false, error: null });
    void (async () => {
      const userId = await fetchTemplateAuthoringUserId();
      if (!cancelled && generation.current === run) setUserId(userId);
      const baseKey = layerDraftStorageKey(userId, scope);
      const localKey = `${baseKey}:tab:${tabId.current}`;
      localKeyRef.current = localKey;
      let local: LocalTemplateAuthoringDraft | null = null;
      try {
        local = (await readLocalDraft(localKey)) ?? await readLocalDraft(baseKey);
        const copies = await listTemplateDraftRecoveries(userId, scope, true);
        setRecoveries(copies);
        if (!local && scope.workingCopyId) local = uniqueWorkingCopyRecovery(copies, scope);
        const divergentCopies = !local && scope.workingCopyId && copies.some((item) =>
          item.reason === 'local' && sameAuthoringScope(item.scope, scope));
        setRecoveryError(divergentCopies ? 'Several retained tab copies have different changes. Review and restore a copy before continuing.' : null);
      } catch (error) {
        setRecoveryError(error instanceof Error ? error.message : 'Private recovery storage is unavailable.');
      }
      let remoteSnapshot: TemplateAuthoringDraft | null = null;
      try {
        const [documentResult, remoteResult] = await Promise.allSettled([
          scope.workingCopyId
            ? fetchTemplateAuthoringDocument(scope.assetId, scope.brandId, scope.baseVersionId, scope.workingCopyId)
            : fetchTemplateAuthoringDocument(scope.assetId, scope.brandId, scope.baseVersionId),
          scope.workingCopyId
            ? fetchTemplateAuthoringDraft(scope.assetId, scope.brandId, scope.baseVersionId, scope.workingCopyId)
            : fetchTemplateAuthoringDraft(scope.assetId, scope.brandId, scope.baseVersionId),
        ]);
        let remote = remoteResult.status === 'fulfilled' ? remoteResult.value : null;
        if (remote && !sameAuthoringScope(remote.scope, scope)) throw new Error('The server returned another private working copy. Local copies are preserved.');
        remoteSnapshot = remote;
        if (remote && !cancelled && generation.current === run) setPersistedDraft(remote);
        const remoteWorkspaceIdentity = identityFromDraft(remote);
        if (remoteWorkspaceIdentity) {
          activeWorkspaceIdentity.current = remoteWorkspaceIdentity;
          if (!cancelled && generation.current === run) setWorkspaceIdentity(remoteWorkspaceIdentity);
        }
        if (remote?.requiresReconciliation) {
          if (remoteWorkspaceIdentity) {
            activeWorkspaceIdentity.current = remoteWorkspaceIdentity;
            setWorkspaceIdentity(remoteWorkspaceIdentity);
          }
          const localMatchesWorkspace = !!local &&
            identityForLocal(local) === remoteWorkspaceIdentity;
          const localCommands =
            localMatchesWorkspace && local && equal(local.scope, scope) && local.userId === userId
              ? local.commands
              : remote.commands;
          if (local && !localMatchesWorkspace) {
            const recoveryKey = `${localKey}:workspace-recovery:${crypto.randomUUID()}`;
            const preserved = {
              ...local,
              workspaceIdentity: identityForLocal(local),
            };
            const recovery = {
              ...preserved,
              id: recoveryKey,
              savedAt: new Date().toISOString(),
              reason: 'source-change' as const,
            };
            pendingRecovery.current = { key: recoveryKey, local: preserved, recovery };
            await writeLocalDraft(recoveryKey, preserved);
            await saveTemplateDraftRecovery(recovery);
            pendingRecovery.current = null;
            setRecoveryError('A saved snapshot belongs to a different workspace package. It is preserved and cannot be restored into this seed automatically.');
            setRecoveries(await listTemplateDraftRecoveries(userId, scope, true));
          }
          const snapshot = layerSnapshotFromCommands(localCommands);
          if (cancelled || generation.current !== run) return;
          restoreRef.current(snapshot);
          const recoveryKey = `${localKey}:recovery:${crypto.randomUUID()}`;
          recoveryKeyRef.current = recoveryKey;
          try {
            await writeLocalDraft(recoveryKey, {
              userId,
              scope,
              ...(remoteWorkspaceIdentity ? { workspaceIdentity: remoteWorkspaceIdentity } : {}),
              sourceChecksum: remote.sourceChecksum,
              revision: remote.revision,
              commands: localCommands,
              persistedCommands: remote.commands,
              serverCopy: remote,
            });
            await saveTemplateDraftRecovery({
              id: recoveryKey, userId, scope,
              ...(remoteWorkspaceIdentity ? { workspaceIdentity: remoteWorkspaceIdentity } : {}),
              sourceChecksum: remote.sourceChecksum,
              revision: remote.revision, commands: structuredClone(localCommands),
              persistedCommands: structuredClone(remote.commands), savedAt: new Date().toISOString(),
              reason: 'source-change', serverRevision: remote.revision, serverCommands: structuredClone(remote.commands),
            });
            setRecoveries(await listTemplateDraftRecoveries(userId, scope, true));
          } catch (error) {
            setRecoveryError(error instanceof Error ? error.message : 'Could not preserve both source copies.');
          }
          setServerDraft(remote);
          makeAutosaver({
            userId,
            scope,
            sourceChecksum: remote.sourceChecksum,
            workspaceIdentity: remoteWorkspaceIdentity ?? templateAuthoringWorkspaceIdentity(undefined, remote.sourceChecksum),
            revision: remote.revision,
            persistedCommands: remote.commands,
            commands: localCommands,
            conflict: true,
            sourceMismatch: true,
            initialError: `Source changed. Draft is pinned to ${scope.baseVersionId}; current source is ${remote.currentSource.templateSourceVersionId ?? remote.currentSource.assetHeadVersionId ?? 'unavailable'}. Both copies are retained for reconciliation.`,
          });
          setLoaded(true);
          return;
        }
        if (remote?.seed && !remote.projectedDocument)
          throw new Error('The attached private seed has no verified editable inventory yet. Its native IDs remain unavailable.');
        if (documentResult.status === 'rejected' && !remote?.projectedDocument) throw documentResult.reason;
        const document = remote?.seed ? remote.projectedDocument! : documentResult.status === 'fulfilled' ? documentResult.value : null;
        if (!document) throw new Error('The private authoring document is unavailable.');
        const activeIdentity = templateAuthoringWorkspaceIdentity(document.workspacePackage, document.sourceChecksum);
        activeWorkspaceIdentity.current = activeIdentity;
        setWorkspaceIdentity(activeIdentity);
        if (local && identityForLocal(local) !== activeIdentity) {
          const recoveryKey = `${localKey}:workspace-recovery:${crypto.randomUUID()}`;
          const preserved = { ...local, workspaceIdentity: identityForLocal(local) };
          const recovery = {
            ...preserved,
            id: recoveryKey,
            savedAt: new Date().toISOString(),
            reason: 'source-change' as const,
          };
          pendingRecovery.current = { key: recoveryKey, local: preserved, recovery };
          await writeLocalDraft(recoveryKey, preserved);
          await saveTemplateDraftRecovery(recovery);
          pendingRecovery.current = null;
          local = null;
          setRecoveryError('A saved snapshot belongs to a different workspace package. It is preserved for explicit reconciliation and will not be applied here.');
          setRecoveries(await listTemplateDraftRecoveries(userId, scope, true));
        }
        setSourceDocument(document);
        activeSourceChecksum.current = document.sourceChecksum;
        if (!equal(document.scope, scope))
          throw new Error('The authoring source does not match this template version.');
        if (
          remote &&
          (!equal(remote.scope, scope) || remote.sourceChecksum !== document.sourceChecksum)
        ) {
          throw new Error(
            'The saved draft belongs to a different source package. Local edits were not replaced.',
          );
        }
        if (cancelled || generation.current !== run) return;
        const journal = new TemplateOperationJournal({ userId, scope, workspaceIdentity: activeIdentity,
          sourceChecksum: document.sourceChecksum, baseRevisionId: baseRevisionRef.current,
          append: (events) => appendTemplateAuthoringHistory(userId, scope.assetId, scope.brandId, events) });
        draftRecoveryRequired.current = true;
        const resumed = await journal.resumeDraft((frozen) => {
          if (cancelled || generation.current !== run) throw new Error('The private working copy changed during recovery.');
          return writePinnedDraft(scope, document.sourceChecksum, userId, frozen);
        });
        if (cancelled || generation.current !== run) return;
        if (resumed) {
          // Replay returns its original acknowledgement; another tab may already have advanced beyond it.
          const latest = await fetchTemplateAuthoringDraft(scope.assetId, scope.brandId, scope.baseVersionId, scope.workingCopyId);
          if ((await fetchTemplateAuthoringUserId()) !== userId || !latest ||
              !sameAuthoringScope(latest.scope, scope) || latest.sourceChecksum !== document.sourceChecksum ||
              latest.requiresReconciliation || identityFromDraft(latest) !== activeIdentity)
            throw new Error('The recovered save needs reconciliation. Private copies are preserved.');
          if (cancelled || generation.current !== run) return;
          remote = latest;
          remoteSnapshot = latest;
          setPersistedDraft(latest);
        }
        draftRecoveryRequired.current = false;
        const persisted = remote?.commands ?? [];
        const revision = remote?.revision ?? 0;
        let initial = persisted;
        let conflict = false;
        let initialError: string | undefined;
        if (local && equal(local.scope, scope) && local.userId === userId) {
          if (local.sourceChecksum !== document.sourceChecksum) {
            initial = local.commands;
            conflict = true;
            initialError =
              'The source package changed. Your local edits are preserved and need reconciliation.';
          } else if (local.revision === revision) {
            initial = local.commands;
          } else if (equal(local.commands, persisted)) {
            await removeLocalDraft(localKey).catch((error: unknown) => setRecoveryError(error instanceof Error ? error.message : 'Could not clear private recovery.'));
            if (localKey !== baseKey)
              await removeLocalDraft(baseKey).catch((error: unknown) => setRecoveryError(error instanceof Error ? error.message : 'Could not clear private recovery.'));
          } else {
            initial = local.commands;
            conflict = true;
            initialError =
              'A newer server draft exists. Your local edits are preserved; reconcile before saving.';
          }
          if (conflict && remote) {
            setServerDraft(remote);
            const recoveryKey = `${localKey}:recovery:${crypto.randomUUID()}`;
            recoveryKeyRef.current = recoveryKey;
            void writeLocalDraft(recoveryKey, { ...local, serverCopy: remote }).catch(
              (error: unknown) => setRecoveryError(error instanceof Error ? error.message : 'Could not preserve both draft copies.'),
            );
            void saveTemplateDraftRecovery({
              id: recoveryKey, userId, scope, sourceChecksum: local.sourceChecksum,
              workspaceIdentity: identityForLocal(local),
              revision: local.revision, commands: structuredClone(local.commands),
              persistedCommands: structuredClone(local.persistedCommands), savedAt: new Date().toISOString(),
              reason: 'conflict', serverRevision: remote.revision, serverCommands: structuredClone(remote.commands),
            }).then(() => listTemplateDraftRecoveries(userId, scope, true)).then(setRecoveries).catch((error: unknown) => setRecoveryError(error instanceof Error ? error.message : 'Could not preserve both draft copies.'));
          }
        }
        const snapshot = layerSnapshotFromCommands(initial);
        if (cancelled || generation.current !== run) return;
        restoreRef.current(snapshot);
        makeAutosaver({
          userId,
          scope,
          sourceChecksum: document.sourceChecksum,
            workspaceIdentity: activeIdentity,
          revision,
          persistedCommands: persisted,
          commands: initial,
          conflict,
          initialError,
        });
        setLoaded(true);
      } catch (error) {
        if (cancelled || generation.current !== run) return;
        if (pendingRecovery.current?.key.includes(localKey))
          setRecoveryError(error instanceof Error ? error.message : 'Could not preserve the private recovery copy. Retry to save it locally.');
        if (remoteSnapshot && equal(remoteSnapshot.scope, scope)) {
          if (!cancelled && generation.current === run) setPersistedDraft(remoteSnapshot);
          const matchingLocal =
            local && equal(local.scope, scope) && local.userId === userId &&
            local.sourceChecksum === remoteSnapshot.sourceChecksum &&
            identityForLocal(local) === identityFromDraft(remoteSnapshot)
              ? local
              : null;
          const diverged = !!matchingLocal && !equal(matchingLocal.commands, remoteSnapshot.commands);
          const initial = matchingLocal?.commands ?? remoteSnapshot.commands;
          restoreRef.current(layerSnapshotFromCommands(initial));
          if (diverged) {
            setServerDraft(remoteSnapshot);
            const recoveryKey = `${localKey}:recovery:${crypto.randomUUID()}`;
            recoveryKeyRef.current = recoveryKey;
            await writeLocalDraft(recoveryKey, {
              userId,
              scope,
              ...(identityFromDraft(remoteSnapshot) ? { workspaceIdentity: identityFromDraft(remoteSnapshot)! } : {}),
              sourceChecksum: remoteSnapshot.sourceChecksum,
              revision: matchingLocal?.revision ?? remoteSnapshot.revision,
              commands: initial,
              persistedCommands: remoteSnapshot.commands,
              serverCopy: remoteSnapshot,
            }).catch((error: unknown) => setRecoveryError(error instanceof Error ? error.message : 'Could not preserve both draft copies.'));
            void saveTemplateDraftRecovery({
              id: recoveryKey, userId, scope,
              ...(identityFromDraft(remoteSnapshot) ? { workspaceIdentity: identityFromDraft(remoteSnapshot)! } : {}),
              sourceChecksum: remoteSnapshot.sourceChecksum,
              revision: matchingLocal?.revision ?? remoteSnapshot.revision,
              commands: structuredClone(initial), persistedCommands: structuredClone(remoteSnapshot.commands),
              savedAt: new Date().toISOString(), reason: 'conflict',
              serverRevision: remoteSnapshot.revision, serverCommands: structuredClone(remoteSnapshot.commands),
            }).then(() => listTemplateDraftRecoveries(userId, scope, true)).then(setRecoveries).catch((error: unknown) => setRecoveryError(error instanceof Error ? error.message : 'Could not preserve both draft copies.'));
          }
          makeAutosaver({
            userId,
            scope,
            sourceChecksum: remoteSnapshot.sourceChecksum,
            workspaceIdentity: identityFromDraft(remoteSnapshot) ?? templateAuthoringWorkspaceIdentity(undefined, remoteSnapshot.sourceChecksum),
            revision: remoteSnapshot.revision,
            persistedCommands: remoteSnapshot.commands,
            commands: initial,
            conflict: diverged,
            initialError:
              error instanceof Error
                ? `Draft loaded; source preview is unavailable: ${error.message}`
                : 'Draft loaded; source preview is unavailable. Retry the private draft save.',
          });
          setLoaded(true);
          return;
        }
        if (local && equal(local.scope, scope) && local.userId === userId) {
          const snapshot = layerSnapshotFromCommands(local.commands);
          restoreRef.current(snapshot);
          makeAutosaver({
            userId,
            scope,
            sourceChecksum: local.sourceChecksum,
            workspaceIdentity: identityForLocal(local),
            revision: local.revision,
            persistedCommands: local.persistedCommands,
            commands: local.commands,
            initialError:
              error instanceof Error
                ? `Offline recovery: ${error.message}`
                : 'Offline recovery is available; retry the private draft save.',
          });
          setLoaded(true);
        } else {
          setView({
            status: 'error',
            revision: 0,
            dirty: false,
            error: error instanceof Error ? error.message : 'Could not load the private draft.',
          });
          setLoaded(true);
        }
      }
    })().catch((error: unknown) => {
      if (!cancelled && generation.current === run)
        setView({
          status: 'error',
          revision: 0,
          dirty: false,
          error: error instanceof Error ? error.message : 'Could not load the private draft.',
        });
    });
    return () => {
      cancelled = true;
      autosaverRef.current?.dispose();
    };
  }, [scopeKey, enabled, makeAutosaver, loadAttempt]);

  useEffect(() => {
    const Channel = globalThis.BroadcastChannel;
    if (!loaded || !scope || !userId || typeof Channel === 'undefined') return;
    const channel = new Channel(
      `continuum-forge-draft:${userId}:${scopeKey}`,
    );
    tabChannel.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data as { tabId?: unknown; revision?: unknown } | null;
      if (message?.tabId === tabId.current || typeof message?.revision !== 'number' || !Number.isInteger(message.revision)) return;
      const autosaver = autosaverRef.current;
      if (!autosaver) return;
      reconcileTemplateAuthoringTabSave(autosaver, message.revision, () =>
        setLoadAttempt((attempt) => attempt + 1),
      );
    };
    return () => {
      if (tabChannel.current === channel) tabChannel.current = null;
      channel.close();
    };
  }, [loaded, scopeKey, userId, workspaceIdentity]);

  useEffect(() => {
    if (!loaded || !autosaverRef.current) return;
    if (skipNextCommandsUpdate.current) {
      skipNextCommandsUpdate.current = false;
      if (equal(commands, hydratedCommands.current)) return;
    }
    autosaverRef.current.update(commands);
  }, [commands, loaded]);

  const save = useCallback(async () => {
    const autosaver = autosaverRef.current;
    const journal = journalRef.current;
    const run = generation.current;
    if (!loaded || !autosaver || !journal) return false;
    try {
      await journal.flush();
      if (generation.current !== run || autosaverRef.current !== autosaver) return false;
      setOperationError(null); setOperationPending(journal.busy);
    } catch (error) {
      if (generation.current === run) setOperationError(error instanceof Error ? error.message : 'Forge operation history is still pending.');
      return false;
    }
    return autosaver.flush();
  }, [loaded]);
  const park = useCallback(async (nextCommands?: TemplateAuthoringCommand[]) => {
    const selectedScope = scope && structuredClone(scope);
    const autosaver = autosaverRef.current;
    const journal = journalRef.current;
    const key = localKeyRef.current;
    const run = generation.current;
    const checksum = activeSourceChecksum.current ?? persistedDraft?.sourceChecksum;
    const identity = activeWorkspaceIdentity.current;
    if (!loaded || !selectedScope || !autosaver || !journal || !key || !userId || !checksum || !identity) return false;
    const snapshot = structuredClone(nextCommands ?? commands);
    autosaver.update(snapshot);
    try {
      await journal.preserveLocal();
      await recoveryQueue.current;
      const local: LocalTemplateAuthoringDraft = { userId, scope: selectedScope, sourceChecksum: checksum,
        workspaceIdentity: identity, revision: autosaver.view.revision, commands: snapshot,
        persistedCommands: structuredClone(persistedDraft?.commands ?? []) };
      await writeLocalDraft(key, local);
      await saveTemplateDraftRecovery({ ...local, id: `${key}:latest`, reason: 'local', savedAt: new Date().toISOString() });
      if (generation.current !== run || autosaverRef.current !== autosaver) return false;
      setRecoveryError(null);
      return true;
    } catch (error) {
      if (generation.current === run) setRecoveryError(error instanceof Error ? error.message : 'The working copy could not be preserved.');
      return false;
    }
  }, [commands, loaded, persistedDraft, scope, userId]);
  const refresh = useCallback(() => {
    if (!scope || !enabled) return;
    setLoadAttempt((attempt) => attempt + 1);
  }, [scope, enabled]);
  const adoptServerDraft = useCallback(async () => {
    const remote = serverDraft;
    const key = recoveryKeyRef.current;
    if (!remote || !key || !scope) return false;
    const local = await readLocalDraft(key);
    if (!local) return false;
    restoreRef.current(layerSnapshotFromCommands(remote.commands));
    autosaverRef.current?.adoptServerDraft(remote.revision, remote.commands);
    setServerDraft(null);
    recoveryKeyRef.current = key;
    return true;
  }, [scope, serverDraft]);
  const adoptAgentDraft = useCallback(async () => {
    const autosaver = autosaverRef.current;
    const run = generation.current;
    if (!scope || !loaded || !autosaver) return null;
    const remote = await fetchTemplateAuthoringDraft(scope.assetId, scope.brandId, scope.baseVersionId, scope.workingCopyId);
    if (!remote || generation.current !== run || autosaverRef.current !== autosaver || !sameAuthoringScope(remote.scope, scope)) return null;
    autosaver.adoptServerDraft(remote.revision, remote.commands);
    hydratedCommands.current = structuredClone(remote.commands);
    skipNextCommandsUpdate.current = true;
    setPersistedDraft(remote);
    tabChannel.current?.postMessage({ tabId: tabId.current, revision: remote.revision });
    return remote;
  }, [scope, loaded]);
  const retry = useCallback(async () => {
    if (!loaded) return false;
    const run = generation.current;
    const journal = journalRef.current;
    try {
      await journal?.flush();
      if (generation.current !== run) return false;
      setOperationError(null); setOperationPending(journal?.busy ?? false);
    } catch (error) {
      if (generation.current === run) setOperationError(error instanceof Error ? error.message : 'Forge operation history is still pending.');
      return false;
    }
    await recoveryQueue.current;
    if (generation.current !== run) return false;
    if (draftRecoveryRequired.current) {
      if (!(await park()) || generation.current !== run) return false;
      setLoadAttempt((attempt) => attempt + 1);
      return true;
    }
    if (recoveryError) {
      const pending = pendingRecovery.current;
      if (pending) {
        try {
          await writeLocalDraft(pending.key, pending.local);
          await saveTemplateDraftRecovery(pending.recovery);
          pendingRecovery.current = null;
          setRecoveries(await listTemplateDraftRecoveries(pending.local.userId, pending.local.scope, true));
          setRecoveryError(null);
        } catch (error) {
          setRecoveryError(error instanceof Error ? error.message : 'Private recovery is still unavailable.');
        }
      } else {
        setLoadAttempt((attempt) => attempt + 1);
        return true;
      }
    }
    if (!autosaverRef.current) {
      setLoadAttempt((attempt) => attempt + 1);
      return true;
    }
    return autosaverRef.current.retry();
  }, [loaded, recoveryError, park]);

  const restoreRecovery = useCallback(async (id: string) => {
    const item = recoveries.find((entry) => entry.id === id);
    if (!item || !scope) return false;
    if (!sameAuthoringScope(item.scope, scope)) {
      setRecoveryError('This is a legacy or different working-copy snapshot. It is preserved and requires explicit reconciliation.');
      return false;
    }
    const activeIdentity = activeWorkspaceIdentity.current;
    if (activeIdentity && identityForLocal(item) !== activeIdentity) {
      setRecoveryError('This recovery copy belongs to a different workspace package. It is preserved and cannot be restored here.');
      return false;
    }
    if (activeSourceChecksum.current && activeSourceChecksum.current !== item.sourceChecksum) {
      setRecoveryError('This recovery copy belongs to a different source package. Open its pinned version before restoring it.');
      return false;
    }
    const operation = recoveryQueue.current.catch(() => undefined).then(async () => {
      const targetWorkspaceIdentity = activeIdentity ?? identityForLocal(item);
      const key = `${layerDraftStorageKey(item.userId, item.scope, targetWorkspaceIdentity)}:tab:${tabId.current}`;
      const current = await readLocalDraft(key);
      const currentCommands = current?.commands ?? commands;
      if (current || currentCommands.length) {
        await saveTemplateDraftRecovery({
          id: `${key}:before-restore:${crypto.randomUUID()}`, userId: item.userId,
          scope: current?.scope ?? item.scope, sourceChecksum: current?.sourceChecksum ?? activeSourceChecksum.current ?? item.sourceChecksum,
          workspaceIdentity: current?.workspaceIdentity ?? targetWorkspaceIdentity,
          revision: current?.revision ?? autosaverRef.current?.view.revision ?? item.revision,
          commands: structuredClone(currentCommands), persistedCommands: structuredClone(current?.persistedCommands ?? item.persistedCommands),
          savedAt: new Date().toISOString(), reason: 'local',
        });
      }
      const restored = { ...item, workspaceIdentity: targetWorkspaceIdentity, id: key, savedAt: new Date().toISOString() };
      await writeLocalDraft(key, restored);
      await saveTemplateDraftRecovery(restored);
      restoreRef.current(layerSnapshotFromCommands(item.commands));
      if (autosaverRef.current) autosaverRef.current.update(item.commands, true);
      else makeAutosaver({
        userId: item.userId,
        scope: item.scope,
        sourceChecksum: item.sourceChecksum,
        workspaceIdentity: targetWorkspaceIdentity,
        revision: item.revision,
        persistedCommands: item.persistedCommands,
        commands: item.commands,
        initialError: 'Recovered local changes are ready to retry against the pinned source.',
      });
      setRecoveryError(null);
      setRecoveries(await listTemplateDraftRecoveries(item.userId, item.scope, true));
    });
    recoveryQueue.current = operation.then(() => undefined, () => undefined);
    try {
      await operation;
      return true;
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'Could not restore this recovery snapshot.');
      return false;
    }
  }, [commands, makeAutosaver, recoveries, scope]);

  return {
    ...view,
    dirty: view.dirty || operationPending || !!operationError,
    error: [...new Set([draftError, view.error, recoveryError, operationError].filter((message): message is string => !!message))].join(' · ') || null,
    status: loaded
      ? (recoveryError || operationError) && view.status !== 'conflict' && view.status !== 'source-mismatch'
        ? 'error'
        : operationPending && view.status === 'saved' ? 'unsaved' : view.status
      : 'loading',
    ready: loaded,
    workspaceIdentity,
    userId,
    retry,
    save,
    park,
    refresh,
    update: (nextCommands, immediate = false) =>
      autosaverRef.current?.update(nextCommands, immediate),
    recordOperation: (action) => {
      const journal = journalRef.current;
      if (!journal) { setOperationError('Private operation history is not ready. Retry before editing.'); return null; }
      setOperationPending(true);
      try { return journal.capture(action, autosaverRef.current?.view.revision ?? 0); }
      catch (error) { setOperationError(error instanceof Error ? error.message : 'The exact working-copy base is unavailable.'); return null; }
    },
    serverDraft,
    persistedDraft,
    sourceDocument,
    adoptServerDraft,
    adoptAgentDraft,
    recoveries,
    restoreRecovery,
  };
}
