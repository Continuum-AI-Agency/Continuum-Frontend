import { describe, expect, it, mock } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import { useControllableState } from './useControllableState';

describe('useControllableState', () => {
  it('holds its own state when uncontrolled', () => {
    const onChange = mock((_v: number) => {});
    const { result } = renderHook(() => useControllableState({ defaultProp: 1, onChange }));

    expect(result.current[0]).toBe(1);
    act(() => result.current[1](2));
    expect(result.current[0]).toBe(2);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('defers to the controlled prop and never stores its own', () => {
    const onChange = mock((_v: string) => {});
    const { result, rerender } = renderHook(
      ({ prop }: { prop: string }) => useControllableState({ prop, defaultProp: 'a', onChange }),
      { initialProps: { prop: 'a' } },
    );

    act(() => result.current[1]('b'));
    // The owner did not re-render with a new prop, so the value is unchanged...
    expect(result.current[0]).toBe('a');
    // ...but it was told to change.
    expect(onChange).toHaveBeenCalledWith('b');

    rerender({ prop: 'b' });
    expect(result.current[0]).toBe('b');
  });

  it('accepts an updater function', () => {
    const { result } = renderHook(() => useControllableState({ defaultProp: 10 }));
    act(() => result.current[1]((prev) => prev + 5));
    expect(result.current[0]).toBe(15);
  });

  it('does not fire onChange when the value is unchanged', () => {
    const onChange = mock((_v: number) => {});
    const { result } = renderHook(() => useControllableState({ defaultProp: 7, onChange }));
    act(() => result.current[1](7));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the setter identity stable across renders', () => {
    const { result, rerender } = renderHook(() => useControllableState({ defaultProp: 0 }));
    const first = result.current[1];
    rerender();
    expect(result.current[1]).toBe(first);
  });
});
