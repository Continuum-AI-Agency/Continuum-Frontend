'use client';

import { useEffect } from 'react';
import { releaseStrandedLocks } from '@/lib/system/strandedLock';

/**
 * Watches for a modal lock (body pointer-events:none, `inert`) that outlives its dialog and
 * lifts it once no modal surface is open (lib/system/strandedLock.ts). It waits `settleMs`
 * after the last change so a dialog mid-close keeps its lock, and also checks on any press,
 * because a stranded lock is felt first as a click that does nothing.
 */
export function StrandedLockGuard({ settleMs = 400 }: { settleMs?: number }) {
  useEffect(() => {
    let timer: number | undefined;
    const check = () => {
      const released = releaseStrandedLocks(document);
      if (released.length > 0) console.warn('[stranded-lock] released', released);
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, settleMs);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'inert'],
      subtree: true,
      childList: true,
    });
    document.addEventListener('pointerdown', schedule, true);
    schedule();
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('pointerdown', schedule, true);
    };
  }, [settleMs]);
  return null;
}
