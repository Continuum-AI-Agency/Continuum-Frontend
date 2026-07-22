import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { cleanup, renderHook } from '@testing-library/react';

const navigation = {
  pathname: '/scale',
  params: new URLSearchParams('tab=performance'),
};

mock.module('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.params,
}));

const { useOptimizerUrlState } = await import('./useOptimizerUrlState');

// The hook writes directly to the History API (Next 16 shallow routing); mock the
// implementations so the assertions read the href without the DOM actually navigating.
const pushState = spyOn(window.history, 'pushState').mockImplementation(() => undefined);
const replaceState = spyOn(window.history, 'replaceState').mockImplementation(() => undefined);

afterEach(() => {
  cleanup();
  navigation.params = new URLSearchParams('tab=performance');
  pushState.mockClear();
  replaceState.mockClear();
});

describe('useOptimizerUrlState', () => {
  it('uses replaceState for view and metric controls', () => {
    const { result } = renderHook(() => useOptimizerUrlState());

    result.current.setView('logs');
    result.current.setMetric('roas');

    expect(replaceState).toHaveBeenNthCalledWith(
      1,
      null,
      '',
      '/scale?tab=performance&optimizerView=logs',
    );
    expect(replaceState).toHaveBeenNthCalledWith(2, null, '', '/scale?tab=performance&metric=roas');
  });

  it('uses pushState for portfolio navigation and clears the drill-in + section on close', () => {
    navigation.params = new URLSearchParams(
      'tab=performance&optimizerView=portfolios&portfolio=portfolio-1&adset=adset-1&section=manage',
    );
    const { result } = renderHook(() => useOptimizerUrlState());

    result.current.openPortfolio('portfolio-2');
    result.current.closePortfolio();

    expect(pushState).toHaveBeenNthCalledWith(
      1,
      null,
      '',
      '/scale?tab=performance&optimizerView=portfolios&portfolio=portfolio-2',
    );
    expect(pushState).toHaveBeenNthCalledWith(
      2,
      null,
      '',
      '/scale?tab=performance&optimizerView=portfolios',
    );
  });

  it('deep-opens a portfolio directly on a non-default section', () => {
    const { result } = renderHook(() => useOptimizerUrlState());

    result.current.openPortfolio('portfolio-9', { section: 'manage' });

    expect(pushState).toHaveBeenNthCalledWith(
      1,
      null,
      '',
      '/scale?tab=performance&optimizerView=portfolios&portfolio=portfolio-9&section=manage',
    );
  });

  it('pushes the create view with no portfolio param', () => {
    navigation.params = new URLSearchParams(
      'tab=performance&optimizerView=portfolios&portfolio=portfolio-1&adset=adset-1',
    );
    const { result } = renderHook(() => useOptimizerUrlState());

    result.current.openCreate();

    expect(pushState).toHaveBeenNthCalledWith(
      1,
      null,
      '',
      '/scale?tab=performance&optimizerView=create',
    );
  });

  it('adds the section param on switch and drops it back to the performance default', () => {
    navigation.params = new URLSearchParams(
      'tab=performance&optimizerView=portfolios&portfolio=portfolio-1&section=manage',
    );
    const { result } = renderHook(() => useOptimizerUrlState());

    result.current.setSection('activity');
    result.current.setSection('performance');

    expect(replaceState).toHaveBeenNthCalledWith(
      1,
      null,
      '',
      '/scale?tab=performance&optimizerView=portfolios&portfolio=portfolio-1&section=activity',
    );
    expect(replaceState).toHaveBeenNthCalledWith(
      2,
      null,
      '',
      '/scale?tab=performance&optimizerView=portfolios&portfolio=portfolio-1',
    );
  });

  it('parses the section param and falls back to performance', () => {
    navigation.params = new URLSearchParams(
      'tab=performance&portfolio=portfolio-1&section=activity',
    );
    const active = renderHook(() => useOptimizerUrlState());
    expect(active.result.current.section).toBe('activity');
    cleanup();

    navigation.params = new URLSearchParams('tab=performance&portfolio=portfolio-1&section=bogus');
    const invalid = renderHook(() => useOptimizerUrlState());
    expect(invalid.result.current.section).toBe('performance');
    cleanup();

    navigation.params = new URLSearchParams('tab=performance');
    const missing = renderHook(() => useOptimizerUrlState());
    expect(missing.result.current.section).toBe('performance');
  });
});
