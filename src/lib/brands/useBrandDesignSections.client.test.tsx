// Same double-mount as useBrandDirectionPieces — GroundingSection reads the rows for its
// toggle handlers and the GroundingPopover it renders reads them again — plus one instance
// per generation node on the canvas. These assert one request covers all of them, and that
// the derived rows keep their identity so caller `useCallback` deps do not churn.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const BRAND = 'f24075ca-ea03-49fd-b98d-71915c271506';

const SNAPSHOT = {
  rigor: 'strict',
  sections: [
    { section: 'colour', title: 'Colour', enabled: true, rules: [{ id: 'r1' }] },
    { section: 'motion', title: 'Motion', enabled: false, rules: [{ id: 'r2' }] },
  ],
};

const RESPONSE = {
  present: true,
  status: 'ready',
  version: 1,
  updated_at: '2026-08-01T00:00:00.000Z',
  design_system: SNAPSHOT,
  design_system_id: 'ds-1',
};

const fetchDesignSystem = mock(async () => RESPONSE);

mock.module('@/lib/brands/designSystem.client', () => ({ fetchDesignSystem }));

const { useBrandDesignSections } = await import('./useBrandDesignSections.client');

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

afterEach(() => {
  cleanup();
  fetchDesignSystem.mockClear();
});

describe('useBrandDesignSections', () => {
  it('serves two simultaneous instances of the same brand from one request', async () => {
    const { result } = renderHook(
      () => ({
        section: useBrandDesignSections(BRAND),
        popover: useBrandDesignSections(BRAND),
      }),
      { wrapper: createWrapper(newClient()) },
    );

    await waitFor(() => {
      expect(result.current.section.isLoading).toBe(false);
      expect(result.current.popover.isLoading).toBe(false);
    });

    expect(fetchDesignSystem).toHaveBeenCalledTimes(1);
    // Only the enabled section becomes a togglable row.
    expect(result.current.section.sections.map((row) => row.section)).toEqual(['colour']);
    expect(result.current.popover.sections.map((row) => row.section)).toEqual(['colour']);
    expect(result.current.section.designSystemId).toBe('ds-1');
    expect(result.current.section.snapshot).toEqual(SNAPSHOT);
  });

  it('keeps one identity for the derived rows across re-renders', async () => {
    const { result, rerender } = renderHook(() => useBrandDesignSections(BRAND), {
      wrapper: createWrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const rows = result.current.sections;
    rerender();

    expect(result.current.sections).toBe(rows);
  });

  it('does not refetch when the inspector is reopened inside the stale window', async () => {
    const queryClient = newClient();
    const wrapper = createWrapper(queryClient);

    const first = renderHook(() => useBrandDesignSections(BRAND), { wrapper });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useBrandDesignSections(BRAND), { wrapper });
    await waitFor(() => expect(second.result.current.designSystemId).toBe('ds-1'));

    expect(fetchDesignSystem).toHaveBeenCalledTimes(1);
  });

  it('reads nothing and reports no load without a brand', () => {
    const { result } = renderHook(() => useBrandDesignSections(undefined), {
      wrapper: createWrapper(newClient()),
    });

    expect(fetchDesignSystem).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.sections).toEqual([]);
    expect(result.current.snapshot).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('keeps a failed read distinct from a brand with no system', async () => {
    fetchDesignSystem.mockImplementationOnce(() => {
      throw new Error('design system read failed');
    });

    const { result } = renderHook(() => useBrandDesignSections(BRAND), {
      wrapper: createWrapper(newClient()),
    });

    await waitFor(() => expect(result.current.error).toBe('design system read failed'));
    expect(result.current.sections).toEqual([]);
    expect(result.current.snapshot).toBeNull();
  });
});
