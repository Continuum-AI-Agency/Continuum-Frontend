import { afterEach, expect, test } from 'bun:test';
import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { useDeferredDefault } from '@/hooks/useDeferredDefault';

afterEach(cleanup);

// Drives the hook through a component so the real React state path is exercised.
function harness<T>(initialDerived: T) {
  const seen: T[] = [];
  let setDerived: (next: T) => void = () => {};
  let pick: (next: T | undefined) => void = () => {};

  function Probe() {
    const [derived, setDerivedState] = useState(initialDerived);
    const [resolved, setPicked] = useDeferredDefault<T>(derived);
    setDerived = setDerivedState;
    pick = setPicked;
    seen.push(resolved);
    return null;
  }

  render(<Probe />);
  return {
    seen,
    latest: () => seen[seen.length - 1],
    changeDerived: (next: T) => act(() => setDerived(next)),
    pick: (next: T | undefined) => act(() => pick(next)),
  };
}

test('tracks the derived value until something is picked', () => {
  const h = harness<string>('activity');
  expect(h.latest()).toBe('activity');

  h.changeDerived('pending');
  expect(h.latest()).toBe('pending');
});

test('a pick wins over later derived changes', () => {
  const h = harness<string>('activity');
  h.pick('activity');
  expect(h.latest()).toBe('activity');

  h.changeDerived('pending');
  expect(h.latest()).toBe('activity');
});

test('clearing the pick returns control to the derived value', () => {
  const h = harness<string>('edit');
  h.pick('preview');
  h.changeDerived('overview');
  expect(h.latest()).toBe('preview');

  h.pick(undefined);
  expect(h.latest()).toBe('overview');
});

test('a picked false is honoured rather than falling back', () => {
  const h = harness<boolean>(true);
  h.pick(false);
  expect(h.latest()).toBe(false);
});

test('works with array values', () => {
  const h = harness<string[]>(['trends']);
  expect(h.latest()).toEqual(['trends']);

  h.changeDerived(['trends', 'events']);
  expect(h.latest()).toEqual(['trends', 'events']);

  h.pick([]);
  h.changeDerived(['trends', 'events', 'questions']);
  expect(h.latest()).toEqual([]);
});
