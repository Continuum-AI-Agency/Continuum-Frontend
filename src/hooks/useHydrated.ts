'use client';

import { useSyncExternalStore } from 'react';

// `false` on the server and during hydration, `true` on every client render after it. A
// component that renders a client-only value (the resolved theme, a locale, a date) reads this
// and renders the server's neutral markup until hydration has settled, so the server tree and
// the first client tree agree. Read through useSyncExternalStore, not useState + effect: the
// server snapshot is what hydration compares against, and the flip to `true` is one commit.

const subscribe = () => () => undefined;
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
