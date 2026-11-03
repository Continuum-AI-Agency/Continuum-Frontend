'use client';

// Which layout a viewer reads the Meta and Google tabs in: the adaptive board (the default) or
// Today's fixed Overview. A per-viewer convenience, so it lives in localStorage; storage may be
// absent (a private window, blocked site data, the server render), and then the board shows.
// Every access is guarded. One choice for both tabs: a person who prefers Today on Meta has said
// so for the Overview, not for one platform.
//
// The questions for Jaina the board offers come from the reading (AdAccountReading.asks, in the
// account's language); a reading with none keeps the tab's own questions, so the band a person
// used yesterday is never simply gone.

import { useCallback, useSyncExternalStore } from 'react';
import type { JainaEntry } from '../jainaEntryModel';

export type BoardLayout = 'adaptive' | 'today';

export const BOARD_LAYOUT_KEY = 'continuum:optimizer:overview:layout';
export const DEFAULT_BOARD_LAYOUT: BoardLayout = 'adaptive';

type Store = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readBoardLayout(store: Store | null = storage()): BoardLayout {
  try {
    return store?.getItem(BOARD_LAYOUT_KEY) === 'today' ? 'today' : DEFAULT_BOARD_LAYOUT;
  } catch {
    return DEFAULT_BOARD_LAYOUT;
  }
}

/** True when the choice was stored; false when storage is absent or refused it. */
export function writeBoardLayout(layout: BoardLayout, store: Store | null = storage()): boolean {
  if (!store) return false;
  try {
    store.setItem(BOARD_LAYOUT_KEY, layout);
    return true;
  } catch {
    return false;
  }
}

// The choice of this visit, held only for a viewer whose storage refused it; and every mounted
// reader, so a switch on one tab is the switch everywhere on the page.
let visitLayout: BoardLayout | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === BOARD_LAYOUT_KEY) listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

function snapshot(): BoardLayout {
  return visitLayout ?? readBoardLayout();
}

/** The layout and its setter. The server render (and a first paint without storage) reads the
 *  default; the stored choice takes over on the client. */
export function useBoardLayout(): [BoardLayout, (next: BoardLayout) => void] {
  const layout = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_BOARD_LAYOUT);
  const setLayout = useCallback((next: BoardLayout) => {
    visitLayout = writeBoardLayout(next) ? null : next;
    for (const listener of listeners) listener();
  }, []);
  return [layout, setLayout];
}

/** The board's questions for Jaina: the reading's own, each its own label and prompt; with none,
 *  the tab's existing questions. */
export function boardAskEntries(
  asks: readonly string[],
  fallback: readonly JainaEntry[],
): JainaEntry[] {
  const fromReading = asks
    .map((ask) => ask.trim())
    .filter((ask) => ask.length > 0)
    .map((ask, index) => ({ key: `reading-${index}`, label: ask, prompt: ask }));
  return fromReading.length > 0 ? fromReading : [...fallback];
}
