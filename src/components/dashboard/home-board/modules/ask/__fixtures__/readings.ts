// Brand signals for each Home mode, read through the real readBrand / readHomeBoard, so the
// fixtures can never drift from what the server hands the board. Shaped on production brands:
// Easy Fit (an autopilot portfolio, leads), Pink Elephant (the client applies the changes).
import {
  type HomeBrandSignals,
  type HomeMode,
  type HomePortfolioSignal,
  readBrand,
  readHomeBoard,
} from '@continuum/contracts';
import type { HomeBoardContext } from '../../../types';

const portfolio = (overrides: Partial<HomePortfolioSignal>): HomePortfolioSignal => ({
  id: 'p-1',
  name: 'Conversaciones Whatsapp',
  applyMode: 'recommend',
  status: 'active',
  autopilotPaused: false,
  pendingRecommendations: 0,
  pendingBudgetMoves: 0,
  staleForDays: null,
  rosterAbsent: false,
  canWrite: true,
  ...overrides,
});

export const SIGNALS: Record<HomeMode, HomeBrandSignals> = {
  setup: {
    accounts: { ads: 0, organic: 0 },
    savedGoal: null,
    business: {
      calls: ['Shop now'],
      descriptions: ['Specialty coffee roasted in Oaxaca, delivering to all of Mexico.'],
    },
    portfolios: [],
    approvalRequired: false,
  },
  fix: {
    accounts: { ads: 2, organic: 1 },
    savedGoal: null,
    business: null,
    portfolios: [
      portfolio({ id: 'p-leads', name: 'Leads // Google Ads only', rosterAbsent: true }),
      portfolio({ id: 'p-wa', name: 'Conversaciones Whatsapp', staleForDays: 4 }),
    ],
    approvalRequired: false,
  },
  operate: {
    accounts: { ads: 1, organic: 1 },
    savedGoal: { id: 'leads', label: 'Leads', metric: 'leads', role: 'primary' },
    business: null,
    portfolios: [
      portfolio({
        id: 'p-auto',
        name: 'Tours',
        applyMode: 'autopilot',
        pendingRecommendations: 2,
      }),
    ],
    approvalRequired: false,
  },
  approve: {
    accounts: { ads: 1, organic: 0 },
    savedGoal: null,
    business: null,
    portfolios: [
      portfolio({ id: 'p-a', name: 'MENSAJES', pendingRecommendations: 3, pendingBudgetMoves: 1 }),
      portfolio({ id: 'p-b', name: 'FORMULARIOS', pendingRecommendations: 1 }),
    ],
    approvalRequired: false,
  },
  recommend: {
    accounts: { ads: 1, organic: 0 },
    savedGoal: { id: 'leads', label: 'Leads', metric: 'leads', role: 'primary' },
    business: null,
    portfolios: [
      portfolio({
        id: 'p-pink',
        name: 'Pink Elephant Search',
        canWrite: false,
        pendingRecommendations: 4,
      }),
    ],
    approvalRequired: false,
  },
};

export function readingFor(mode: HomeMode) {
  const reading = readBrand(SIGNALS[mode]);
  const board = readHomeBoard(SIGNALS[mode], { reading, language: 'es' });
  return { reading, board };
}

export function ctxFor(
  mode: HomeMode,
  overrides: Partial<HomeBoardContext> = {},
): HomeBoardContext {
  const { reading, board } = readingFor(mode);
  return {
    brandId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    brandName: 'Easy Fit',
    userId: 'user-1',
    adAccounts: [],
    organicAccounts: [],
    profileRows: [],
    reading,
    board,
    setup: null,
    brandBookRefreshedAt: null,
    ...overrides,
  };
}
