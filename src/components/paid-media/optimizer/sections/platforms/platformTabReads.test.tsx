import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// The Google tab's two reads (G2): its portfolios, selected from the ONE brand read the page
// shell already holds, and its cards, from optimizer_get_platform_cards. The client is
// replaced at the RPC; the parsing, the selection and the states are the real ones.
type Answer = { data: unknown; error: unknown };
let answers: Record<string, () => Answer> = {};
const calls: { fn: string; args: Record<string, unknown> }[] = [];
const rpc = async (fn: string, args: Record<string, unknown> = {}): Promise<Answer> => {
  calls.push({ fn, args });
  const answer = answers[fn];
  if (!answer) throw new Error(`unexpected rpc ${fn}`);
  return answer();
};
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ rpc, schema: () => ({ rpc }) }),
}));

const { useOptimizerPlatformCards, useOptimizerPlatformPortfolios, useOptimizerPortfolios } =
  await import('../../useOptimizerData');

const BRAND = '22222222-2222-4222-8222-222222222222';
const GOOGLE_ID = '7a7a7a7a-0000-4000-8000-0000000000e3';
const MIXED_ID = '7a7a7a7a-0000-4000-8000-0000000000e4';
const META_ID = '11111111-1111-4111-8111-111111111111';

function row(id: string, adAccountId: string, platforms?: string[]) {
  return {
    id,
    name: id,
    ad_account_id: adAccountId,
    objective: 'lead',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 500,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 2,
    pending_recommendations: 0,
    ...(platforms ? { platforms } : {}),
  };
}

const GRANTS = [
  {
    platform: 'meta_ads',
    account_id: 'act_easyfit',
    name: 'Easy Fit',
    status: 'active',
    currency: 'MXN',
  },
  {
    platform: 'google_ads',
    account_id: '5251780631',
    name: 'Easy Fit G',
    status: null,
    currency: 'MXN',
  },
];

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  calls.length = 0;
  answers = {};
});

describe('useOptimizerPlatformPortfolios', () => {
  it("lists the brand's Google portfolios from the page's own read, whichever account is selected", async () => {
    answers = {
      optimizer_list_portfolios: () => ({
        data: [
          row(META_ID, 'act_easyfit', ['meta']),
          row(GOOGLE_ID, '5251780631', ['google_ads']),
          row(MIXED_ID, 'act_easyfit', ['meta', 'google_ads']),
        ],
        error: null,
      }),
      list_brand_ad_accounts: () => ({ data: GRANTS, error: null }),
    };
    const { result } = renderHook(
      () => ({
        selected: useOptimizerPortfolios(BRAND, 'act_easyfit'),
        google: useOptimizerPlatformPortfolios(BRAND, 'google_ads'),
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.google.isSuccess).toBe(true));
    expect(result.current.google.data.map((p) => p.id)).toEqual([GOOGLE_ID, MIXED_ID]);
    // The selected Meta account's view is unchanged: the Google-only portfolio is not on it.
    expect(result.current.selected.data.map((p) => p.id)).toEqual([META_ID, MIXED_ID]);
    // One brand read answers both.
    expect(calls.filter((call) => call.fn === 'optimizer_list_portfolios')).toHaveLength(1);
  });

  it("falls back to the brand's granted Google accounts when the server sends no platforms", async () => {
    answers = {
      optimizer_list_portfolios: () => ({
        data: [
          row(META_ID, 'act_easyfit'),
          row(GOOGLE_ID, '5251780631'),
          row(MIXED_ID, '9999999999'),
        ],
        error: null,
      }),
      list_brand_ad_accounts: () => ({ data: GRANTS, error: null }),
    };
    const { result } = renderHook(() => useOptimizerPlatformPortfolios(BRAND, 'google_ads'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.data.map((p) => p.id)).toEqual([GOOGLE_ID]));
    // The row comes back naming the platform it was selected on, for every reader's chips.
    expect(result.current.data[0]?.platforms).toEqual(['google_ads']);
  });
});

describe('useOptimizerPlatformCards', () => {
  const benchDocument = JSON.parse(
    readFileSync(
      join(import.meta.dir, '../platformCards/__fixtures__/accountReadPlatformCards.json'),
      'utf8',
    ),
  ) as { read: { candidates: { platform_card?: unknown }[] } };
  const googleCards = benchDocument.read.candidates.filter((card) => card.platform_card);

  it("asks for one platform's cards across the brand and reads them, the write switch included", async () => {
    const withSwitch = googleCards.map((card, index) => ({
      ...card,
      ...((card as { card_action?: object }).card_action
        ? {
            card_action: {
              ...(card as { card_action: object }).card_action,
              apply_enabled: index !== 0,
            },
          }
        : {}),
    }));
    answers = { optimizer_get_platform_cards: () => ({ data: withSwitch, error: null }) };
    const { result } = renderHook(() => useOptimizerPlatformCards(BRAND, 'google_ads'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(calls).toEqual([
      { fn: 'optimizer_get_platform_cards', args: { p_brand_id: BRAND, p_platform: 'google_ads' } },
    ]);
    if (result.current.status !== 'ready') throw new Error('not ready');
    expect(result.current.cards).toHaveLength(googleCards.length);
    expect(result.current.cards[0]?.card_action?.apply_enabled).toBe(false);
  });

  it('fails closed: one card the contract refuses makes the read an error, never a shorter list', async () => {
    answers = {
      optimizer_get_platform_cards: () => ({
        data: [...googleCards, { id: 'platform_signal:broken', detector: 'not_a_detector' }],
        error: null,
      }),
    };
    const errorLog = console.error;
    console.error = () => {};
    try {
      const { result } = renderHook(() => useOptimizerPlatformCards(BRAND, 'google_ads'), {
        wrapper: wrapper(),
      });
      await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 5_000 });
    } finally {
      console.error = errorLog;
    }
  });

  it('reads a failed RPC as an error, and a missing one as not deployed yet', async () => {
    answers = {
      optimizer_get_platform_cards: () => ({ data: null, error: { code: '42501', message: 'no' } }),
    };
    const failed = renderHook(() => useOptimizerPlatformCards(BRAND, 'google_ads'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(failed.result.current.status).toBe('error'), { timeout: 5_000 });
    failed.unmount();

    answers = {
      optimizer_get_platform_cards: () => ({ data: null, error: { code: 'PGRST202' } }),
    };
    const missing = renderHook(() => useOptimizerPlatformCards(BRAND, 'google_ads'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(missing.result.current.status).toBe('unavailable'));
  });
});
