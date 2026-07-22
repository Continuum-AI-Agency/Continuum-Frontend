'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useResyncMeta } from '@/lib/api/integrations';

// Debounce so a fast mount/unmount (e.g. dialog flicker) doesn't fire a resync.
const RESYNC_DEBOUNCE_MS = 600;
// Cross-mount cooldown so navigating back into the picker doesn't re-hit
// /meta/resync every time — one auto-heal per window is plenty. Manual triggers
// bypass this.
const RESYNC_COOLDOWN_MS = 60_000;
const COOLDOWN_KEY = 'continuum:meta-auto-resync-at';

function withinCooldown(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(COOLDOWN_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < RESYNC_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function stampCooldown(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  } catch {
    // sessionStorage may be unavailable (private mode / SSR) — non-fatal.
  }
}

type UseMetaAutoResyncParams = {
  /** Overall gate (e.g. the assets query has loaded, or the dialog is open). */
  enabled: boolean;
  /**
   * True only when Meta looks connected-but-empty/stale — the #154 fingerprint.
   * Callers pass a precise signal (Meta assets present but no ad accounts) so
   * this never fires for users who simply never connected Meta.
   */
  isMetaEmpty: boolean;
  /** Refresh the caller's own data source once the resync lands. */
  onResynced?: () => void | Promise<void>;
};

type UseMetaAutoResyncResult = {
  isResyncing: boolean;
  resyncError: string | null;
  /** User-initiated resync; ignores the cooldown and once-per-mount guard. */
  triggerResync: () => void;
};

// Wires the picker to the already-tested POST /meta/resync (#154): when Meta
// connected but no ad accounts came through, quietly re-pull assets in the
// background instead of leaving the user staring at an empty list.
export function useMetaAutoResync({
  enabled,
  isMetaEmpty,
  onResynced,
}: UseMetaAutoResyncParams): UseMetaAutoResyncResult {
  const resync = useResyncMeta();
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  const run = useCallback(async () => {
    setIsResyncing(true);
    setResyncError(null);
    try {
      await resync.mutateAsync(undefined);
      stampCooldown();
      await onResynced?.();
    } catch (error) {
      setResyncError(error instanceof Error ? error.message : "Couldn't refresh Meta accounts.");
    } finally {
      setIsResyncing(false);
    }
  }, [resync, onResynced]);

  useEffect(() => {
    if (!enabled || !isMetaEmpty) return;
    if (attemptedRef.current || withinCooldown()) return;
    attemptedRef.current = true;
    const timer = setTimeout(() => {
      void run();
    }, RESYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, isMetaEmpty, run]);

  const triggerResync = useCallback(() => {
    void run();
  }, [run]);

  return { isResyncing, resyncError, triggerResync };
}
