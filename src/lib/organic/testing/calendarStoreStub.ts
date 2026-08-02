import { mock } from 'bun:test';

/**
 * Build a stand-in for `@/lib/organic/store` for `mock.module`.
 *
 * `mock.module` is process-wide in bun: whichever spec registers last supplies the store
 * to EVERY other spec in the run. A stub with a fixed key set therefore hands `undefined`
 * to any hook reading a key that spec happened not to need — a failure that only appears
 * in a batch, and only for whoever loads second.
 *
 * So: known keys come from `state`, everything else answers with a no-op mock, and the
 * zustand static handles (`getState` / `setState`) stay present.
 *
 * The no-op-mock fallback only works for keys a hook CALLS. A selector that reads a
 * collection (`state.days.find(...)`) gets a function and throws, so the store's
 * collection-shaped keys carry empty defaults instead. Absent an explicit `state`
 * entry, reading them yields an empty collection rather than a callable.
 */
const EMPTY_COLLECTIONS: Record<string, unknown> = {
  days: [],
  backlogDrafts: [],
  selectedDraftIds: [],
  pendingServerDeletes: [],
  eventHistory: [],
  pendingDraftEdits: {},
};

export function createCalendarStoreStub(state: Record<string, unknown> = {}) {
  const fallbacks = new Map<string, () => void>();
  const proxied = new Proxy(state, {
    get: (target, key: string) => {
      if (key in target) return target[key];
      if (key in EMPTY_COLLECTIONS) return EMPTY_COLLECTIONS[key];
      if (!fallbacks.has(key)) fallbacks.set(key, mock());
      return fallbacks.get(key);
    },
    has: () => true,
  });

  const defaultImplementation = (selector: (s: unknown) => unknown) => selector(proxied);
  const useCalendarStore = mock(defaultImplementation);
  Object.assign(useCalendarStore, {
    getState: () => proxied,
    setState: mock(),
    subscribe: mock(() => () => undefined),
    // A spec that calls `mockImplementation` on this stub changes the store for every
    // spec that runs after it. Restore this in an afterAll to hand the next file back a
    // working selector-based store.
    defaultImplementation,
  });

  return { useCalendarStore };
}
