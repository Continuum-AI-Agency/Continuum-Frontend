import { describe, expect, it } from 'bun:test';
import { act, renderHook } from '@testing-library/react';

import { DEFAULT_SEARCH_DEBOUNCE_MS, useDebounce } from './useDebounce';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('useDebounce', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('first', 50));
    expect(result.current).toBe('first');
  });

  it('withholds a new value until the delay elapses', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 50), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    expect(result.current).toBe('a');

    await act(async () => {
      await wait(80);
    });
    expect(result.current).toBe('b');
  });

  it('only emits the last value in a burst', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 50), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    rerender({ value: 'abc' });
    rerender({ value: 'abcd' });
    expect(result.current).toBe('a');

    await act(async () => {
      await wait(80);
    });
    expect(result.current).toBe('abcd');
  });

  it('defaults to the shared 300ms interval', () => {
    expect(DEFAULT_SEARCH_DEBOUNCE_MS).toBe(300);
  });
});
