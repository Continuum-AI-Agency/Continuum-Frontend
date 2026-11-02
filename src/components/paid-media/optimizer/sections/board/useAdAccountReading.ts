'use client';

// Reads the account the board shows: gathers the signals from the hooks the Overview already
// runs and hands them to readAdAccount. The reading is pure; this hook only collects its inputs.
import {
  type AdAccountPortfolioSignal,
  type AdAccountReading,
  type PortfolioListItem,
  readAdAccount,
} from '@continuum/contracts';
import { useMemo } from 'react';
import { platformWritable } from '../../platformWrites';
import type { BoardPlatform } from './types';

const APPLY_MODES = ['observe', 'recommend', 'autopilot'] as const;

function applyModeOf(value: string): AdAccountPortfolioSignal['applyMode'] {
  return APPLY_MODES.find((mode) => mode === value) ?? 'recommend';
}

export function portfolioSignalOf(
  portfolio: PortfolioListItem,
  platform: BoardPlatform,
): AdAccountPortfolioSignal {
  return {
    id: portfolio.id,
    name: portfolio.name,
    applyMode: applyModeOf(portfolio.apply_mode),
    canWrite: platformWritable(portfolio, platform),
    autopilotPaused: portfolio.autopilot_paused === true,
    pendingRecommendations: portfolio.pending_recommendations,
    rosterAbsent: portfolio.adset_count === 0,
    dailyBudget: portfolio.daily_total,
    goal: portfolio.cpa_target ?? null,
  };
}

export type AdAccountReadingState = {
  reading: AdAccountReading | null;
  isLoading: boolean;
};

export function useAdAccountReading({
  platform,
  portfolios,
  currency,
}: {
  brandId: string;
  platform: BoardPlatform;
  adAccountId: string | null;
  portfolios: PortfolioListItem[];
  currency: string | null;
}): AdAccountReadingState {
  const reading = useMemo(
    () =>
      readAdAccount({
        platform,
        portfolios: portfolios.map((portfolio) => portfolioSignalOf(portfolio, platform)),
        approvalRequired: false,
        currency,
      }),
    [platform, portfolios, currency],
  );
  return { reading, isLoading: false };
}
