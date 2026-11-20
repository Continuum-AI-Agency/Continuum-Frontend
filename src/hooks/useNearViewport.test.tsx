import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useNearViewport } from './useNearViewport';

type Report = (entries: { isIntersecting: boolean }[]) => void;
const observed = new Map<Element, Report>();
const realObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  observed.clear();
  globalThis.IntersectionObserver = class {
    constructor(private readonly report: Report) {}
    observe(node: Element) {
      observed.set(node, this.report);
    }
    disconnect() {
      for (const [node, report] of observed) if (report === this.report) observed.delete(node);
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  globalThis.IntersectionObserver = realObserver;
});

const enter = (node: Element | null) =>
  act(() => {
    if (node) observed.get(node)?.([{ isIntersecting: true }]);
  });

function Probe({ immediate = false, other = false }: { immediate?: boolean; other?: boolean }) {
  const [ref, near] = useNearViewport(immediate);
  return other ? (
    <i ref={ref} data-testid="box" data-near={String(near)} />
  ) : (
    <b ref={ref} data-testid="box" data-near={String(near)} />
  );
}

describe('useNearViewport', () => {
  it('is far until its element nears the screen, then stays near', () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('box').dataset.near).toBe('false');
    enter(getByTestId('box'));
    expect(getByTestId('box').dataset.near).toBe('true');
    expect(observed.size).toBe(0);
  });

  it('watches the new element when the box swaps it', () => {
    const { getByTestId, rerender } = render(<Probe />);
    const first = getByTestId('box');
    rerender(<Probe other />);
    const second = getByTestId('box');
    expect(second).not.toBe(first);
    expect(observed.has(first)).toBe(false);
    enter(second);
    expect(getByTestId('box').dataset.near).toBe('true');
  });

  it('is near at once when asked to load immediately', () => {
    const { getByTestId } = render(<Probe immediate />);
    expect(getByTestId('box').dataset.near).toBe('true');
  });

  it('is far on the server, so server HTML names nothing to fetch', () => {
    expect(renderToString(<Probe />)).toContain('data-near="false"');
  });
});
