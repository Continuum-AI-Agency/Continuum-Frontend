// Whether this viewer hid the "All" tab's platform comparison row. A per-viewer convenience,
// so it lives in localStorage — and storage may be absent (a private window, blocked site data,
// server rendering), in which case the row is simply shown. Every access is guarded.

export const COMPARISON_PREFERENCE_KEY = 'continuum:optimizer:overview:platform-comparison';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readComparisonHidden(store: Storage | null = storage()): boolean {
  try {
    return store?.getItem(COMPARISON_PREFERENCE_KEY) === 'hidden';
  } catch {
    return false;
  }
}

export function writeComparisonHidden(hidden: boolean, store: Storage | null = storage()): void {
  try {
    store?.setItem(COMPARISON_PREFERENCE_KEY, hidden ? 'hidden' : 'shown');
  } catch {
    // Storage refused the write: the choice holds for this visit only.
  }
}
