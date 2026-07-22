import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';

import { useTimelineBlocks } from './useTimelineBlocks';

const baseStart = '2026-03-01T00:00:00.000Z';
const baseEnd = '2026-03-02T00:00:00.000Z';

function buildBlock(id: string, campaignId: string) {
  return {
    id,
    brand_id: 'brand-1',
    account_id: 'act_1',
    block_start: baseStart,
    block_end: baseEnd,
    resolution: 'daily',
    version: 1,
    built_at: baseEnd,
    summary: {},
    campaigns: [
      {
        id: campaignId,
        name: `Campaign ${campaignId}`,
        ad_sets: [],
        metrics_daily: [],
      },
    ],
    events: [],
    deltas: {},
    content_hash: '',
  };
}

describe('useTimelineBlocks', () => {
  let originalFetch: typeof global.fetch;
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;
  let consoleErrorSpy: ReturnType<typeof mock>;
  let consoleWarnSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    consoleErrorSpy = mock(() => {});
    consoleWarnSpy = mock(() => {});
    console.error = consoleErrorSpy as unknown as typeof console.error;
    console.warn = consoleWarnSpy as unknown as typeof console.warn;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  it('keeps timeline data when non-primary resolution prefetch fails', async () => {
    const fetchMock = mock((_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { resolution?: string };
      if (body.resolution === 'daily') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ blocks: [buildBlock('block-primary', 'campaign-primary')] }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(new Response('<html>upstream failure</html>', { status: 546 }));
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useTimelineBlocks({
        brandId: 'brand-success',
        accountId: 'act-success',
        startDate: baseStart,
        endDate: baseEnd,
        resolution: 'daily',
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect((global.fetch as unknown as ReturnType<typeof mock>).mock.calls.length).toBe(2),
    );

    expect(result.current.error).toBeNull();
    expect(result.current.blocks).toHaveLength(1);
    expect(result.current.campaigns.map((campaign) => campaign.id)).toEqual(['campaign-primary']);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain(
      'Failed to prefetch hourly timeline blocks',
    );
  });

  it('sets error when primary resolution request fails', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response('<html>upstream failure</html>', { status: 546 })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useTimelineBlocks({
        brandId: 'brand-error',
        accountId: 'act-error',
        startDate: baseStart,
        endDate: baseEnd,
        resolution: 'daily',
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.blocks).toHaveLength(0);
    expect(result.current.campaigns).toHaveLength(0);
    expect(result.current.error?.message).toBe('Failed to fetch timeline blocks');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
