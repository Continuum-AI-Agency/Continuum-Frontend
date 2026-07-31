'use client';

import { useCallback, useSyncExternalStore } from 'react';

// A media query is external state, so it is read through useSyncExternalStore rather
// than mirrored into useState by an effect. The distinction is not stylistic: the
// useState + effect shape reports the WRONG value on the first client render and then
// flips, and both consumers pay dearly for that flip — the sidebar's breakpoint gates
// the whole app shell, and the planner bakes its breakpoint into a remount key.
//
// getServerSnapshot returns false because the server has no viewport. Hydration must
// therefore agree with it, which is why the first client render still reads the real
// value only after hydration settles; what this hook removes is the extra
// commit-then-flip on every subsequent client render of the same tree.

const NO_MATCH = false;

const matchMediaOrNull = (query: string): MediaQueryList | null =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? null
    : window.matchMedia(query);

const getServerSnapshot = (): boolean => NO_MATCH;

/** `true` while the viewport matches `query`, e.g. `useMediaQuery('(max-width: 767px)')`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mediaQueryList = matchMediaOrNull(query);
      if (!mediaQueryList) return () => undefined;
      mediaQueryList.addEventListener('change', onStoreChange);
      return () => mediaQueryList.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => matchMediaOrNull(query)?.matches ?? NO_MATCH, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
