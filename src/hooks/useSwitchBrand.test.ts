import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import type { SelectBrandResult } from '@/components/providers/ActiveBrandProvider';
import * as storeRegistry from '@/lib/storage/storeRegistry';
import type { SwitchBrandOutcome } from './useSwitchBrand';

const ACTIVE_BRAND_CONTEXT_PATH = '@/components/providers/ActiveBrandProvider';
const NEXT_NAV_PATH = 'next/navigation';

type MockState = {
  selectBrand: (brandId: string) => Promise<SelectBrandResult>;
  pathname: string;
  push: (url: string) => void;
  refresh: () => void;
};

const state: MockState = {
  selectBrand: async () => ({ switched: true, prevBrandId: 'brand-a' }),
  pathname: '/dashboard',
  push: () => {},
  refresh: () => {},
};

mock.module(ACTIVE_BRAND_CONTEXT_PATH, () => ({
  useActiveBrandContext: () => ({
    selectBrand: (id: string) => state.selectBrand(id),
  }),
}));

mock.module(NEXT_NAV_PATH, () => ({
  useRouter: () => ({
    push: (url: string) => state.push(url),
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => state.refresh(),
  }),
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
  redirect: () => {},
  notFound: () => {},
}));

const { useSwitchBrand } = await import('./useSwitchBrand');

describe('useSwitchBrand', () => {
  beforeEach(() => {
    storeRegistry.reset();
    state.selectBrand = async () => ({ switched: true, prevBrandId: 'brand-a' });
    state.pathname = '/dashboard';
    state.push = () => {};
  });

  it('returns switched=false without firing teardown when no switch occurred', async () => {
    const teardownFn = mock(() => {});
    storeRegistry.register({ name: 'test', teardown: teardownFn });
    state.selectBrand = async () => ({ switched: false, prevBrandId: 'brand-a' });

    const { result } = renderHook(() => useSwitchBrand());

    let outcome: SwitchBrandOutcome | undefined;
    await act(async () => {
      outcome = await result.current('brand-a');
    });

    expect(outcome).toEqual({ switched: false, prevBrandId: 'brand-a', redirected: false });
    expect(teardownFn).not.toHaveBeenCalled();
  });

  it('fires teardown(prevBrandId) and purge after a successful switch', async () => {
    const calls: string[] = [];
    storeRegistry.register({
      name: 'store',
      teardown: (id: string) => calls.push(`teardown:${id}`),
      purge: (id: string) => calls.push(`purge:${id}`),
    });
    state.selectBrand = async () => ({ switched: true, prevBrandId: 'brand-a' });

    const { result } = renderHook(() => useSwitchBrand());

    await act(async () => {
      await result.current('brand-b');
    });

    expect(calls).toEqual(['teardown:brand-a', 'purge:brand-a']);
  });

  it('redirects to / when switching from /onboarding', async () => {
    state.pathname = '/onboarding/step-2';
    const pushed: string[] = [];
    state.push = (url) => pushed.push(url);

    const { result } = renderHook(() => useSwitchBrand());

    let outcome: SwitchBrandOutcome | undefined;
    await act(async () => {
      outcome = await result.current('brand-b');
    });

    expect(pushed).toEqual(['/']);
    expect(outcome?.redirected).toBe(true);
  });

  it('does not redirect when switching from a non-onboarding path', async () => {
    state.pathname = '/dashboard';
    const pushed: string[] = [];
    state.push = (url) => pushed.push(url);

    const { result } = renderHook(() => useSwitchBrand());

    let outcome: SwitchBrandOutcome | undefined;
    await act(async () => {
      outcome = await result.current('brand-b');
    });

    expect(pushed).toEqual([]);
    expect(outcome?.redirected).toBe(false);
  });

  it('does not run teardown or redirect when the switch fails to occur', async () => {
    state.pathname = '/onboarding';
    const teardownFn = mock(() => {});
    storeRegistry.register({ name: 'store', teardown: teardownFn });
    state.selectBrand = async () => ({ switched: false, prevBrandId: 'brand-a' });
    const pushed: string[] = [];
    state.push = (url) => pushed.push(url);

    const { result } = renderHook(() => useSwitchBrand());

    await act(async () => {
      await result.current('brand-a');
    });

    expect(teardownFn).not.toHaveBeenCalled();
    expect(pushed).toEqual([]);
  });
});
