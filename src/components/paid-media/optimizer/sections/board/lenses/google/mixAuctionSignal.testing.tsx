// What the G05 / G06 / G10 render tests share: the browser's Supabase client as the boundary (the
// account list, the portfolios, the Optimizer's cards and the paid-media-metrics reads, served
// from the real-read fixtures), the board context a lens is mounted with, and the checks that a
// lens fits a 390px screen and paints only with theme tokens.

import { expect } from 'bun:test';
import {
  type AccountCandidate,
  type AdAccountBoardSlot,
  type BoardModuleId,
  type BoardModuleSize,
  type GoogleAccountOverview,
  type GoogleTopCampaigns,
  readAdAccount,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { BoardContext } from '../../types';

export type ServedAccount = {
  account_id: string;
  name: string;
  currency: string;
  /** The portfolio's objective and cost-per-result goal. */
  objective: string;
  goal: number | null;
  portfolioId: string;
};

export type Served = {
  account: ServedAccount;
  cards: AccountCandidate[];
  overview: GoogleAccountOverview | null;
  campaigns: GoogleTopCampaigns | null;
  /** Every body paid-media-metrics was asked for. */
  invoked: Record<string, unknown>[];
};

/** The browser client the lenses' hooks read through, answering from `served`. */
export function fakeSupabase(served: Served) {
  const rpc = async (fn: string) => {
    if (fn === 'list_brand_ad_accounts') {
      const { account_id, name, currency } = served.account;
      return {
        data: [{ platform: 'google_ads', account_id, name, status: null, currency }],
        error: null,
      };
    }
    if (fn === 'optimizer_list_portfolios') {
      return {
        data: [
          {
            id: served.account.portfolioId,
            name: 'Google portfolio',
            ad_account_id: served.account.account_id,
            objective: served.account.objective,
            level: 'campaign',
            mode: 'balanced',
            apply_mode: 'recommend',
            daily_total: 1870,
            period_budget: null,
            cpa_target: served.account.goal,
            status: 'active',
            next_realloc_at: null,
            adset_count: 2,
            pending_recommendations: served.cards.length,
            platforms: ['google_ads'],
          },
        ],
        error: null,
      };
    }
    if (fn === 'optimizer_get_platform_cards') return { data: served.cards, error: null };
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  };
  const invoke = async (_name: string, options: { body: Record<string, unknown> }) => {
    served.invoked.push(options.body);
    if (options.body.scope === 'account_overview') return { data: served.overview, error: null };
    if (options.body.scope === 'top_campaigns') return { data: served.campaigns, error: null };
    return { data: null, error: null };
  };
  return { rpc, schema: () => ({ rpc }), functions: { invoke } };
}

const noop = () => undefined;

/** The Google tab's board context: no act_ id (the lens resolves the Google account itself) and
 *  the reading of one recommend-only portfolio with `goal`. */
export function googleBoard(brandId: string, goal: number | null): BoardContext {
  return {
    brandId,
    platform: 'google_ads',
    adAccountId: null,
    currency: 'MXN',
    portfolios: [],
    reading: readAdAccount({
      platform: 'google_ads',
      portfolios: [
        {
          id: 'portfolio',
          name: 'Google portfolio',
          applyMode: 'recommend',
          canWrite: false,
          autopilotPaused: false,
          pendingRecommendations: 0,
          rosterAbsent: false,
          dailyBudget: 1870,
          goal,
        },
      ],
      approvalRequired: false,
      currency: 'MXN',
    }),
    onOpenActions: noop,
    onOpenActivity: noop,
    onSelectPortfolio: noop,
    onCreatePortfolio: noop,
  };
}

export function slotOf(
  module: BoardModuleId,
  size: BoardModuleSize,
  reason: string,
): AdAccountBoardSlot {
  return { module, size, score: 60, reason };
}

export function renderWithQueries(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** happy-dom lays nothing out, so a width is asserted from the classes: nothing is pinned wider
 *  than a 390px screen, and every mark is painted with a theme token, never a hex that would not
 *  switch in dark mode. */
export function expectFitsAndThemes(container: HTMLElement) {
  const pinned = [...container.querySelectorAll('[class]')].flatMap((element) =>
    [...(element.getAttribute('class') ?? '').matchAll(/\b(?:min-)?w-\[(\d+)px\]/g)]
      .map((match) => Number(match[1]))
      .filter((px) => px > 358),
  );
  expect(pinned).toEqual([]);
  const hexes = [...container.querySelectorAll('[style]')].filter((element) =>
    /#[0-9a-f]{3,8}\b/i.test(element.getAttribute('style') ?? ''),
  );
  expect(hexes).toHaveLength(0);
}
