// The location seam is injected rather than mocked, so nothing about
// `next/navigation` leaks into sibling spec files in the shared bun process.

import { describe, expect, test } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import { type RunLocation, useActiveRun } from './useActiveRun';

const stubLocation = (runId: string | null) => {
  const replaced: Array<string | null> = [];
  const location: RunLocation = {
    runId,
    replaceRunId: (next) => {
      replaced.push(next);
    },
  };
  return { replaced, useLocation: () => location };
};

describe('useActiveRun', () => {
  test('seeds the focused run from the ?run= deep link', () => {
    const { useLocation } = stubLocation('run-from-email');
    const { result } = renderHook(() => useActiveRun({ useLocation }));

    expect(result.current.activeRunId).toBe('run-from-email');
  });

  test('has no focused run when the URL carries none', () => {
    const { useLocation } = stubLocation(null);
    const { result } = renderHook(() => useActiveRun({ useLocation }));

    expect(result.current.activeRunId).toBeNull();
  });

  test('focusRun moves state and the URL together', () => {
    const { replaced, useLocation } = stubLocation(null);
    const { result } = renderHook(() => useActiveRun({ useLocation }));

    act(() => result.current.focusRun('run-clicked'));

    expect(result.current.activeRunId).toBe('run-clicked');
    expect(replaced).toEqual(['run-clicked']);
  });

  test('clearing the focus also clears the search param', () => {
    const { replaced, useLocation } = stubLocation('run-from-email');
    const { result } = renderHook(() => useActiveRun({ useLocation }));

    act(() => result.current.focusRun(null));

    expect(result.current.activeRunId).toBeNull();
    expect(replaced).toEqual([null]);
  });
});
