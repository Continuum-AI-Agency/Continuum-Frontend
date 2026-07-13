import { describe, expect, it, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type EarlierPage, prependUnseen, useEarlierHistory } from './useEarlierHistory';

type Item = { id: string };

function renderEarlier(
  fetchPage: (cursor: string) => Promise<EarlierPage<Item> | null>,
  applied: Item[][] = [],
) {
  return renderHook(() =>
    useEarlierHistory<Item>({
      fetchPage,
      applyPage: (items) => {
        applied.push(items);
      },
    }),
  );
}

describe('useEarlierHistory', () => {
  it('has nothing to load until a cursor is seeded', async () => {
    const fetchPage = mock(async () => ({ items: [], nextCursor: null }));
    const { result } = renderEarlier(fetchPage);

    expect(result.current.hasEarlier).toBe(false);

    await act(async () => {
      await result.current.loadEarlier();
    });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('applies a page and advances to the next cursor', async () => {
    const applied: Item[][] = [];
    const fetchPage = mock(async () => ({ items: [{ id: 'a' }], nextCursor: 'older' }));
    const { result } = renderEarlier(fetchPage, applied);

    act(() => result.current.setEarlierCursor('first'));
    expect(result.current.hasEarlier).toBe(true);

    await act(async () => {
      await result.current.loadEarlier();
    });

    expect(fetchPage).toHaveBeenCalledWith('first');
    expect(applied).toEqual([[{ id: 'a' }]]);
    expect(result.current.hasEarlier).toBe(true);
  });

  it('stops offering more once the transcript is fully loaded', async () => {
    const fetchPage = mock(async () => ({ items: [{ id: 'a' }], nextCursor: null }));
    const { result } = renderEarlier(fetchPage);

    act(() => result.current.setEarlierCursor('first'));
    await act(async () => {
      await result.current.loadEarlier();
    });

    expect(result.current.hasEarlier).toBe(false);
  });

  it('does not fire a second page while one is in flight', async () => {
    let release: (page: EarlierPage<Item>) => void = () => {};
    const fetchPage = mock(
      () =>
        new Promise<EarlierPage<Item>>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderEarlier(fetchPage);

    act(() => result.current.setEarlierCursor('first'));
    act(() => {
      void result.current.loadEarlier();
    });
    await waitFor(() => expect(result.current.isLoadingEarlier).toBe(true));

    act(() => {
      void result.current.loadEarlier();
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ items: [], nextCursor: null });
    });
  });

  // A cursor that keeps throwing would otherwise leave the sentinel armed and refire forever.
  it('gives up on the cursor when a page fails', async () => {
    const fetchPage = mock(async () => {
      throw new Error('boom');
    });
    const { result } = renderEarlier(fetchPage);

    act(() => result.current.setEarlierCursor('first'));
    await act(async () => {
      await result.current.loadEarlier();
    });

    expect(result.current.hasEarlier).toBe(false);
    expect(result.current.isLoadingEarlier).toBe(false);
  });

  it('does nothing when the surface cannot fetch right now', async () => {
    const applied: Item[][] = [];
    const fetchPage = mock(async () => null);
    const { result } = renderEarlier(fetchPage, applied);

    act(() => result.current.setEarlierCursor('first'));
    await act(async () => {
      await result.current.loadEarlier();
    });

    expect(applied).toEqual([]);
    expect(result.current.hasEarlier).toBe(true);
  });
});

describe('prependUnseen', () => {
  it('splices older items above the current ones', () => {
    expect(prependUnseen([{ id: 'c' }], [{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('drops ids already present so an overlapping page cannot duplicate a turn', () => {
    expect(prependUnseen([{ id: 'b' }, { id: 'c' }], [{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('returns the same array when nothing is new, so React can skip the render', () => {
    const current = [{ id: 'a' }];
    expect(prependUnseen(current, [{ id: 'a' }])).toBe(current);
    expect(prependUnseen(current, [])).toBe(current);
  });
});
