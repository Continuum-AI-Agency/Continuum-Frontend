import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

import { useCachedRead, useOptimizerStore } from './optimizerStore';

beforeEach(() => {
  useOptimizerStore.setState({ entries: {} });
});
afterEach(() => cleanup());

const EMPTY: string[] = [];

describe('useCachedRead', () => {
  it('resolves a fetch and flips isLoading to false — the beginFetch re-render must NOT cancel the in-flight fetch', async () => {
    const { result } = renderHook(() =>
      useCachedRead('k-resolve', async () => ['portfolio'], EMPTY),
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(['portfolio']);
    expect(result.current.isError).toBe(false);
  });

  it('records isError (the offline signal) when the fetch rejects, without hanging on loading', async () => {
    const { result } = renderHook(() =>
      useCachedRead(
        'k-error',
        async () => {
          throw new Error('offline');
        },
        EMPTY,
      ),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it('serves a fresh cache without re-fetching', async () => {
    let calls = 0;
    const { result, rerender } = renderHook(() =>
      useCachedRead(
        'k-cache',
        async () => {
          calls += 1;
          return calls;
        },
        0,
      ),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(calls).toBe(1);
    rerender();
    await waitFor(() => expect(result.current.data).toBe(1));
    expect(calls).toBe(1);
  });

  it('does nothing (no loading) when key is null', () => {
    const { result } = renderHook(() => useCachedRead(null, async () => ['x'], EMPTY));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([]);
  });
});
