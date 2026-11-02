import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type AdAccountBoardSlot,
  type BoardModuleSize,
  GoogleSignalsReadSchema,
  type PlatformCard,
  PlatformCardSchema,
  readAdAccount,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  easyFitTermsRead,
  PINK_COMPETITOR_CARD,
  PINK_COMPETITOR_CARD_ES,
  PINK_INTENT_CARD,
  PINK_INTENT_CARD_ES,
  pinkTermsRead,
  vivoTermsRead,
} from '../../../google/views/__fixtures__/lensReads';

// The browser client is the boundary: which account the lens finds, what it asks
// paid-media-metrics for, and the cards read. Each state is also rendered from fixture reads.
const sent: Record<string, unknown>[] = [];
const rpc = async (fn: string) => {
  if (fn === 'list_brand_ad_accounts') {
    return {
      data: [
        {
          platform: 'meta',
          account_id: 'act_1779847382038564',
          name: 'Vivo 47',
          status: null,
          currency: 'MXN',
        },
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
        return { data: vivoTermsRead(), error: null };
      },
    },
  }),
}));

const { default: TermsLens, TermsLensView } = await import('./TermsLens');
const { NO_INTENT_CARD } = await import('./termsModel');

afterEach(() => {
  cleanup();
  sent.length = 0;
});

const WIDTHS = [375, 1280] as const;
const CARDS = [PINK_INTENT_CARD, PINK_COMPETITOR_CARD].map((card) =>
  PlatformCardSchema.parse(card),
);

function atWidth(width: number) {
  (
    window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }
  ).happyDOM.setViewport({ width, height: 900 });
  expect(window.innerWidth).toBe(width);
}

// happy-dom lays nothing out: what is asserted is that nothing is pinned wider than a 375px
// screen, so the lens can only grow with its column.
function expectFitsNarrow(container: HTMLElement) {
  const pinned = [...container.querySelectorAll('[class]')].flatMap((element) =>
    [...(element.getAttribute('class') ?? '').matchAll(/\b(?:min-)?w-\[(\d+)px\]/g)]
      .map((match) => Number(match[1]))
      .filter((px) => px > 375),
  );
  expect(pinned).toEqual([]);
  for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
    expect(
      element.style.width.endsWith('px') ? Number.parseFloat(element.style.width) : 0,
    ).toBeLessThanOrEqual(375);
  }
}

const slot = (size: BoardModuleSize): AdAccountBoardSlot => ({
  module: 'terms',
  size,
  score: 60,
  reason: 'Marca: 54% del gasto en términos',
});

const ready = (raw: unknown, cards: PlatformCard[] | null = []) => ({
  status: 'ready' as const,
  data: { read: GoogleSignalsReadSchema.parse(raw), cards },
});

function view(size: BoardModuleSize, raw: unknown, cards: PlatformCard[] | null = []) {
  return render(<TermsLensView currency="MXN" slot={slot(size)} state={ready(raw, cards)} />);
}

const text = (testId: string) => screen.getByTestId(testId).textContent ?? '';

describe('TermsLensView at s', () => {
  for (const width of WIDTHS) {
    it(`at ${width}px: the one figure over a thin bar of the buckets, no treemap`, () => {
      atWidth(width);
      const { container } = view('s', vivoTermsRead());
      const frame = screen.getByTestId('board-module-terms');
      expect(frame.dataset.size).toBe('s');
      expect(frame.dataset.moduleState).toBe('ready');
      expect(text('board-module-terms-window')).toBe('Last 31 days');
      expect(within(frame).getByText('Search terms')).toBeTruthy();
      expect(text('board-module-terms-reason')).toBe('Marca: 54% del gasto en términos');
      expect(text('terms-headline')).toBe('54%of search-term spend buys the brand · $13,353 MXN');
      expect(screen.getByTestId('terms-bucket-bar').getAttribute('aria-label')).toBe(
        'Search-term spend by intent: Brand 54%, Other terms 46%',
      );
      expect(screen.queryByTestId('terms-treemap')).toBeNull();
      expect(screen.queryByTestId('terms-takeaway')).toBeNull();
      expectFitsNarrow(container);
    });
  }
});

describe('TermsLensView at m and l', () => {
  for (const width of WIDTHS) {
    it(`Vivo 47 at ${width}px: the treemap by root, every bucket's share and money, the takeaway`, () => {
      atWidth(width);
      const { container } = view('m', vivoTermsRead());
      const tiles = screen.getAllByTestId('terms-tile');
      expect(tiles.map((tile) => tile.dataset.bucket)).toEqual(['brand', 'rest', 'brand']);
      expect(tiles[0]?.style.backgroundColor).toBe('var(--board-search)');
      expect(tiles[1]?.style.backgroundColor).toBe('var(--board-video)');
      const legend = screen.getAllByTestId('terms-legend-bucket').map((row) => row.textContent);
      expect(legend).toEqual([
        'Brand54% · $13,353 MXN',
        'Competitor0% · $0.00 MXN',
        'Other terms46% · $11,366 MXN',
      ]);
      expect(text('terms-legend-unknown')).toBe(`Wrong intent — ${NO_INTENT_CARD}`);
      expect(text('terms-takeaway')).toBe(
        'La marca se lleva el 54% del gasto en términos ($13,353 MXN).',
      );
      expect(text('terms-scope')).toBe(
        "Oct 1 – Oct 31 · Google's last 30 complete days · 6 Search and Performance Max terms",
      );
      expectFitsNarrow(container);
    });
  }

  it('Pink: wrong intent leads at 21%, competitors second, each tile a theme or competitor', () => {
    view('m', pinkTermsRead(), CARDS);
    expect(text('terms-headline')).toBe('21%of search-term spend has no intent to buy · $805 MXN');
    expect(text('terms-takeaway')).toBe(
      'El 21% del gasto en términos ($805 MXN) fue a búsquedas sin intención de compra, sin una sola conversión; la competencia, $161 MXN sin conversiones.',
    );
    const tiles = screen.getAllByTestId('terms-tile');
    const labels = tiles.map((tile) => tile.getAttribute('aria-label') ?? '');
    const expected = [
      '$2,867 MXN: course · Other terms · 75% · 1 term',
      '$354 MXN: Free and downloads · Wrong intent · 9% · 1 term',
      '$239 MXN: Students and homework · Wrong intent · 6% · 1 term',
      '$212 MXN: Wrong intent · 3 more · Wrong intent · 6% · 3 terms',
      '$161 MXN: Competitor · Competitor · 4% · 3 terms',
    ];
    expect(labels.map((label, index) => label.startsWith(expected[index] ?? '-'))).toEqual(
      expected.map(() => true),
    );
    const wrong = tiles.find((tile) => tile.dataset.bucket === 'wrong_intent');
    expect(wrong?.style.backgroundColor).toBe('var(--board-mid)');
  });

  it('a bucket lists its terms by spend and takes them to Jaina; a second tap closes it', () => {
    view('m', pinkTermsRead(), CARDS);
    const wrong = screen
      .getAllByTestId('terms-legend-bucket')
      .find((row) => row.dataset.bucket === 'wrong_intent') as HTMLElement;
    fireEvent.click(wrong);
    expect(wrong.getAttribute('aria-pressed')).toBe('true');
    const selected = screen.getByTestId('terms-selected');
    expect(within(selected).getByText('5 terms · $805 MXN')).toBeTruthy();
    expect(selected.querySelectorAll('li')[0]?.textContent).toBe(
      'gratis (free and downloads, aggregated)$354 MXN · 0 conv.',
    );
    const href = screen.getByTestId('terms-ask-jaina').getAttribute('href') ?? '';
    expect(href.startsWith('/scale?tab=jaina&platform=google_ads&new=1&prompt=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('"cursos para salir con trabajo"');
    fireEvent.click(wrong);
    expect(screen.queryByTestId('terms-selected')).toBeNull();
  });

  it('Pink with the cards in Spanish: the same split, the themes as the engine now names them', () => {
    const spanish = [PINK_INTENT_CARD_ES, PINK_COMPETITOR_CARD_ES].map((card) =>
      PlatformCardSchema.parse(card),
    );
    view('m', pinkTermsRead(), spanish);
    expect(text('terms-headline')).toBe('21%of search-term spend has no intent to buy · $805 MXN');
    const labels = screen
      .getAllByTestId('terms-tile')
      .map((tile) => tile.getAttribute('aria-label') ?? '');
    expect(
      labels.some((label) => label.startsWith('$354 MXN: Gratis y descargas · Wrong intent')),
    ).toBe(true);
    expect(labels.some((label) => label.startsWith('$239 MXN: Estudiantes y tareas'))).toBe(true);
    expect(text('terms-takeaway')).toBe(
      'El 21% del gasto en términos ($805 MXN) fue a búsquedas sin intención de compra, sin una sola conversión; la competencia, $161 MXN sin conversiones.',
    );
  });

  it("a tile lists its own terms: the competitor tile holds every competitor's", () => {
    view('m', pinkTermsRead(), CARDS);
    const competitor = screen
      .getAllByTestId('terms-tile')
      .find((tile) => tile.dataset.bucket === 'competitor') as HTMLElement;
    fireEvent.click(competitor);
    const rows = [...screen.getByTestId('terms-selected').querySelectorAll('li')].map(
      (row) => row.textContent,
    );
    expect(rows).toEqual([
      'coursera (4 terms, aggregated)$140 MXN · 0 conv.',
      'udemy (5 terms, aggregated)$18.49 MXN · 0 conv.',
      'platzi com cursos$2.18 MXN · 0 conv.',
    ]);
  });

  it('at l the top roots are listed while nothing is selected', () => {
    view('l', pinkTermsRead(), CARDS);
    const top = screen.getByTestId('terms-top-groups');
    expect(top.querySelectorAll('li')[0]?.textContent).toBe('course · 1 term$2,867 MXN · 75%');
    expect(screen.getByTestId('terms-treemap').style.height).toBe('232px');
  });

  it('Easy Fit: "smart fit" is a competitor at $248 with no conversion', () => {
    view('m', easyFitTermsRead());
    const competitor = screen
      .getAllByTestId('terms-legend-bucket')
      .find((row) => row.dataset.bucket === 'competitor');
    expect(competitor?.textContent).toBe('Competitor9% · $248 MXN');
    expect(text('terms-takeaway')).toBe(
      'La marca se lleva el 75% del gasto en términos ($2,117 MXN); la competencia, $248 MXN sin conversiones.',
    );
  });
});

describe('TermsLensView states', () => {
  it('loading, failed, missing, unread and empty each say what they are', () => {
    const frame = (state: Parameters<typeof TermsLensView>[0]['state']) =>
      render(<TermsLensView currency="MXN" slot={slot('m')} state={state} />);
    const moduleState = () => screen.getByTestId('board-module-terms').dataset.moduleState;
    frame({ status: 'loading' });
    expect(screen.queryByTestId('terms-headline')).toBeNull();
    expect(moduleState()).toBe('loading');
    expect(text('board-module-terms-window')).toBe('Last 30 days');
    cleanup();
    frame({ status: 'error', message: 'The Google Ads read did not answer.' });
    expect(document.body.textContent).toContain('The Google Ads read did not answer.');
    expect(moduleState()).toBe('error');
    cleanup();
    frame({ status: 'missing', reason: 'No Google Ads account is granted to this brand.' });
    expect(text('board-module-terms-missing')).toBe(
      'No Google Ads account is granted to this brand.',
    );
    expect(moduleState()).toBe('missing');
    cleanup();
    frame(ready({ ...vivoTermsRead(), signals: null, rejected: [] }));
    expect(text('terms-unread')).toBe('— The Google read came back incomplete');
    expect(moduleState()).toBe('missing');
    cleanup();
    const idle = vivoTermsRead();
    for (const term of idle.signals?.google?.search_terms ?? []) term.totals.spend = 0;
    frame(ready(idle));
    expect(text('terms-empty')).toBe("No search term spent in Google's last 30 complete days.");
    expect(moduleState()).toBe('missing');
  });
});

describe('TermsLens', () => {
  it("finds the brand's Google Ads customer and reads its terms with the profile, in one read", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const reading = readAdAccount({
      platform: 'google_ads',
      portfolios: [],
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
    render(<TermsLens ctx={ctx} slot={slot('m')} />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('terms-headline')).toBeTruthy());
    expect(text('terms-headline')).toContain('54%');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      platform: 'google-ads',
      scope: 'google_signals',
      brandId: ctx.brandId,
      accountId: '3710693645',
      blocks: ['profile', 'search_terms'],
    });
  });
});
