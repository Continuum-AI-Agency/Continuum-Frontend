'use client';

import { useCallback, useRef, useState } from 'react';

type UseControllableStateParams<T> = {
  /** The controlled value. When defined, the hook is controlled and never stores its own. */
  prop?: T | undefined;
  defaultProp: T;
  onChange?: (state: T) => void;
};

type SetStateFn<T> = (next: T | ((prev: T) => T)) => void;

/**
 * Local replacement for `@radix-ui/react-use-controllable-state`, which was the last non-UI
 * Radix package left after the Base UI migration. Same signature and semantics: uncontrolled
 * state until `prop` is supplied, `onChange` fires only on an actual change.
 */
export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>): [T, SetStateFn<T>] {
  const [uncontrolled, setUncontrolled] = useState<T>(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? (prop as T) : uncontrolled;

  // Kept in a ref so the returned setter stays stable across renders — several callers put it
  // in a memo dependency list.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;
  const isControlledRef = useRef(isControlled);
  isControlledRef.current = isControlled;

  const setValue = useCallback<SetStateFn<T>>((next) => {
    const previous = valueRef.current;
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(previous) : next;
    if (Object.is(resolved, previous)) return;
    if (!isControlledRef.current) setUncontrolled(resolved);
    onChangeRef.current?.(resolved);
  }, []);

  return [value, setValue];
}
