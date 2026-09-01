import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { renderHook } from '@testing-library/react';
import { useStudioStore } from '../stores/useStudioStore';
import { useDebouncedSave } from './useDebouncedSave';

describe('useDebouncedSave', () => {
  let triggerSave: ReturnType<typeof mock>;
  let restore: () => void;

  beforeEach(() => {
    triggerSave = mock(() => {});
    const prior = useStudioStore.getState().triggerSave;
    useStudioStore.setState({ triggerSave: triggerSave as unknown as () => void });
    restore = () => useStudioStore.setState({ triggerSave: prior });
  });

  afterEach(() => restore());

  it('coalesces a burst of edits into one save', async () => {
    const { result } = renderHook(() => useDebouncedSave(20));
    result.current();
    result.current();
    result.current();
    expect(triggerSave).toHaveBeenCalledTimes(0);
    await new Promise((r) => setTimeout(r, 60));
    expect(triggerSave).toHaveBeenCalledTimes(1);
  });

  // The regression that viewport culling would otherwise introduce: a node scrolled
  // out of frame unmounts mid-debounce, and the edit must still reach the database.
  it('flushes a pending save when the node unmounts', () => {
    const { result, unmount } = renderHook(() => useDebouncedSave(10_000));
    result.current();
    expect(triggerSave).toHaveBeenCalledTimes(0);
    unmount();
    expect(triggerSave).toHaveBeenCalledTimes(1);
  });

  it('does not save on unmount when nothing was pending', () => {
    const { unmount } = renderHook(() => useDebouncedSave(10_000));
    unmount();
    expect(triggerSave).toHaveBeenCalledTimes(0);
  });

  it('does not double-save when the debounce already fired', async () => {
    const { result, unmount } = renderHook(() => useDebouncedSave(20));
    result.current();
    await new Promise((r) => setTimeout(r, 60));
    expect(triggerSave).toHaveBeenCalledTimes(1);
    unmount();
    expect(triggerSave).toHaveBeenCalledTimes(1);
  });
});
