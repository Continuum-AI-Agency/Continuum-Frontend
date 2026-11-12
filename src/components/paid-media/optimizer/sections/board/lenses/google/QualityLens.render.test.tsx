import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type AdAccountBoardSlot,
  type BoardModuleSize,
  GoogleKeywordQualityReadSchema,
  readAdAccount,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { render } from '@/i18n/__tests__/render';
import { keywordQualityFixture } from '../../../google/views/__fixtures__/googleViews';
import { easyFitKeywordQuality } from '../../../google/views/__fixtures__/lensReads';

const sent: Record<string, unknown>[] = [];
const rpc = async (fn: string) => {
  if (fn === 'list_brand_ad_accounts') {
    return {
      data: [
        {
          platform: 'google_ads',
          account_id: '5251780631',
          name: 'Easy Fit',
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
        return { data: easyFitKeywordQuality(), error: null };
      },
    },
  }),
}));

const { default: QualityLens, QualityLensView } = await import('./QualityLens');

afterEach(() => {
  cleanup();
  sent.length = 0;
});

const WIDTHS = [375, 1280] as const;

function atWidth(width: number) {
  (
    window as unknown as {
      happyDOM: { setViewport(v: { width: number; height: number }): void };
    }
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
  module: 'quality',
  size,
  score: 55,
  reason: '29% del gasto de keywords en QS ≤ 3',
});

function view(size: BoardModuleSize, raw: unknown = easyFitKeywordQuality()) {
  return render(
    <QualityLensView
      currency="MXN"
      slot={slot(size)}
      state={{
        status: 'ready',
        data: GoogleKeywordQualityReadSchema.parse(raw),
      }}
    />,
  );
}

const text = (testId: string) => screen.getByTestId(testId).textContent ?? '';

describe('QualityLensView at s', () => {
  for (const width of WIDTHS) {
    it(`at ${width}px: the share at QS ≤ 3 over the ten bars, nothing else`, () => {
      atWidth(width);
      const { container } = view('s');
      expect(screen.getByTestId('board-module-quality').dataset.size).toBe('s');
      expect(screen.getByTestId('board-module-quality').dataset.moduleState).toBe('ready');
      expect(text('board-module-quality-window')).toBe('Last 31 days');
      expect(text('quality-headline')).toBe(
        '29%of keyword spend at Quality Score ≤ 3 · $4,323 MXN',
      );
      expect(screen.getAllByTestId('quality-bar')).toHaveLength(10);
      expect(screen.queryByTestId('quality-low-bracket')).toBeNull();
      expect(screen.queryByTestId('quality-takeaway')).toBeNull();
      expectFitsNarrow(container);
    });
  }
});

describe('QualityLensView at m and l', () => {
  for (const width of WIDTHS) {
    it(`at ${width}px: the histogram with QS ≤ 3 marked, the components and the takeaway`, () => {
      atWidth(width);
      const { container } = view('m');
      const bars = screen.getAllByTestId('quality-bar');
      expect(
        bars.filter((bar) => bar.dataset.low === 'true').map((bar) => bar.dataset.score),
      ).toEqual(['1', '2', '3']);
      expect(bars[0]?.style.backgroundColor).toBe('var(--board-above)');
      expect(bars[5]?.style.backgroundColor).toBe('var(--board-search)');
      expect(bars[2]?.getAttribute('aria-label')).toBe(
        '$2,990 MXN: Quality Score 3 · 6 keywords · 20% of keyword spend',
      );
      expect(bars[0]?.getAttribute('aria-label')).toBe(
        '$45.41 MXN: Quality Score 1 · 2 keywords · <1% of keyword spend',
      );
      expect(text('quality-low-bracket')).toBe('QS ≤ 3 · 29%');
      expect(text('quality-unscored')).toBe('Unscored: $3,405 MXN on 1 keyword');
      const components = screen.getByTestId('quality-components');
      expect(
        within(components).getByText('The QS ≤ 3 spend, as Google rates each component'),
      ).toBeTruthy();
      expect(
        screen
          .getAllByTestId('quality-component')
          .map((row) => [row.dataset.component, row.lastElementChild?.textContent]),
      ).toEqual([
        ['expected_ctr', '100% below'],
        ['ad_relevance', '1% below'],
        ['landing_page', '100% below'],
      ]);
      expect(text('quality-takeaway')).toBe(
        'El 29% del gasto en keywords ($4,323 MXN, 10 keywords) está en Quality Score de 3 o menos; la página de destino está por debajo del promedio en el 100% de ese gasto.',
      );
      expect(text('quality-scope')).toBe(
        'Oct 1 – Oct 31 · 31 complete days · the 50 keywords that spent most · 26 scored · average Quality Score 5.2',
      );
      expect(screen.queryByTestId('quality-lowest')).toBeNull();
      expectFitsNarrow(container);
    });
  }

  it('at l the low-score keywords that spent most are listed with their three ratings', () => {
    view('l');
    const rows = screen.getAllByTestId('quality-low-keyword');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toBe('entrenamiento funcionalCRLQS 3 · $2,354 MXN');
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('img')
        .map((chip) => chip.getAttribute('aria-label')),
    ).toEqual([
      'Expected CTR: Below average',
      'Ad relevance: Above average',
      'Landing page: Below average',
    ]);
  });

  it('with nothing at QS ≤ 3, the components read the whole keyword spend', () => {
    const read = keywordQualityFixture();
    for (const keyword of read.keywords) {
      if (keyword.quality_score !== null && keyword.quality_score <= 3) keyword.quality_score = 7;
    }
    view('m', read);
    expect(text('quality-headline')).toBe('0%of keyword spend at Quality Score ≤ 3 · $0.00 MXN');
    expect(screen.getByText('The keyword spend, as Google rates each component')).toBeTruthy();
    expect(text('quality-takeaway')).toBe(
      'Ninguna keyword con Quality Score de 3 o menos gastó en la ventana.',
    );
  });
});

describe('QualityLensView states', () => {
  it('empty and failed reads each say what they are', () => {
    view(
      'm',
      keywordQualityFixture({
        keywords: [],
        total_keywords: 0,
        scored_keywords: 0,
      }),
    );
    expect(text('quality-empty')).toContain('No keyword spent in this window.');
    expect(screen.getByTestId('board-module-quality').dataset.moduleState).toBe('missing');
    cleanup();
    render(
      <QualityLensView
        currency="MXN"
        slot={slot('m')}
        state={{
          status: 'error',
          message: 'The Google Ads Quality Score read did not answer.',
        }}
      />,
    );
    expect(document.body.textContent).toContain(
      'The Google Ads Quality Score read did not answer.',
    );
    expect(screen.getByTestId('board-module-quality').dataset.moduleState).toBe('error');
  });
});

describe('QualityLens', () => {
  it("reads the brand's Google Ads customer over the reading's 30 complete days", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const ctx = {
      brandId: '6f597f42-0000-4000-8000-000000000000',
      platform: 'google_ads' as const,
      adAccountId: null,
      currency: null,
      portfolios: [],
      reading: readAdAccount({
        platform: 'google_ads',
        portfolios: [],
        approvalRequired: false,
        currency: 'MXN',
      }),
      onOpenActions: () => {},
      onOpenActivity: () => {},
      onSelectPortfolio: () => {},
      onCreatePortfolio: () => {},
    };
    render(<QualityLens ctx={ctx} slot={slot('m')} />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('quality-headline')).toBeTruthy());
    expect(text('quality-headline')).toContain('$4,323 MXN');
    expect(sent).toHaveLength(1);
    const body = sent[0] as {
      scope: string;
      accountId: string;
      range: { since: string; until: string };
    };
    expect(body).toMatchObject({
      scope: 'keyword_quality',
      accountId: '5251780631',
      limit: 50,
    });
    const days = (Date.parse(body.range.until) - Date.parse(body.range.since)) / 86_400_000 + 1;
    expect(days).toBe(30);
  });
});
