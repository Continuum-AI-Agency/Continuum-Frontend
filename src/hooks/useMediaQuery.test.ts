import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useMediaQuery } from './useMediaQuery';

type ChangeListener = (event: MediaQueryListEvent) => void;

type MatchMediaStub = {
  requestedQueries: string[];
  listenerCount: () => number;
  addEventListenerCalls: number;
  removeEventListenerCalls: number;
  setMatches: (matches: boolean) => void;
};

const originalMatchMedia = window.matchMedia;

/** Installs a controllable `window.matchMedia`; happy-dom's own is not steerable. */
function installMatchMediaStub(matches: boolean): MatchMediaStub {
  const listeners = new Set<ChangeListener>();
  const stub: MatchMediaStub = {
    requestedQueries: [],
    listenerCount: () => listeners.size,
    addEventListenerCalls: 0,
    removeEventListenerCalls: 0,
    setMatches: (next: boolean) => {
      currentMatches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
  let currentMatches = matches;

  window.matchMedia = ((query: string) => {
    stub.requestedQueries.push(query);
    return {
      matches: currentMatches,
      media: query,
      onchange: null,
      addEventListener: (type: string, listener: ChangeListener) => {
        if (type !== 'change') return;
        listeners.add(listener);
        stub.addEventListenerCalls += 1;
      },
      removeEventListener: (type: string, listener: ChangeListener) => {
        if (type !== 'change') return;
        listeners.delete(listener);
        stub.removeEventListenerCalls += 1;
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return stub;
}

/** Every value the hook has ever returned, so a post-mount flip cannot hide. */
function renderObservedValues(query: string) {
  const observed: boolean[] = [];
  const rendered = renderHook(() => {
    const matches = useMediaQuery(query);
    observed.push(matches);
    return matches;
  });
  return { ...rendered, observed };
}

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

describe('useMediaQuery', () => {
  it('reports a matching query on the very first render, with no flip', () => {
    installMatchMediaStub(true);

    const { result, observed } = renderObservedValues('(max-width: 767px)');

    expect(result.current).toBe(true);
    expect(observed).not.toContain(false);
  });

  it('reports a non-matching query as false', () => {
    installMatchMediaStub(false);

    const { result } = renderObservedValues('(min-width: 64rem)');

    expect(result.current).toBe(false);
  });

  it('passes the caller query through to matchMedia', () => {
    const stub = installMatchMediaStub(false);

    renderObservedValues('(min-width: 64rem)');

    expect(stub.requestedQueries).toContain('(min-width: 64rem)');
  });

  it('subscribes to change while mounted', () => {
    const stub = installMatchMediaStub(false);

    renderObservedValues('(max-width: 767px)');

    expect(stub.addEventListenerCalls).toBe(1);
    expect(stub.listenerCount()).toBe(1);
  });

  it('removes its change listener on unmount', () => {
    const stub = installMatchMediaStub(false);

    const { unmount } = renderObservedValues('(max-width: 767px)');
    unmount();

    expect(stub.removeEventListenerCalls).toBe(1);
    expect(stub.listenerCount()).toBe(0);
  });

  it('re-reads the query when a change event fires', () => {
    const stub = installMatchMediaStub(false);

    const { result } = renderObservedValues('(max-width: 767px)');
    expect(result.current).toBe(false);

    act(() => {
      stub.setMatches(true);
    });

    expect(result.current).toBe(true);
  });

  it('resubscribes when the query changes', () => {
    const stub = installMatchMediaStub(false);

    const { rerender } = renderHook(({ query }: { query: string }) => useMediaQuery(query), {
      initialProps: { query: '(max-width: 767px)' },
    });
    rerender({ query: '(min-width: 64rem)' });

    expect(stub.removeEventListenerCalls).toBe(1);
    expect(stub.addEventListenerCalls).toBe(2);
    expect(stub.requestedQueries).toContain('(min-width: 64rem)');
  });

  it('falls back to false where matchMedia is unavailable', () => {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'matchMedia');

    const { result } = renderObservedValues('(max-width: 767px)');

    expect(result.current).toBe(false);
  });
});
