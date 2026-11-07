'use client';

import type { TemplateOperationInput, TemplateRevision, TemplateRevisionVariant } from '@continuum/contracts';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { appendTemplateAuthoringHistory, fetchTemplateAuthoringUserId } from '@/lib/library/templateSources';
import { useSession } from '@/hooks/useSession';
import { isLayerHistoryDirty } from '../layerHistory';
import { revisionIsReadOnly } from '../revisionSelection';
import { NativeWorkingCopy, type NativeCopyIdentity, type NativeCopyState, type NativeSaveIntent } from './nativeWorkingCopy';

export function nativeIdentity(userId: string, brandId: string, family: NativeCopyIdentity['family'], revision: TemplateRevision): NativeCopyIdentity {
  return { userId, brandId, family, templateId: revision.templateId, variantId: revision.variantId,
    baseRevisionId: revision.id, sourceAssetId: revision.sourceAssetId, sourceVersionId: revision.sourceVersionId,
    sourceChecksum: revision.checksum };
}

export function useNativeWorkingCopy<T>({ brandId, family, selection, initial, restore }: {
  brandId: string; family: NativeCopyIdentity['family'];
  selection: { variant: TemplateRevisionVariant; revision: TemplateRevision } | undefined;
  initial: T; restore: (snapshot: T) => void;
}) {
  const [model, setModel] = useState<{ key: string; copy: NativeWorkingCopy<T>; state: NativeCopyState<T> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const failedEdit = useRef<{ snapshot: T; origin: TemplateOperationInput['origin']; affectedObjects: string[]; group: string | null; generation: number } | null>(null);
  const editGeneration = useRef(0);
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const { user } = useSession();
  const key = selection ? `${user?.id ?? 'signed-out'}:${brandId}:${family}:${selection.variant.variantId}:${selection.revision.id}` : '';
  const retained = model?.key === key;
  const readOnly = !selection || selection.variant.original || !!selection.variant.archivedAt || revisionIsReadOnly(selection) && !retained;
  const live = useRef(key); live.current = key;
  useLayoutEffect(() => { restoreRef.current(structuredClone(initial)); }, [key]);
  useEffect(() => {
    if (readOnly || !selection || !user?.id) return;
    let current = true;
    setError(null);
    failedEdit.current = null;
    void (async () => {
      const userId = await fetchTemplateAuthoringUserId();
      if (userId !== user.id) throw new Error('The signed-in account changed while opening this native copy.');
      const identity = nativeIdentity(userId, brandId, family, selection.revision);
      const copy = await NativeWorkingCopy.open({ identity, initial,
        append: events => appendTemplateAuthoringHistory(userId, identity.templateId, brandId, events),
        onError: cause => { if (current) setError(cause instanceof Error ? cause.message : 'Native history is preserved for retry.'); } });
      const state = await copy.read();
      if (current) { restoreRef.current(structuredClone(state.history.present)); setModel({ key, copy, state }); }
    })().catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'Could not open this private native copy.'); });
    return () => { current = false; };
  }, [brandId, family, key, readOnly]);
  const active = model?.key === key ? model : null;
  const adopt = useCallback((state: NativeCopyState<T>) => {
    if (live.current !== key) return;
    setModel(current => {
      if (current?.key !== key || state.sequence < current.state.sequence) return current;
      if (state.sequence === current.state.sequence && JSON.stringify(state) === JSON.stringify(current.state)) return current;
      return { ...current, state };
    });
  }, [key]);
  const change = useCallback((snapshot: T, origin: TemplateOperationInput['origin'], affectedObjects: string[], group: string | null = null) => {
    if (!active || readOnly) return;
    const attempt = { snapshot: structuredClone(snapshot), origin, affectedObjects, group, generation: ++editGeneration.current };
    void active.copy.edit(snapshot, { command: 'forge_native_edit', origin, affectedObjects }, group).then(state => {
      adopt(state);
      if (attempt.generation === editGeneration.current && failedEdit.current) { failedEdit.current = null; setError(null); }
    }).catch(cause => { if (attempt.generation === editGeneration.current) failedEdit.current = attempt; setError(String(cause)); });
  }, [active?.copy, readOnly, adopt]);
  const history = useCallback(async (action: 'undo' | 'redo' | 'discard', origin: TemplateOperationInput['origin']) => {
    if (!active || readOnly) return;
    if (failedEdit.current) { setError('Retry the last private edit before undo, redo or discard.'); return; }
    try { const state = await active.copy[action](origin); restoreRef.current(structuredClone(state.history.present)); adopt(state); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [active?.copy, readOnly, adopt]);
  const save = useCallback(async (build: (base: NativeCopyIdentity, snapshot: T, id: string) => Record<string, unknown>,
    send: (intent: NativeSaveIntent<T>) => Promise<TemplateRevision>, origin: TemplateOperationInput['origin']) => {
    if (!active || readOnly || saving) return null;
    if (failedEdit.current) { setError('The last edit has not reached private storage. Retry it before saving or switching branches.'); return null; }
    setSaving(true); setError(null);
    let revision: TemplateRevision | undefined;
    try {
      const result = await active.copy.save(build, async intent => {
        revision = await send(intent);
        return nativeIdentity(intent.userId, intent.base.brandId, family, revision);
      }, fetchTemplateAuthoringUserId, origin);
      adopt(result.state);
      return { ...result, revision: revision! };
    } catch (cause) {
      adopt(await active.copy.read()); setError(cause instanceof Error ? cause.message : String(cause)); return null;
    } finally { setSaving(false); }
  }, [active?.copy, readOnly, saving, adopt, family]);
  const dismissSave = useCallback(async () => { if (active && !saving) adopt(await active.copy.dismissSave({ tool: 'Forge native editor', button: 'Stop retrying native request' })); }, [active?.copy, saving, adopt]);
  const hydrate = useCallback(async (transform: (snapshot: T) => T) => { if (failedEdit.current) failedEdit.current = { ...failedEdit.current, snapshot: transform(failedEdit.current.snapshot) }; if (active) adopt(await active.copy.hydrate(transform)); }, [active?.copy, adopt]);
  const retry = useCallback(async () => {
    try {
      const edit = failedEdit.current;
      if (active && edit) { const state = await active.copy.edit(edit.snapshot,
        { command: 'forge_native_edit', origin: edit.origin, affectedObjects: edit.affectedObjects }, edit.group);
        if (failedEdit.current === edit) failedEdit.current = null; adopt(state); }
      await active?.copy.flush(); setError(null);
    } catch (cause) { setError(String(cause)); }
  }, [active?.copy, adopt]);
  const park = useCallback(async () => { if (failedEdit.current) throw new Error('Retry the last private edit before switching branches.'); await active?.copy.park(); }, [active?.copy]);
  return { ready: readOnly || !!active, readOnly, state: active?.state ?? null, error, saving,
    dirty: !!active && isLayerHistoryDirty(active.state.history), change, history, save,
    hydrate, retry, park, dismissSave,
  };
}
