// The node inspector mounts this hook twice over — GroundingSection for its own toggle
// handlers, then the GroundingPopover it renders — and every generation node on the canvas
// mounts it again. Before React Query that was one request per instance, landing in the
// same millisecond. These assert the shared key collapses them.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const BRAND = 'f24075ca-ea03-49fd-b98d-71915c271506';

const RESPONSE = {
  brandId: BRAND,
  directionVersion: 2,
  pieces: [{ piece: 'photography', ruleCount: 3, approvedCount: 2, gates: true }],
};

const fetchBrandDirectionPieces = mock(async () => RESPONSE);

mock.module('@/lib/api/brandDirectionPieces.client', () => ({ fetchBrandDirectionPieces }));

const { useBrandDirectionPieces } = await import('./useBrandDirectionPieces.client');

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

afterEach(() => {
  cleanup();
  fetchBrandDirectionPieces.mockClear();
});

describe('useBrandDirectionPieces', () => {
  it('serves two simultaneous instances of the same brand from one request', async () => {
    const { result } = renderHook(
      () => ({
        section: useBrandDirectionPieces(BRAND),
        popover: useBrandDirectionPieces(BRAND),
      }),
      { wrapper: createWrapper(newClient()) },
    );

    await waitFor(() => {
      expect(result.current.section.isLoading).toBe(false);
      expect(result.current.popover.isLoading).toBe(false);
    });

    expect(fetchBrandDirectionPieces).toHaveBeenCalledTimes(1);
    expect(result.current.section.pieces).toEqual(RESPONSE.pieces);
    expect(result.current.popover.pieces).toEqual(RESPONSE.pieces);
    expect(result.current.section.directionVersion).toBe(2);
  });

  it('does not refetch when the inspector is reopened inside the stale window', async () => {
    const queryClient = newClient();
    const wrapper = createWrapper(queryClient);

    const first = renderHook(() => useBrandDirectionPieces(BRAND), { wrapper });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useBrandDirectionPieces(BRAND), { wrapper });
    await waitFor(() => expect(second.result.current.pieces).toEqual(RESPONSE.pieces));

    expect(fetchBrandDirectionPieces).toHaveBeenCalledTimes(1);
  });

  it('reads nothing and reports no load without a brand', () => {
    const { result } = renderHook(() => useBrandDirectionPieces(undefined), {
      wrapper: createWrapper(newClient()),
    });

    expect(fetchBrandDirectionPieces).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.pieces).toEqual([]);
    expect(result.current.directionVersion).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('keeps a failed read distinct from an unauthored brand', async () => {
    fetchBrandDirectionPieces.mockImplementationOnce(() => {
      throw new Error('backend unreachable');
    });

    const { result } = renderHook(() => useBrandDirectionPieces(BRAND), {
      wrapper: createWrapper(newClient()),
    });

    await waitFor(() => expect(result.current.error).toBe('backend unreachable'));
    expect(result.current.pieces).toEqual([]);
  });
});
