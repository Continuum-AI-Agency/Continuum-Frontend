'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayerDraftChange, LayerDraftState } from '@/components/forge/layerDraft';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { useRouter } from '@/i18n/navigation';

let requestExternalExit: (() => Promise<boolean>) | null = null;

/** Ask the mounted Forge editor to protect a brand switch or an outer Forge-tab change. */
export function confirmForgeExit(): Promise<boolean> {
  return requestExternalExit ? requestExternalExit() : Promise.resolve(true);
}

export function useForgeExitGuard() {
  const translateUi = useUiTranslations('forge');

  const router = useRouter();
  const [draft, setDraft] = useState<LayerDraftState | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef<LayerDraftState | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const resolverRef = useRef<((allowed: boolean) => void) | null>(null);
  const savingRef = useRef(false);

  const onDraftChange = useCallback<LayerDraftChange>((next) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const resolvePending = useCallback((allowed: boolean) => {
    const pending = pendingRef.current;
    const resolver = resolverRef.current;
    pendingRef.current = null;
    resolverRef.current = null;
    setOpen(false);
    if (allowed) pending?.();
    resolver?.(allowed);
  }, []);

  const request = useCallback((action?: () => void) => {
    if (!draftRef.current?.dirty) {
      action?.();
      return Promise.resolve(true);
    }
    if (savingRef.current || resolverRef.current) return Promise.resolve(false);
    pendingRef.current = action ?? null;
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    const registered = () => request();
    requestExternalExit = registered;
    return () => {
      pendingRef.current = null;
      const resolve = resolverRef.current;
      resolverRef.current = null;
      resolve?.(false);
      if (requestExternalExit === registered) requestExternalExit = null;
    };
  }, [request]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!draftRef.current?.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  useEffect(() => {
    if (!draft?.dirty) return;
    const guardInternalLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(target instanceof HTMLAnchorElement) ||
        target.target ||
        target.hasAttribute('download')
      )
        return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const next = `${destination.pathname}${destination.search}${destination.hash}`;
      if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`)
        return;
      event.preventDefault();
      void request(() => router.push(next));
    };
    document.addEventListener('click', guardInternalLink, true);
    return () => document.removeEventListener('click', guardInternalLink, true);
  }, [draft?.dirty, request, router]);

  const runGuarded = useCallback(
    (action: () => void) => {
      void request(action);
    },
    [request],
  );

  const saveAndExit = async () => {
    const current = draftRef.current;
    if (!current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    let saved = false;
    try {
      saved = await current.save();
    } catch {
      saved = false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    if (!saved) {
      toast.error(translateUi('could_not_save_this_layer_draft_you_30c95989'));
      return;
    }
    resolvePending(true);
  };

  const discardAndExit = () => {
    if (savingRef.current) return;
    draftRef.current?.discard();
    resolvePending(true);
  };

  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && !savingRef.current && resolvePending(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{translateUi('unsaved_layer_changes_f1acb0cf')}</AlertDialogTitle>
          <AlertDialogDescription>
            {' '}
            {translateUi('these_layer_edits_have_not_been_sav_cd48b2b1')}{' '}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving} onClick={() => resolvePending(false)}>
            {' '}
            {translateUi('stay_08fd1de4')}{' '}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={saving || draft?.busy}
            onClick={discardAndExit}
          >
            {' '}
            {translateUi('discard_eb1a70e3')}{' '}
          </Button>
          <AlertDialogAction
            disabled={saving || draft?.busy}
            onClick={(event) => {
              event.preventDefault();
              void saveAndExit();
            }}
          >
            {saving
              ? translateUi('saving_23e39291')
              : draft?.saveLabel || translateUi('save_draft_3de10010')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { onDraftChange, runGuarded, dialog, confirm: request };
}
