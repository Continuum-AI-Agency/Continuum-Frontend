'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

const VIEWS = ['overview', 'portfolios', 'actions', 'logs'] as const;
const METRICS = ['spend', 'cost', 'roas', 'ctr'] as const;

export type OptimizerView = (typeof VIEWS)[number];
export type OptimizerAdMetric = (typeof METRICS)[number];

function isOneOf<T extends readonly string[]>(value: string | null, values: T): value is T[number] {
  return value != null && values.some((candidate) => candidate === value);
}

/** URL-owned optimizer navigation makes a portfolio detail, creative drill-in,
 * metric selection, and sub-view shareable without persisting server data in a
 * client store. Structural navigation creates history; lightweight controls do
 * not flood it. */
export function useOptimizerUrlState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const state = useMemo(() => {
    const view = searchParams.get('optimizerView');
    const metric = searchParams.get('metric');
    return {
      view: isOneOf(view, VIEWS) ? view : 'overview',
      portfolioId: searchParams.get('portfolio'),
      adsetId: searchParams.get('adset'),
      metric: isOneOf(metric, METRICS) ? metric : 'spend',
    };
  }, [searchParams]);

  const navigate = useCallback(
    (mutate: (params: URLSearchParams) => void, history: 'push' | 'replace') => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.set('tab', 'performance');
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (history === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setView = useCallback(
    (view: OptimizerView) => {
      navigate((params) => {
        params.set('optimizerView', view);
      }, 'replace');
    },
    [navigate],
  );

  const openPortfolio = useCallback(
    (portfolioId: string) => {
      navigate((params) => {
        params.set('optimizerView', 'portfolios');
        params.set('portfolio', portfolioId);
        params.delete('adset');
      }, 'push');
    },
    [navigate],
  );

  const closePortfolio = useCallback(() => {
    navigate((params) => {
      params.set('optimizerView', 'portfolios');
      params.delete('portfolio');
      params.delete('adset');
    }, 'push');
  }, [navigate]);

  const setAdset = useCallback(
    (adsetId: string | null) => {
      navigate((params) => {
        if (adsetId) params.set('adset', adsetId);
        else params.delete('adset');
      }, 'replace');
    },
    [navigate],
  );

  const setMetric = useCallback(
    (metric: OptimizerAdMetric) => {
      navigate((params) => {
        params.set('metric', metric);
      }, 'replace');
    },
    [navigate],
  );

  return { ...state, setView, openPortfolio, closePortfolio, setAdset, setMetric };
}
