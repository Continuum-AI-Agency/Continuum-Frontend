import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  CARDS,
  campaignsBeforeE1,
  campaignsFixture,
  emptySearchTermsFixture,
  keywordQualityFixture,
  networkFixture,
  noPmaxFixture,
  pmaxFixture,
  searchTermsFixture,
} from './__fixtures__/googleViews';

// The browser client is the boundary: what a view asks paid-media-metrics for, and the RPC the
// pending-cards read makes. Each view below is also rendered from fixture reads directly.
const sent: Record<string, unknown>[] = [];
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async (_name: string, options: { body: Record<string, unknown> }) => {
        sent.push(options.body);
        const scope = options.body.scope;
        const data =
          scope === 'keyword_quality'
            ? keywordQualityFixture()
            : scope === 'google_signals'
              ? searchTermsFixture()
              : campaignsFixture();
        return { data, error: null };
      },
    },
    rpc: async () => ({ data: [], error: null }),
  }),
}));

const { NOT_IN_THIS_READ } = await import('../googleReads');
const { CONVERSIONS_NOT_COUNTED } = await import('./cell');
const { GoogleOwnViews } = await import('./GoogleOwnViews');
const { MoneyLeftOnTableView } = await import('./MoneyLeftOnTable');
const { PmaxHealthView, PmaxNetworkSplitView } = await import('./PmaxHealth');
const { PMAX_NOT_READ } = await import('./pmaxHealthModel');
const { QualityScoreMapView } = await import('./QualityScoreMap');
const { SearchTermExplorerView } = await import('./SearchTermExplorer');

afterEach(() => {
  cleanup();
  sent.length = 0;
});

const WIDTHS = [375, 1280] as const;

function atWidth(width: number) {
  (
    window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }
  ).happyDOM.setViewport({ width, height: 900 });
  expect(window.innerWidth).toBe(width);
}

// happy-dom lays nothing out, so a width cannot be measured here: what is asserted is that every
// table sits in a horizontal scroll box and nothing is pinned wider than a 375px screen.
function expectFitsNarrow(container: HTMLElement) {
  for (const table of container.querySelectorAll('table')) {
    expect(table.parentElement?.getAttribute('class')).toContain('overflow-x-auto');
  }
  const pinned = [...container.querySelectorAll('[class]')].flatMap((element) =>
    [...(element.getAttribute('class') ?? '').matchAll(/\b(?:min-)?w-\[(\d+)px\]/g)]
      .map((match) => Number(match[1]))
      .filter((px) => px > 375),
  );
  expect(pinned).toEqual([]);
}

const ready = <T,>(data: T) => ({ status: 'ready' as const, data });

function reasons(): string {
  return screen.getByTestId('missing-reasons').textContent ?? '';
}

describe('QualityScoreMapView', () => {
  for (const width of WIDTHS) {
    it(`loaded at ${width}px: the waste as money, the map, every keyword with its components`, () => {
      atWidth(width);
      const { container } = render(
        <QualityScoreMapView currency="MXN" read={ready(keywordQualityFixture())} />,
      );
      expect(screen.getByTestId('qs-waste-line').textContent).toBe(
        '$2,490 MXN on 2 keywords at Quality Score ≤ 3 with no conversion.',
      );
      expect(screen.getByTestId('qs-bars').getAttribute('aria-label')).toContain(
        'Quality Score 3: 2 keywords, $2,363 MXN',
      );
      expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
      expect(screen.getAllByTestId('qs-waste')).toHaveLength(2);
      expect(screen.getByTestId('qs-unscored').textContent).toContain(
        '1 keyword not scored yet ($85.47 MXN)',
      );
      expect(reasons()).toContain('Google has not scored it yet: too little traffic');
      expectFitsNarrow(container);
    });
  }

  it('"—" with its reason when conversions are not counted: no waste figure, no zero', () => {
    const ambiguous = keywordQualityFixture();
    for (const row of ambiguous.keywords) row.metrics.conversions = null;
    render(<QualityScoreMapView currency="MXN" read={ready(ambiguous)} />);
    expect(screen.getByTestId('qs-waste-line').textContent).toContain("Waste can't be told");
    expect(reasons()).toContain(CONVERSIONS_NOT_COUNTED);
    expect(screen.queryAllByTestId('qs-waste')).toHaveLength(0);
  });

  it('empty, loading and failed reads each say what they are', () => {
    render(
      <QualityScoreMapView
        currency="MXN"
        read={ready(
          keywordQualityFixture({
            keywords: [],
            total_keywords: 0,
            scored_keywords: 0,
            average_quality_score: null,
          }),
        )}
      />,
    );
    expect(document.body.textContent).toContain('No keyword spent in this window.');
    cleanup();
    render(
      <QualityScoreMapView
        currency="MXN"
        read={{ status: 'error', message: 'The Google Ads Quality Score read did not answer.' }}
      />,
    );
    expect(document.body.textContent).toContain(
      'The Google Ads Quality Score read did not answer.',
    );
  });
});

describe('MoneyLeftOnTableView', () => {
  for (const width of WIDTHS) {
    it(`loaded at ${width}px: budget and rank apart, G03 projection or a labelled linear range`, () => {
      atWidth(width);
      const { container } = render(
        <MoneyLeftOnTableView cards={CARDS} currency="MXN" read={ready(campaignsFixture())} />,
      );
      expect(screen.getByTestId('money-left-headline').textContent).toContain(
        "2 campaigns lose impressions to budget: up to +$726 MXN/day would reach those auctions at today's price.",
      );
      expect(screen.getByTestId('money-left-headline').textContent).toContain(
        '2 campaigns lose more to rank than to budget',
      );
      const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
      expect(headers).toEqual(expect.arrayContaining(['Lost · budget', 'Lost · rank']));
      const buys = screen.getAllByTestId('money-left-buys').map((cell) => cell.textContent);
      expect(buys[0]).toBe(
        'At $600 MXN/day: about 2–2.4 leads/day (now 2)Optimizer projection on 14 days',
      );
      expect(buys[1]).toBe(
        '+0–1.2 results/day for +$143 MXN/daylinear on these 7 days, not a projection',
      );
      expect(screen.getByTestId('money-left-off-search').textContent).toContain(
        '1 campaign serves off Search',
      );
      expectFitsNarrow(container);
    });
  }

  it('"—" with the cache reason on a read from before E1, never a zero', () => {
    render(<MoneyLeftOnTableView cards={[]} currency="MXN" read={ready(campaignsBeforeE1())} />);
    expect(screen.getAllByTestId('missing').length).toBeGreaterThan(0);
    expect(reasons()).toBe(`— ${NOT_IN_THIS_READ}`);
    expect(screen.getByTestId('money-left-headline').textContent).toBe(
      'No campaign is known to lose impressions to budget.',
    );
    expect(document.body.textContent).not.toMatch(/\b0%/);
  });

  it('empty when nothing spent', () => {
    render(
      <MoneyLeftOnTableView
        cards={[]}
        currency="MXN"
        read={ready(campaignsFixture({ rows: [] }))}
      />,
    );
    expect(document.body.textContent).toContain('No campaign spent in this window.');
  });
});

describe('SearchTermExplorerView', () => {
  for (const width of WIDTHS) {
    it(`loaded at ${width}px: roots by spend, card coverage, a selection that asks Jaina`, () => {
      atWidth(width);
      const { container } = render(
        <SearchTermExplorerView cards={CARDS} currency="MXN" read={ready(searchTermsFixture())} />,
      );
      expect(screen.getByTestId('google-view-scope').textContent).toContain(
        '6 terms under 3 roots',
      );
      const roots = screen.getAllByTestId('search-root');
      expect(roots.map((root) => root.dataset.root)).toEqual(['gimnasio', 'clase', 'precio']);
      expect(screen.getByTestId('search-terms-cards-note').textContent).toContain(
        '(2 terms are in one now)',
      );
      const gimnasio = roots[0] as HTMLElement;
      expect(within(gimnasio).getByTestId('search-term-card').textContent).toBe(
        'In a Negatives card',
      );
      expect(screen.queryByTestId('search-terms-ask-jaina')).toBeNull();
      fireEvent.click(
        within(gimnasio).getByRole('checkbox', { name: 'Select every term under gimnasio' }),
      );
      expect(screen.getByTestId('search-terms-selection').textContent).toContain(
        '3 terms selected · $2,251 MXN',
      );
      const href = screen.getByTestId('search-terms-ask-jaina').getAttribute('href') ?? '';
      expect(href.startsWith('/scale?tab=jaina&platform=google_ads&new=1&prompt=')).toBe(true);
      expect(decodeURIComponent(href)).toContain('"gimnasio cdmx", "gimnasios en polanco"');
      expectFitsNarrow(container);
    });
  }

  it('"—" with its reason when the signals were not built, or the block failed', () => {
    render(
      <SearchTermExplorerView
        cards={[]}
        currency="MXN"
        read={ready({ ...searchTermsFixture(), signals: null, rejected: ['window: invalid'] })}
      />,
    );
    expect(screen.getByTestId('search-terms-unread').textContent).toBe(
      '— The Google read came back incomplete: window: invalid',
    );
    cleanup();
    const failed = searchTermsFixture();
    if (failed.signals?.google) delete failed.signals.google.search_terms;
    render(
      <SearchTermExplorerView
        cards={[]}
        currency="MXN"
        read={ready({ ...failed, skipped: { read_failed_search_terms: 1 } })}
      />,
    );
    expect(screen.getByTestId('search-terms-unread').textContent).toBe(
      "— Google's search-term read failed",
    );
  });

  it('empty when no term spent', () => {
    render(
      <SearchTermExplorerView cards={[]} currency="MXN" read={ready(emptySearchTermsFixture())} />,
    );
    expect(document.body.textContent).toContain(
      "No search term spent in Google's last 30 complete days.",
    );
  });
});

describe('PmaxHealthView', () => {
  function view(read: ReturnType<typeof pmaxFixture>, network = networkFixture()) {
    return render(
      <PmaxHealthView
        campaignName={() => 'PMax · Membresías'}
        network={(_id, name) => (
          <PmaxNetworkSplitView currency="MXN" name={name} read={ready(network)} />
        )}
        read={ready(read)}
      />,
    );
  }

  for (const width of WIDTHS) {
    it(`loaded at ${width}px: Poor groups first, spend by network, and what isn't read`, () => {
      atWidth(width);
      const { container } = view(pmaxFixture());
      expect(screen.getByTestId('pmax-poor').textContent).toBe(
        '1 of 2 asset groups rate Poor: Clases grupales.',
      );
      expect(document.body.textContent).toContain('Google asks: Add more headlines · Add a video');
      expect(document.body.textContent).toContain('Spend by network · PMax · Membresías');
      const network = screen.getByRole('region', { name: 'Spend by network: PMax · Membresías' });
      expect(
        [...network.querySelectorAll('tbody tr')].map((row) => row.firstChild?.textContent),
      ).toEqual(['Search', 'Display', 'YouTube']);
      expect(screen.getByTestId('pmax-not-read').textContent).toBe(PMAX_NOT_READ);
      expectFitsNarrow(container);
    });
  }

  it('"—" with its reason: conversions not counted by network, or the signals not built', () => {
    view(pmaxFixture(), networkFixture('ambiguous'));
    expect(reasons()).toContain(CONVERSIONS_NOT_COUNTED);
    cleanup();
    view({ ...pmaxFixture(), signals: null, rejected: [] });
    expect(screen.getByTestId('pmax-unread').textContent).toBe(
      '— The Google read came back incomplete',
    );
    expect(document.body.textContent).toContain(PMAX_NOT_READ);
  });

  it('empty for an account with no Performance Max', () => {
    view(noPmaxFixture());
    expect(document.body.textContent).toContain('No Performance Max campaign in this account.');
  });
});

describe('GoogleOwnViews', () => {
  function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  const props = {
    brandId: 'brand-1',
    customerId: '3710693645',
    currency: 'MXN',
    window: { since: '2026-10-21', until: '2026-10-27' },
  };

  for (const width of WIDTHS) {
    it(`at ${width}px: four closed text disclosures that make no read until opened`, () => {
      atWidth(width);
      render(<GoogleOwnViews {...props} />, { wrapper: wrapper() });
      const sections = ['money-left', 'search-terms', 'quality-score', 'pmax'].map((id) =>
        screen.getByTestId(`google-view-${id}`),
      );
      for (const section of sections) expect(section.hasAttribute('open')).toBe(false);
      expect(sent).toEqual([]);
    });
  }

  it('opening a view makes its own read and renders it', async () => {
    render(<GoogleOwnViews {...props} />, { wrapper: wrapper() });
    const quality = screen.getByTestId('google-view-quality-score');
    fireEvent.click(within(quality).getByText('Quality Score map'));
    await waitFor(() => expect(screen.getByTestId('qs-waste-line')).toBeTruthy());
    expect(sent.map((body) => body.scope)).toEqual(['keyword_quality']);

    fireEvent.click(
      within(screen.getByTestId('google-view-search-terms')).getByText('Search terms'),
    );
    await waitFor(() => expect(screen.getAllByTestId('search-root')).toHaveLength(3));
    expect(sent.at(-1)).toMatchObject({ scope: 'google_signals', blocks: ['search_terms'] });
  });
});
