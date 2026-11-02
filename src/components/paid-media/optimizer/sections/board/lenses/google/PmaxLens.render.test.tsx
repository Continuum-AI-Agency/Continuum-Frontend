import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type AdAccountBoardSlot,
  type BoardModuleSize,
  GoogleBreakdownReadSchema,
  GoogleSignalsReadSchema,
  type PlatformCard,
  PlatformCardSchema,
  readAdAccount,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { networkFixture } from '../../../google/views/__fixtures__/googleViews';
import {
  easyFitPmaxRead,
  PINK_AD_WINNER,
  pinkCampaignsRead,
  tangassiPmaxRead,
  VIVO_PMAX_CARD,
  VIVO_PMAX_CARD_ES,
  vivoPmaxRead,
} from '../../../google/views/__fixtures__/lensReads';

const sent: Record<string, unknown>[] = [];
const rpc = async (fn: string) => {
  if (fn === 'list_brand_ad_accounts') {
    return {
      data: [
        {
          platform: 'google_ads',
          account_id: '3710693645',
          name: 'VIVO 47',
          status: null,
          currency: 'MXN',
        },
      ],
      error: null,
    };
  }
  if (fn === 'optimizer_get_platform_cards') return { data: [], error: null };
  throw new Error(`unexpected rpc ${fn}`);
};
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    schema: () => ({ rpc }),
    functions: {
      invoke: async (_name: string, options: { body: Record<string, unknown> }) => {
        sent.push(options.body);
        return {
          data: options.body.scope === 'breakdown' ? networkFixture() : vivoPmaxRead(),
          error: null,
        };
      },
    },
  }),
}));

const { default: PmaxLens, PmaxLensView, ChannelSplitView } = await import('./PmaxLens');

afterEach(() => {
  cleanup();
  sent.length = 0;
});

const WIDTHS = [375, 1280] as const;
const CARDS = [VIVO_PMAX_CARD, PINK_AD_WINNER].map((card) => PlatformCardSchema.parse(card));

function atWidth(width: number) {
  (
    window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }
  ).happyDOM.setViewport({ width, height: 900 });
  expect(window.innerWidth).toBe(width);
}

function expectFitsNarrow(container: HTMLElement) {
  const pinned = [...container.querySelectorAll('[class]')].flatMap((element) =>
    [...(element.getAttribute('class') ?? '').matchAll(/\b(?:min-)?w-\[(\d+)px\]/g)]
      .map((match) => Number(match[1]))
      .filter((px) => px > 375),
  );
  expect(pinned).toEqual([]);
}

const slot = (size: BoardModuleSize): AdAccountBoardSlot => ({
  module: 'pmax',
  size,
  score: 75,
  reason: 'PMax a 8× su meta',
});

/** The top campaign's channels from a fixture read, so a view renders without a network. */
const CHANNELS = {
  status: 'ready' as const,
  data: GoogleBreakdownReadSchema.parse(networkFixture()),
};

function view(
  size: BoardModuleSize,
  raw: unknown,
  goal: number | null,
  cards: PlatformCard[] | null = CARDS,
  channels: Parameters<typeof PmaxLensView>[0]['channels'] = size === 's' ? null : CHANNELS,
) {
  return render(
    <PmaxLensView
      channels={channels}
      currency="MXN"
      goal={goal}
      slot={slot(size)}
      state={{ status: 'ready', data: { read: GoogleSignalsReadSchema.parse(raw), cards } }}
    />,
  );
}

const text = (testId: string) => screen.getByTestId(testId).textContent ?? '';

describe('PmaxLensView at s', () => {
  for (const width of WIDTHS) {
    it(`Vivo 47 at ${width}px: $3,283 per conversion against the $400 goal, on a bullet`, () => {
      atWidth(width);
      const { container } = view('s', vivoPmaxRead(), 400);
      const frame = screen.getByTestId('board-module-pmax');
      expect(frame.dataset.size).toBe('s');
      expect(frame.dataset.moduleState).toBe('ready');
      expect(text('pmax-lens-headline')).toBe('$3,283 MXNper conversion · goal $400 MXN · 8.2×');
      expect(text('board-module-pmax-window')).toBe('Last 31 days');
      const dot = screen.getByTestId('pmax-lens-dot');
      expect((dot.firstElementChild as HTMLElement).style.backgroundColor).toBe(
        'var(--board-above)',
      );
      expect(screen.queryByTestId('pmax-lens-campaign')).toBeNull();
      expectFitsNarrow(container);
    });
  }

  it('Tangassi: no goal, so the figure is its 70% of the spend', () => {
    view('s', tangassiPmaxRead(), null, []);
    expect(text('pmax-lens-headline')).toBe(
      '70%of Google spend in Performance Max · $332 MXN per conversion · no goal',
    );
  });

  it("Pink: Search only, the best ad's cost against the dearer one", () => {
    view('s', pinkCampaignsRead(), null);
    expect(text('pmax-lens-headline')).toBe(
      '$88.98 MXNper conversion, the best ad · the dearer one $332 MXN',
    );
  });
});

describe('PmaxLensView at m and l', () => {
  for (const width of WIDTHS) {
    it(`Vivo 47 at ${width}px: the bullet, rank lost, ad strength, the V4 card and channels`, () => {
      atWidth(width);
      const { container } = view('m', vivoPmaxRead(), 400);
      const campaign = screen.getByTestId('pmax-lens-campaign');
      expect(within(campaign).getByText('SALES-PMAX-OCTUBRE')).toBeTruthy();
      expect(campaign.textContent).toContain('$3,283 MXN per conversion');
      expect(within(campaign).getByText('goal $400 MXN')).toBeTruthy();
      expect(text('pmax-lens-rank')).toBe('Impressions lost to rank78%');
      const strength = screen.getByTestId('pmax-lens-strength');
      expect(
        [...strength.querySelectorAll('[data-strength]')].map((cell) => [
          (cell as HTMLElement).dataset.strength,
          (cell as HTMLElement).dataset.count,
        ]),
      ).toEqual([
        ['POOR', '0'],
        ['AVERAGE', '1'],
        ['GOOD', '0'],
        ['EXCELLENT', '0'],
      ]);
      expect(text('pmax-lens-finding')).toBe(
        'Optimizer cardRescue or pause this Performance MaxOption A — rebuild the assets with Jaina — Missing: 1 square YouTube videoOption B — pause it and move its $450 MXN/day',
      );
      expect(text('board-module-pmax-window')).toBe('Last 31 days');
      expect(screen.getByTestId('board-module-pmax-window').getAttribute('title')).toBe(
        'Oct 1 – Oct 31',
      );
      expect(
        screen.getAllByTestId('pmax-lens-channel').map((row) => row.firstElementChild?.textContent),
      ).toEqual(['Search', 'Display', 'YouTube']);
      expect(text('pmax-lens-takeaway')).toBe(
        'SALES-PMAX-OCTUBRE cuesta $3,283 MXN por conversión: 8.2× su meta de $400 MXN, y pierde el 78% de sus impresiones por ranking.',
      );
      expect(text('pmax-lens-scope')).toBe(
        "Oct 1 – Oct 31 · Google's last 30 complete days · Performance Max is 17% of the account's spend · conversions as Google reports them",
      );
      expect(screen.queryByTestId('pmax-lens-missing')).toBeNull();
      expectFitsNarrow(container);
    });
  }

  it("at l Google's own action items for the weakest asset group are named", () => {
    view('l', vivoPmaxRead(), 400);
    expect(text('pmax-lens-missing')).toBe(
      'Google asks for Grupo de recursos 1: 1 square YouTube video',
    );
  });

  it("names a campaign's own target CPA as such, and colours a cost under it the good pole", () => {
    view('m', easyFitPmaxRead(), 99, []);
    const campaigns = screen.getAllByTestId('pmax-lens-campaign');
    expect(campaigns.map((block) => within(block).getByText(/Easy Fit/).textContent)).toEqual([
      'Easy Fit',
      'PMax | Octubre | Easy Fit | Leads',
    ]);
    for (const dot of screen.getAllByTestId('pmax-lens-dot')) {
      expect((dot.firstElementChild as HTMLElement).style.backgroundColor).toBe(
        'var(--board-below)',
      );
    }
    expect(text('pmax-lens-takeaway')).toBe(
      'Easy Fit cuesta $30.99 MXN por conversión, 69% por debajo de su meta de $99.00 MXN.',
    );
    expect(text('pmax-lens-groups-unread')).toBe(
      'Ad strength — Asset groups were not read for this account.',
    );
    expect(screen.queryByTestId('pmax-lens-strength')).toBeNull();
    cleanup();
    view('m', vivoPmaxRead(400), 900, []);
    expect(
      within(screen.getByTestId('pmax-lens-campaign')).getByText('target CPA $400 MXN'),
    ).toBeTruthy();
  });

  it('Tangassi: without a goal the lens says so, and the takeaway leads with the share', () => {
    view('m', tangassiPmaxRead(), null, []);
    expect(text('pmax-lens-no-goal')).toBe(
      'No goal to read it against: no target CPA on the campaign and no single portfolio goal',
    );
    expect(text('pmax-lens-takeaway')).toBe(
      'Performance Max se lleva el 70% del gasto en Google, a $332 MXN por conversión, y no tiene una meta contra la cual medirlo.',
    );
  });

  it('Pink: the best ad against the dearer one of the same group (G10)', () => {
    view('m', pinkCampaignsRead(), null);
    const ads = screen.getAllByTestId('pmax-lens-ad');
    expect(ads.map((ad) => ad.dataset.role)).toEqual(['winner', 'comparator']);
    expect(ads[0]?.textContent).toBe(
      'Best adCurso ISO 22301 Fundamentos$88.98 MXN per conversion · 3.5 conversions',
    );
    expect(text('pmax-lens-takeaway')).toBe(
      '"Curso ISO 22301 Fundamentos" consigue cada conversión a $88.98 MXN; "Norma ISO 22301 Certificación", a $332 MXN: 3.7× más cara.',
    );
  });
});

describe('PmaxLensView states', () => {
  it('says what is missing, and tells the board so', () => {
    view('m', pinkCampaignsRead(), null, []);
    expect(text('pmax-lens-no-pair')).toBe(
      "No Performance Max spend, and no ad pair to compare yet: the Optimizer's winning-ad card (G10) hasn't fired.",
    );
    expect(screen.getByTestId('board-module-pmax').dataset.moduleState).toBe('missing');
    cleanup();
    view('m', pinkCampaignsRead(), null, null);
    expect(text('pmax-lens-no-pair')).toContain("the Optimizer's cards couldn't be read");
    cleanup();
    render(
      <PmaxLensView
        currency="MXN"
        goal={null}
        slot={slot('m')}
        channels={null}
        state={{ status: 'missing', reason: 'No Google Ads account is granted to this brand.' }}
      />,
    );
    expect(text('board-module-pmax-missing')).toBe(
      'No Google Ads account is granted to this brand.',
    );
    expect(screen.getByTestId('board-module-pmax').dataset.moduleState).toBe('missing');
    // Before any read answers, the header names the window the lens asks for.
    expect(text('board-module-pmax-window')).toBe('Last 30 days');
  });

  it('holds the frame at loading while the channel read is in flight, the figures already drawn', () => {
    view('m', vivoPmaxRead(), 400, CARDS, { status: 'loading' });
    expect(screen.getByTestId('board-module-pmax').dataset.moduleState).toBe('loading');
    expect(screen.getByTestId('pmax-lens-campaign').textContent).toContain('$3,283 MXN');
    expect(text('pmax-lens-channels-loading')).toBe('Reading the spend by channel…');
    cleanup();
    // A channel read that failed costs the split, not the lens.
    view('m', vivoPmaxRead(), 400, CARDS, { status: 'error', message: 'did not answer' });
    expect(screen.getByTestId('board-module-pmax').dataset.moduleState).toBe('ready');
  });

  it('reads the Spanish V4 card the same way, and shows its words as the producer wrote them', () => {
    view('m', vivoPmaxRead(), 400, [PlatformCardSchema.parse(VIVO_PMAX_CARD_ES)]);
    expect(text('pmax-lens-finding')).toBe(
      'Optimizer cardSALES-PMAX-OCTUBRE: $3,283 MXN por conversión frente a un CPA objetivo de $400 MXNOpción A — rehacer los recursos con Jaina — Faltan: 1 square YouTube videoOpción B — pausarla y mover sus $450 MXN/día',
    );
    expect(text('pmax-lens-takeaway')).toBe(
      'SALES-PMAX-OCTUBRE cuesta $3,283 MXN por conversión: 8.2× su meta de $400 MXN, y pierde el 78% de sus impresiones por ranking.',
    );
  });

  it('a channel read that failed says so in one line', () => {
    render(
      <ChannelSplitView
        currency="MXN"
        read={{ status: 'error', message: 'The Google Ads breakdown read did not answer.' }}
      />,
    );
    expect(text('pmax-lens-channels-unread')).toBe(
      'Spend by channel — The Google Ads breakdown read did not answer.',
    );
  });
});

describe('PmaxLens', () => {
  it("reads V4's blocks once, then the top campaign's channels over the same window", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const reading = readAdAccount({
      platform: 'google_ads',
      portfolios: [
        {
          id: 'e642c737-0000-4000-8000-000000000000',
          name: 'Test 1 — Google Ads (Vivo 47)',
          applyMode: 'recommend',
          canWrite: true,
          autopilotPaused: false,
          pendingRecommendations: 6,
          rosterAbsent: false,
          dailyBudget: 1629,
          goal: 400,
        },
      ],
      approvalRequired: false,
      currency: 'MXN',
    });
    const ctx = {
      brandId: '61b80f51-0000-4000-8000-000000000000',
      platform: 'google_ads' as const,
      adAccountId: null,
      currency: 'MXN',
      portfolios: [],
      reading,
      onOpenActions: () => {},
      onOpenActivity: () => {},
      onSelectPortfolio: () => {},
      onCreatePortfolio: () => {},
    };
    render(<PmaxLens ctx={ctx} slot={slot('m')} />, { wrapper });
    await waitFor(() => expect(screen.getAllByTestId('pmax-lens-channel')).toHaveLength(3));
    expect(text('pmax-lens-takeaway')).toContain('8.2× su meta de $400 MXN');
    expect(sent.map((body) => body.scope)).toEqual(['google_signals', 'breakdown']);
    expect(sent[0]).toMatchObject({
      accountId: '3710693645',
      blocks: ['asset_groups', 'bid_targets', 'campaigns'],
    });
    expect(sent[1]).toMatchObject({
      campaignId: 'sales-pmax',
      dimensions: ['network'],
      range: { preset: 'custom', since: '2026-10-01', until: '2026-10-31' },
    });
  });
});
