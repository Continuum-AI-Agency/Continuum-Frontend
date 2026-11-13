import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';

type StatusListener = { onStatus: (status: { status: string; message?: string }) => void };

const show = mock();
const routerRefresh = mock();
const revalidateBrandInsights = mock(async (_brandId: string) => undefined);
const generateBrandInsights = mock(async (_input: unknown): Promise<unknown> => ({}));
let terminalStatus: { status: string; message?: string } = { status: 'completed' };
const subscribeToBrandInsightsJob = mock((listener: StatusListener) => {
  queueMicrotask(() => listener.onStatus(terminalStatus));
  return () => undefined;
});

mock.module('next/navigation', () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));
mock.module('@/lib/actions/brandInsights', () => ({ revalidateBrandInsights }));
mock.module('@/lib/api/brandInsights.client', () => ({
  generateBrandInsights,
  subscribeToBrandInsightsJob,
  isTerminalBrandInsightsStatus: (status?: string) =>
    ['completed', 'failed', 'error', 'not_found'].includes(status ?? ''),
}));

const { useBrandInsightsRefresh } = await import('./useBrandInsightsRefresh');

const PROCESSING = { status: 'processing', generationId: 'gen-1', fallbackPollUrl: '/poll' };

describe('useBrandInsightsRefresh', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    for (const fn of [
      show,
      routerRefresh,
      revalidateBrandInsights,
      generateBrandInsights,
      subscribeToBrandInsightsJob,
    ]) {
      fn.mockClear();
    }
    terminalStatus = { status: 'completed' };
    generateBrandInsights.mockImplementation(async () => PROCESSING);
  });
  afterEach(cleanup);

  it('enqueues the first generation once per session for a brand with no report', async () => {
    const first = renderHook(() =>
      useBrandInsightsRefresh('brand-new', { autoStartFirstRun: true }),
    );
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
    first.unmount();
    renderHook(() => useBrandInsightsRefresh('brand-new', { autoStartFirstRun: true }));

    expect(generateBrandInsights).toHaveBeenCalledTimes(1);
    expect(generateBrandInsights.mock.calls[0]?.[0]).toEqual({ brandId: 'brand-new' });
    // The finished run is read fresh, not from the cached /api/trends/read.
    expect(revalidateBrandInsights).toHaveBeenCalledWith('brand-new');
    expect(show).not.toHaveBeenCalled();
  });

  it('does not start a run for a brand that already has a report', () => {
    renderHook(() => useBrandInsightsRefresh('brand-done', { autoStartFirstRun: false }));
    expect(generateBrandInsights).not.toHaveBeenCalled();
  });

  it('reports a brand whose brand report is not ready as waiting, not failed', async () => {
    generateBrandInsights.mockImplementation(async () => {
      throw new ApiError('not ready', 409, undefined, { error_code: 'brand_context_not_ready' });
    });
    const { result } = renderHook(() => useBrandInsightsRefresh('brand-wait'));
    await act(() => result.current.refresh());

    expect(result.current.waitingForBrandReport).toBe(true);
    expect(result.current.error).toBeNull();
    expect(show).not.toHaveBeenCalled();
  });

  it('shows one toast with the reason for a failed run, and Retry starts a new run', async () => {
    terminalStatus = { status: 'failed', message: 'Search providers timed out.' };
    const { result } = renderHook(() => useBrandInsightsRefresh('brand-fail'));
    await act(() => result.current.refresh());
    await act(() => result.current.refresh());

    expect(result.current.error).toBe('Search providers timed out.');
    expect(show).toHaveBeenCalledTimes(1);
    const toast = show.mock.calls[0]?.[0] as {
      description: string;
      action: { label: string; onClick: () => void };
    };
    expect(toast.description).toBe('Search providers timed out.');
    expect(toast.action.label).toBe('Retry');

    terminalStatus = { status: 'completed' };
    generateBrandInsights.mockClear();
    await act(async () => {
      toast.action.onClick();
      await waitFor(() => expect(generateBrandInsights).toHaveBeenCalledTimes(1));
    });
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
