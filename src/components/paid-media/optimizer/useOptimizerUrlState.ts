'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

const VIEWS = ['overview', 'portfolios', 'actions', 'create', 'logs'] as const;
const SECTIONS = ['performance', 'manage', 'activity'] as const;
const METRICS = ['spend', 'cost', 'roas', 'ctr'] as const;

export type OptimizerView = (typeof VIEWS)[number];
export type WorkspaceSection = (typeof SECTIONS)[number];
export type OptimizerAdMetric = (typeof METRICS)[number];

function isOneOf<T extends readonly string[]>(value: string | null, values: T): value is T[number] {
  return value != null && values.some((candidate) => candidate === value);
}

/** URL-owned optimizer navigation makes a portfolio detail, its inner section, a
 * creative drill-in, metric selection, and sub-view shareable without persisting
 * server data in a client store. Structural navigation creates history; lightweight
 * controls do not flood it.
 *
 * Writes go straight to the History API rather than the Next router: under Next 16
 * shallow routing, `pushState`/`replaceState` re-render `useSearchParams` without a
 * server round-trip, so a section swap is instant instead of a soft navigation. */
export function useOptimizerUrlState() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => {
    const view = searchParams.get('optimizerView');
    const metric = searchParams.get('metric');
    const section = searchParams.get('section');
    return {
      view: isOneOf(view, VIEWS) ? view : 'overview',
      portfolioId: searchParams.get('portfolio'),
      adsetId: searchParams.get('adset'),
      metric: isOneOf(metric, METRICS) ? metric : 'spend',
      // Performance is the implicit default so a bare `?portfolio=` link opens clean.
      section: isOneOf(section, SECTIONS) ? section : 'performance',
    };
  }, [searchParams]);

  const navigate = useCallback(
    (mutate: (params: URLSearchParams) => void, history: 'push' | 'replace') => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.set('tab', 'performance');
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (history === 'push') window.history.pushState(null, '', href);
      else window.history.replaceState(null, '', href);
    },
    [pathname, searchParams],
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
    (portfolioId: string, opts?: { section?: WorkspaceSection }) => {
      navigate((params) => {
        params.set('optimizerView', 'portfolios');
        params.set('portfolio', portfolioId);
        params.delete('adset');
        // Deep-open on a non-default section when asked; otherwise drop any stale
        // section so the portfolio opens on Performance.
        if (opts?.section && opts.section !== 'performance') params.set('section', opts.section);
        else params.delete('section');
      }, 'push');
    },
    [navigate],
  );

  const closePortfolio = useCallback(() => {
    navigate((params) => {
      params.set('optimizerView', 'portfolios');
      params.delete('portfolio');
      params.delete('adset');
      params.delete('section');
    }, 'push');
  }, [navigate]);

  const openCreate = useCallback(() => {
    navigate((params) => {
      params.set('optimizerView', 'create');
      params.delete('portfolio');
      params.delete('adset');
      params.delete('section');
    }, 'push');
  }, [navigate]);

  const setSection = useCallback(
    (section: WorkspaceSection) => {
      navigate((params) => {
        // Keep the default out of the URL so the canonical portfolio link stays bare.
        if (section === 'performance') params.delete('section');
        else params.set('section', section);
      }, 'replace');
    },
    [navigate],
  );

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

  return {
    ...state,
    setView,
    openPortfolio,
    closePortfolio,
    openCreate,
    setSection,
    setAdset,
    setMetric,
  };
}
