'use client';

import type {
  PresentationCommand,
  PresentationDocument,
  PresentationEnvelope,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayerDraftChange } from '@/components/forge/layerDraft';
import type { OperationJournalStorage } from '@/components/forge/templateOperationJournal';
import { type PresentationScope, presentationsApi } from '@/lib/api/presentations.client';
import {
  appendTemplateAuthoringHistory,
  fetchTemplateAuthoringUserId,
} from '@/lib/library/templateSources';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PresentationEngine } from './presentationEngine';
import {
  type PresentationCopyState,
  PresentationWorkingCopy,
  sendPresentationRequest,
} from './presentationWorkingCopy';

export function usePresentationDocument(
  scope: PresentationScope,
  onDraftChange?: LayerDraftChange,
  options: { storage?: OperationJournalStorage } = {},
) {
  const [userId, setUserId] = useState<string | null>(null);
  const key = useMemo(
    () => ['forge', userId, scope.brandId, 'presentation', scope.assetId, scope.baseVersionId],
    [userId, scope.brandId, scope.assetId, scope.baseVersionId],
  );
  const identity = JSON.stringify(key);
  const live = useRef(identity);
  live.current = identity;
  const queryClient = useQueryClient();
  const [engine, setEngine] = useState<PresentationEngine | null>(null);
  const [model, setModel] = useState<{
    identity: string;
    copy: PresentationWorkingCopy;
    state: PresentationCopyState;
  } | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = pending > 0;
  const active = model?.identity === identity ? model : null;
  const state = active?.state;
  const document: PresentationDocument | null = state?.history.present.document ?? null;
  const dirty = !!state && (!!state.history.present.commands.length || !!state.pending);

  useEffect(() => {
    let current = true,
      changed = false;
    const client = createSupabaseBrowserClient();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      changed = true;
      live.current = '';
      setUserId(session?.user.id ?? null);
    });
    void fetchTemplateAuthoringUserId().then(
      (id) => {
        if (current && !changed) setUserId(id);
      },
      (cause) => {
        if (current)
          setError(
            cause instanceof Error ? cause.message : 'Sign in to open this private presentation.',
          );
      },
    );
    return () => {
      current = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async ({ signal }) => {
      if ((await fetchTemplateAuthoringUserId()) !== userId)
        throw new Error('The signed-in account changed.');
      const envelope = await presentationsApi.load(scope, signal);
      if ((await fetchTemplateAuthoringUserId()) !== userId)
        throw new Error('The signed-in account changed.');
      return envelope;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const runtime = new PresentationEngine();
    setEngine(runtime);
    return () => runtime.dispose();
  }, []);
  useEffect(() => {
    if (!userId || !query.data || !engine) return;
    let current = true;
    void PresentationWorkingCopy.open({
      userId,
      scope,
      initial: query.data,
      storage: options.storage,
      currentPrincipal: fetchTemplateAuthoringUserId,
      process: async (input, commands, retryId) => {
        const result = await engine.process({
          operation: 'apply',
          document: input,
          expectedRevision: input.revision,
          retryId,
          commands,
        });
        if (!result.ok || !result.document)
          throw new Error('The engine did not return the edited document.');
        return result.document;
      },
      send: (intent) => sendPresentationRequest(scope, userId, intent),
      append: (events) =>
        appendTemplateAuthoringHistory(userId, scope.assetId, scope.brandId, events),
      onError: (cause) => {
        if (current && live.current === identity)
          setError(
            cause instanceof Error ? cause.message : 'Operation history remains queued privately.',
          );
      },
    })
      .then(async (copy) => {
        const recovered = await copy.read();
        if (current && live.current === identity) setModel({ identity, copy, state: recovered });
      })
      .catch((cause) => {
        if (current && live.current === identity)
          setError(
            cause instanceof Error
              ? cause.message
              : 'The private presentation could not be opened.',
          );
      });
    return () => {
      current = false;
    };
  }, [userId, identity, query.data, engine, options.storage]);

  const adoptState = useCallback(
    (next: PresentationCopyState) => {
      if (live.current !== identity) return;
      setModel((current) =>
        current?.identity === identity && next.version >= current.state.version
          ? { ...current, state: next }
          : current,
      );
      const cached = queryClient.getQueryData<PresentationEnvelope>(key);
      if (cached?.draftRevision !== next.server.draftRevision)
        queryClient.setQueryData(key, next.server);
    },
    [identity, key, queryClient],
  );
  const operate = useCallback(
    async (run: (copy: PresentationWorkingCopy) => Promise<PresentationCopyState>) => {
      if (!active) return false;
      setPending((value) => value + 1);
      setError(null);
      try {
        adoptState(await run(active.copy));
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'The changes remain in the private presentation.',
        );
        try {
          adoptState(await active.copy.read());
        } catch {
          /* The previously visible, durable state remains intact. */
        }
        return false;
      } finally {
        setPending((value) => value - 1);
      }
    },
    [active?.copy, adoptState],
  );
  const perform = useCallback(
    (commands: PresentationCommand[]) => operate((copy) => copy.perform(commands)),
    [operate],
  );
  const save = useCallback(() => operate((copy) => copy.save()), [operate]);
  const history = useCallback(
    async (direction: 'undo' | 'redo') => {
      await operate((copy) => copy.history(direction));
    },
    [operate],
  );
  const discard = useCallback(() => {
    void operate((copy) => copy.discard());
  }, [operate]);
  const adopt = useCallback(
    (envelope: PresentationEnvelope) => {
      void operate((copy) => copy.replace(envelope));
    },
    [operate],
  );
  const park = useCallback(async () => {
    if (!active) return false;
    await active.copy.park();
    return live.current === identity;
  }, [active?.copy, identity]);
  useEffect(() => {
    onDraftChange?.({
      contextId: identity,
      dirty,
      busy,
      saveLabel: 'Save presentation',
      save,
      park,
      discard,
      status: error ? 'error' : busy ? 'saving' : dirty ? 'unsaved' : 'saved',
    });
  }, [identity, dirty, busy, save, park, discard, error, onDraftChange]);
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
    historyVersion: state?.version ?? 0,
    canUndoLocal: !!state?.history.past.length,
    canRedoLocal: !!state?.history.future.length,
  };
}
