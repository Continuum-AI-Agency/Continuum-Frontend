'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  getClientCommitSha,
  isStaleBuildError,
  isVersionMismatch,
  LOCAL_DEV_SHA,
  parseVersionResponse,
} from '@/lib/system/version';

const POLLING_INTERVAL_MS = 60_000;

/** Why the page should reload: a newer deployment exists, or this tab already failed to load
 *  code (a chunk or Server Action) that the deployment no longer serves. */
export type UpdateReason = 'new_version' | 'stale_tab';

export function useVersionCheck() {
  const [reason, setReason] = useState<UpdateReason | null>(null);

  // A stale tab is known the moment a press fails to load its code, deployed or not — so this
  // listens everywhere, local dev included, and outranks the polled version check.
  useEffect(() => {
    const onFailure = (failure: unknown) => {
      if (isStaleBuildError(failure)) setReason('stale_tab');
    };
    const onError = (event: ErrorEvent) => onFailure(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => onFailure(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    const currentVersion = getClientCommitSha();
    if (currentVersion === LOCAL_DEV_SHA) return;

    let isActive = true;

    const checkForUpdate = async () => {
      try {
        const res = await fetch('/api/system/version', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Version check failed with status ${res.status}.`);
        }

        const data = parseVersionResponse(await res.json());
        if (isActive && isVersionMismatch({ clientSha: currentVersion, serverSha: data.sha })) {
          setReason((current) => current ?? 'new_version');
        }
      } catch (error) {
        console.error('Failed to check version', error);
      }
    };

    const intervalId = window.setInterval(checkForUpdate, POLLING_INTERVAL_MS);
    window.addEventListener('focus', checkForUpdate);
    void checkForUpdate();

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkForUpdate);
    };
  }, []);

  const reload = useCallback(() => window.location.reload(), []);

  return { isUpdateAvailable: reason !== null, reason, reload };
}
