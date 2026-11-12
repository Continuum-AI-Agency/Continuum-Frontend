import { renderHook } from '@/i18n/__tests__/render';
// PP-DT-C-unfinished-dashboard-hang-and-raw-error: the URL-reachable Dashboard's insight reads are
// raw `fetch` calls to the Next routes with no bound, and their failure text is the library's —
// a dropped read printed "Failed to fetch" in the Account insights panel, and a hung one kept its
// skeletons for good. Every read reachable by URL ends in a defined state, in words.

import { afterEach, describe, expect, it, jest, mock } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { useAccountInsights } from './useAccountInsights';
import { useCampaignInsights } from './useCampaignInsights';

const originalFetch = globalThis.fetch;
const timeRange = { preset: 'last_7d' } as never;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

/** A fetch that never answers until its signal aborts — what a hung Next route looks like. */
const hangingFetch = () =>
  mock(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  ) as unknown as typeof fetch;

describe('useAccountInsights — the Dashboard read ends in words', () => {
  it('names a dropped read instead of printing the library string', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() =>
      useAccountInsights({
        brandId: 'brand-1',
        adAccountId: 'act_1',
        timeRange,
      }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe(
      "Couldn't load account insights — no connection to the server.",
    );
  });

  it('ends a read that never answers within the bound, and says so', async () => {
    jest.useFakeTimers();
    globalThis.fetch = hangingFetch();
    const { result } = renderHook(() =>
      useAccountInsights({
        brandId: 'brand-1',
        adAccountId: 'act_1',
        timeRange,
      }),
    );
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    jest.useRealTimers();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(
      "Couldn't load account insights — the server didn't answer in time.",
    );
  });
});

describe('useCampaignInsights — the Dashboard read ends in words', () => {
  it('names a dropped read instead of printing the library string', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() =>
      useCampaignInsights({
        brandId: 'brand-1',
        adAccountId: 'act_1',
        campaignId: 'c-1',
        timeRange,
      }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe(
      "Couldn't load campaign insights — no connection to the server.",
    );
  });
});
