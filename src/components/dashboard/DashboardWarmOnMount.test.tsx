import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { WARM_LEASE_LONG_MS, warmLeaseKey } from '@/lib/dashboard/warm-lease';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

const invokeMock = mock(async (_fn: string, _opts: unknown) => ({
  data: { status: 'ok' },
  error: null,
}));
const invalidateMock = mock((_args: unknown) => {});
const revalidateMock = mock(async (_brandId: string) => {});

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ functions: { invoke: invokeMock } }),
}));

mock.module('@/lib/dashboard/actions', () => ({
  revalidateBrandInsightsAction: revalidateMock,
}));

mock.module('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateMock }),
}));

import { DashboardWarmOnMount } from './DashboardWarmOnMount';

describe('DashboardWarmOnMount', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    invokeMock.mockClear();
    invalidateMock.mockClear();
    revalidateMock.mockClear();
  });

  afterEach(() => cleanup());

  it('fires a single warm when the lease is open', async () => {
    render(<DashboardWarmOnMount brandId="brand-1" isCold />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const [fnName, opts] = invokeMock.mock.calls[0];
    expect(fnName).toBe('warm-brand-now');
    expect(opts).toMatchObject({ method: 'POST', body: { brandId: 'brand-1' } });
  });

  it('does not warm while a fresh lease is held', async () => {
    window.sessionStorage.setItem(warmLeaseKey('brand-1'), String(Date.now() + WARM_LEASE_LONG_MS));

    render(<DashboardWarmOnMount brandId="brand-1" isCold />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('revalidates insights and clears the syncing state once the warm completes', async () => {
    render(<DashboardWarmOnMount brandId="brand-1" isCold />);

    await waitFor(() => expect(revalidateMock).toHaveBeenCalledWith('brand-1'));
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Syncing brand context…')).toBeNull());
  });

  it('shows the syncing indicator on a cold dashboard', async () => {
    render(<DashboardWarmOnMount brandId="brand-1" isCold />);
    expect(screen.getByText('Syncing brand context…')).toBeDefined();
  });

  it('stays silent on a warm dashboard', async () => {
    render(<DashboardWarmOnMount brandId="brand-1" isCold={false} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Syncing brand context…')).toBeNull();
  });
});
