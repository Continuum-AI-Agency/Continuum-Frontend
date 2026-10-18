'use client';

import type {
  PresentationCommand,
  PresentationDocument,
  PresentationEnvelope,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayerDraftChange } from '@/components/forge/layerDraft';
import { type PresentationScope, presentationsApi } from '@/lib/api/presentations.client';
import { PresentationEngine } from './presentationEngine';

export function usePresentationDocument(
  scope: PresentationScope,
  onDraftChange?: LayerDraftChange,
) {
  const key = useMemo(
    () => ['forge', scope.brandId, 'presentation', scope.assetId, scope.baseVersionId],
    [scope.brandId, scope.assetId, scope.baseVersionId],
  );
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => presentationsApi.load(scope, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [engine, setEngine] = useState<PresentationEngine | null>(null);
  const [local, setLocal] = useState<{
    document: PresentationDocument;
    commands: PresentationCommand[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const undo = useRef<Array<NonNullable<typeof local>>>([]);
  const redo = useRef<Array<NonNullable<typeof local>>>([]);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const document = local?.document ?? query.data?.document ?? null;
  const dirty = Boolean(local?.commands.length);

  useEffect(() => {
    const runtime = new PresentationEngine();
    setEngine(runtime);
    return () => runtime.dispose();
  }, []);

  const adopt = useCallback(
    (envelope: PresentationEnvelope) => {
      queryClient.setQueryData(key, envelope);
      setLocal(null);
      undo.current = [];
      redo.current = [];
      retry.current = null;
      setHistoryVersion((value) => value + 1);
    },
    [key, queryClient],
  );

  const perform = useCallback(
    async (commands: PresentationCommand[]) => {
      if (!document || !engine || lock.current) return false;
      lock.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await engine.process({
          operation: 'apply',
          document,
          expectedRevision: document.revision,
          retryId: crypto.randomUUID(),
          commands,
        });
        if (!result.ok || !result.document)
          throw new Error('The engine did not return the edited document.');
        undo.current.push(local ?? { document, commands: [] });
        redo.current = [];
        setLocal({
          document: result.document,
          commands: [...(local?.commands ?? []), ...commands],
        });
        setHistoryVersion((value) => value + 1);
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The edit could not be applied.');
        return false;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [document, engine, local],
  );

  const save = useCallback(async () => {
    if (!dirty) return true;
    if (!local || !query.data || lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    const signature = JSON.stringify([query.data.draftRevision, local.commands]);
    if (retry.current?.signature !== signature)
      retry.current = { signature, id: crypto.randomUUID() };
    try {
      adopt(
        await presentationsApi.apply(
          scope,
          query.data.draftRevision,
          local.commands,
          retry.current.id,
        ),
      );
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The changes could not be saved. They remain in this workspace.',
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [dirty, local, query.data, scope, adopt]);

  const discard = useCallback(() => {
    setLocal(null);
    undo.current = [];
    redo.current = [];
    retry.current = null;
    setError(null);
    setHistoryVersion((value) => value + 1);
  }, []);

  const history = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (lock.current) return;
      const from = direction === 'undo' ? undo.current : redo.current;
      const to = direction === 'undo' ? redo.current : undo.current;
      const snapshot = from.pop();
      if (snapshot && document) {
        to.push(local ?? { document, commands: [] });
        setLocal(snapshot);
        setHistoryVersion((value) => value + 1);
        return;
      }
      if (dirty || !query.data) return;
      lock.current = true;
      setBusy(true);
      setError(null);
      try {
        adopt(
          await presentationsApi.history(
            scope,
            query.data.draftRevision,
            direction,
            crypto.randomUUID(),
          ),
        );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'History could not be restored.');
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [document, local, dirty, query.data, scope, adopt],
  );

  useEffect(() => {
    onDraftChange?.({
      dirty,
      busy,
      saveLabel: 'Save presentation',
      save,
      discard,
      status: error ? 'error' : busy ? 'saving' : dirty ? 'unsaved' : 'saved',
    });
  }, [dirty, busy, save, discard, error, onDraftChange]);
  useEffect(() => () => onDraftChange?.(null), [onDraftChange]);

  return {
    query,
    engine,
    document,
    dirty,
    busy,
    error,
    setError,
    perform,
    save,
    discard,
    adopt,
    history,
    historyVersion,
    canUndoLocal: undo.current.length > 0,
    canRedoLocal: redo.current.length > 0,
  };
}
