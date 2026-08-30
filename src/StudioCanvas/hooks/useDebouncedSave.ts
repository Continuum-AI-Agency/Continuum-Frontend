import { useCallback, useEffect, useRef } from 'react';
import { useStudioStore } from '../stores/useStudioStore';

/**
 * Coalesce a burst of edits into one autosave.
 *
 * Unmount FLUSHES a pending save rather than dropping it. That distinction only
 * started to matter once the canvas began unmounting off-screen nodes: a node used to
 * unmount only when it was deleted or the room changed, so a cleared timer cost
 * nothing. With viewport culling, panning away from a node within the debounce window
 * unmounts it — and clearing the timer there would silently discard the write. The
 * store already holds the edit either way; what would be lost is its trip to the DB.
 */
export function useDebouncedSave(delay = 1000) {
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  // triggerSave is read through a ref so the cleanup below can stay mounted-once.
  // Depending on it directly would re-run the effect whenever the store identity
  // changed and flush on every such run, which is not what "on unmount" means.
  const triggerSaveRef = useRef(triggerSave);
  triggerSaveRef.current = triggerSave;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (pendingRef.current) {
        pendingRef.current = false;
        triggerSaveRef.current();
      }
    };
  }, []);

  return useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    pendingRef.current = true;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      pendingRef.current = false;
      triggerSave();
    }, delay);
  }, [triggerSave, delay]);
}
