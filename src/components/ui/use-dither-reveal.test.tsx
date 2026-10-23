import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, render } from '@testing-library/react';
import { useRef, useState } from 'react';

const reveal = mock(async (_options?: { within?: Element }) => {});
const destroy = mock(() => {});
const createAsciiReveal = mock((_root: HTMLElement, _options: unknown) => ({ reveal, destroy }));

// A bare stub, never importOriginal: the real engine draws on canvas, which happy-dom lacks.
mock.module('ascii-reveal/core', () => ({ createAsciiReveal }));

const { Skeleton } = await import('./skeleton');
const { useDitherReveal } = await import('./use-dither-reveal');

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

type Phase = 'loading' | 'loaded';

let setPhase: (phase: Phase) => void = () => {};
let setStatus: (status: string) => void = () => {};

function Harness() {
  const ref = useRef<HTMLElement>(null);
  const [phase, set] = useState<Phase>('loading');
  const [status, setS] = useState('idle');
  setPhase = set;
  setStatus = setS;
  useDitherReveal(ref);
  return (
    <main ref={ref}>
      <section data-testid="card">
        {phase === 'loading' ? <Skeleton className="h-4" /> : <p>Spend 4,210</p>}
        <div data-testid="grid">
          {phase === 'loading' ? (
            <>
              <Skeleton />
              <Skeleton />
            </>
          ) : (
            <span>Row</span>
          )}
        </div>
      </section>
      <p data-testid="status">{status === 'idle' ? <span>idle</span> : <b>{status}</b>}</p>
    </main>
  );
}

afterEach(() => {
  cleanup();
  reveal.mockClear();
  destroy.mockClear();
  createAsciiReveal.mockClear();
});

describe('useDitherReveal', () => {
  it('decodes the outermost region a skeleton left, once per frame', async () => {
    const { getByTestId } = render(<Harness />);
    await settle();
    expect(createAsciiReveal).toHaveBeenCalledTimes(1);
    expect(createAsciiReveal.mock.calls[0][1]).toMatchObject({ preset: 'dither', lazy: false });

    act(() => setPhase('loaded'));
    await settle();

    // The card and the grid inside it both lost skeletons: one reveal, on the card.
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal.mock.calls[0][0]?.within).toBe(getByTestId('card'));
  });

  it('ignores removals that are not skeletons', async () => {
    render(<Harness />);
    await settle();
    act(() => setStatus('running'));
    await settle();
    expect(reveal).not.toHaveBeenCalled();
  });

  it('tears the engine down on unmount', async () => {
    const { unmount } = render(<Harness />);
    await settle();
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
