import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, renderHook } from '@testing-library/react';

const navigation = {
  pathname: '/scale',
  params: new URLSearchParams('tab=performance'),
  push: mock(() => undefined),
  replace: mock(() => undefined),
};

mock.module('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

const { useOptimizerUrlState } = await import('./useOptimizerUrlState');

afterEach(() => {
  cleanup();
  navigation.params = new URLSearchParams('tab=performance');
  navigation.push.mockClear();
  navigation.replace.mockClear();
});

describe('useOptimizerUrlState', () => {
  it('uses replace for view and metric controls', () => {
    const { result } = renderHook(() => useOptimizerUrlState());

    result.current.setView('logs');
    result.current.setMetric('roas');

    expect(navigation.replace).toHaveBeenNthCalledWith(
      1,
      '/scale?tab=performance&optimizerView=logs',
      {
        scroll: false,
      },
    );
    expect(navigation.replace).toHaveBeenNthCalledWith(2, '/scale?tab=performance&metric=roas', {
      scroll: false,
    });
  });

  it('uses push for portfolio navigation and clears the nested drill-in on close', () => {
    navigation.params = new URLSearchParams(
      'tab=performance&optimizerView=portfolios&portfolio=portfolio-1&adset=adset-1',
    );
    const { result } = renderHook(() => useOptimizerUrlState());

    result.current.openPortfolio('portfolio-2');
    result.current.closePortfolio();

    expect(navigation.push).toHaveBeenNthCalledWith(
      1,
      '/scale?tab=performance&optimizerView=portfolios&portfolio=portfolio-2',
      { scroll: false },
    );
    expect(navigation.push).toHaveBeenNthCalledWith(
      2,
      '/scale?tab=performance&optimizerView=portfolios',
      {
        scroll: false,
      },
    );
  });
});
