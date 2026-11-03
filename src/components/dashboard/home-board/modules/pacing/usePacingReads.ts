'use client';

// The pacing tile's reads. Two, both the Optimizer's own:
//   1. optimizer_list_portfolios(p_brand_id) through useOptimizerPortfolios — the brand's one
//      cached portfolio read every Optimizer view selects from, so the Home and the Optimizer
//      share it;
//   2. for each portfolio whose flight contains today (usually none, sometimes one or two), the
//      optimizer-status edge (optimizer_get_portfolio_performance) under the Optimizer's own
//      `performance` key, parsed with the same CycleRunReportSchema, so the portfolio page and
//      its prefetch reuse the entry. Only the latest run's pacing block is read from it.
// Read-only: both check brand membership server-side.

import { CycleRunReportSchema, CycleRunRowSchema, flightOf, todayIso } from '@continuum/contracts';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  optimizerQueryKeys,
  useOptimizerPortfolios,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PacingRunRead, PortfoliosRead } from './pacingModel';

const FIVE_MINUTES = 5 * 60 * 1000;

async function fetchLatestRunReport(portfolioId: string) {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke('optimizer-status', {
    body: { portfolio_id: portfolioId },
  });
  if (error) throw new Error('optimizer-status unreachable');
  const parsed = CycleRunReportSchema.safeParse(data);
  if (!parsed.success) throw new Error('optimizer-status returned an unexpected report shape');
  return parsed.data;
}

export type PacingReads = {
  portfolios: PortfoliosRead;
  runs: ReadonlyMap<string, PacingRunRead>;
  today: string;
  retry: () => void;
};

export function usePacingReads(brandId: string): PacingReads {
  const portfoliosQuery = useOptimizerPortfolios(brandId, null);
  const today = todayIso();
  const rows = portfoliosQuery.brandPortfolios;
  const flightIds = useMemo(
    () =>
      rows
        .filter((row) => {
          const flight = flightOf(row);
          return (
            row.status !== 'archived' &&
            flight !== null &&
            flight.periodStart <= today &&
            today <= flight.periodEnd
          );
        })
        .map((row) => row.id),
    [rows, today],
  );
  const results = useQueries({
    queries: flightIds.map((portfolioId) => ({
      queryKey: optimizerQueryKeys.performance(portfolioId),
      queryFn: () => fetchLatestRunReport(portfolioId),
      staleTime: FIVE_MINUTES,
      retry: 1,
    })),
  });

  const runs = new Map<string, PacingRunRead>();
  flightIds.forEach((id, index) => {
    const result = results[index];
    if (!result || result.status === 'pending') {
      runs.set(id, { status: 'pending' });
    } else if (result.status === 'error') {
      runs.set(id, { status: 'error' });
    } else {
      const run = CycleRunRowSchema.safeParse(result.data?.latest_run);
      runs.set(id, { status: 'ready', pacing: run.success ? (run.data.pacing ?? null) : null });
    }
  });

  const portfolios: PortfoliosRead = portfoliosQuery.hasAnswer
    ? { status: 'ready', rows }
    : portfoliosQuery.isError
      ? { status: 'error' }
      : { status: 'pending' };

  const retry = () => {
    if (portfoliosQuery.isError) void portfoliosQuery.refetch();
    for (const result of results) {
      if (result.isError) void result.refetch();
    }
  };

  return { portfolios, runs, today, retry };
}
