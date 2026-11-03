// A Home context for this unit's render tests (pacing, health, setup), built through the real
// readBrand / readHomeBoard so the mode, the verb and the goal are the ones a brand would get.
import {
  type HomeBrandSignals,
  type HomePortfolioSignal,
  readBrand,
  readHomeBoard,
} from '@continuum/contracts';
import { deriveDashboardSetup } from '@/components/dashboard/first-run/setupState';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import type { HomeBoardContext } from '../../../types';

export const EASY_FIT_META: HomeAdAccount = {
  id: 'act_521903353286118',
  name: 'Easy Fit',
  currency: 'MXN',
  platform: 'meta',
};

export const EASY_FIT_GOOGLE: HomeAdAccount = {
  id: '5251780631',
  name: 'Easy Fit Google',
  currency: 'MXN',
  platform: 'google_ads',
};

export function portfolioSignal(overrides: Partial<HomePortfolioSignal> = {}): HomePortfolioSignal {
  return {
    id: '0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
    name: 'Conversaciones Whatsapp',
    applyMode: 'autopilot',
    status: 'active',
    autopilotPaused: false,
    pendingRecommendations: 0,
    pendingBudgetMoves: 0,
    staleForDays: null,
    rosterAbsent: false,
    ...overrides,
  };
}

export function homeCtx(
  options: {
    adAccounts?: HomeAdAccount[];
    signals?: Partial<HomeBrandSignals>;
    setup?: HomeBoardContext['setup'];
  } = {},
): HomeBoardContext {
  const adAccounts = options.adAccounts ?? [EASY_FIT_META];
  const signals: HomeBrandSignals = {
    accounts: { ads: adAccounts.length, organic: 0 },
    savedGoal: null,
    business: null,
    portfolios: [portfolioSignal()],
    approvalRequired: false,
    ...options.signals,
  };
  const reading = readBrand(signals);
  return {
    brandId: '148583e0-5538-462b-8d3a-acd25b80344e',
    brandName: 'Easy Fit',
    userId: 'user-1',
    adAccounts,
    organicAccounts: [],
    profileRows: [],
    reading,
    board: readHomeBoard(signals, { reading, language: 'en' }),
    setup:
      options.setup === undefined
        ? deriveDashboardSetup({
            hasConnectedProviders: adAccounts.length > 0,
            hasAssignedAccounts: adAccounts.length > 0,
            brandBook: null,
          })
        : options.setup,
    brandBookRefreshedAt: null,
  };
}
