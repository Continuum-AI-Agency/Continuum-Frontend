import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HomeCreativeSpotlightData, OrganicWinners } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PaidCreativeReadState } from '@/hooks/usePaidCreativeReport';
import type { HomeReadLoad } from '../../homeRead';
import { TWO_WINNERS } from '../flywheel/__fixtures__/organicWinners';
import {
  EASY_FIT_ACCOUNT,
  EASY_FIT_REPORT,
  SECOND_USD_ACCOUNT,
} from './__fixtures__/creativeReport';
import { creativeTile, homeContext } from './__fixtures__/homeContext';

// `mock.module` replaces a module for the whole process, so this file runs on its own; every mock
// spreads the real module.
type ReportRead = PaidCreativeReadState & { isLoading: boolean; isError: boolean };
let reportRead: ReportRead = {
  status: 'ready',
  report: EASY_FIT_REPORT,
  refreshedAt: null,
  isLoading: false,
  isError: false,
};
const refetchReport = mock(() => Promise.resolve());
const realReport = await import('@/hooks/usePaidCreativeReport');
mock.module('@/hooks/usePaidCreativeReport', () => ({
  ...realReport,
  usePaidCreativeReport: () => ({ ...reportRead, error: null, refetch: refetchReport }),
}));

let winners: OrganicWinners | undefined = TWO_WINNERS;
const realWinners = await import('@/hooks/useOrganicWinners');
mock.module('@/hooks/useOrganicWinners', () => ({
  ...realWinners,
  useOrganicWinners: () => ({ data: winners, isLoading: false, isError: false, refetch: () => {} }),
  usePromotionAdsets: () => ({ data: undefined, isLoading: true, isError: false }),
  usePromoteWinner: () => ({ mutate: () => {}, isPending: false, isError: false, data: undefined }),
}));

// The per-ad live Graph preview is forbidden on the Home: if anything reached for it, this spy
// would record the call.
const livePreview = mock(() => Promise.reject(new Error('live Graph preview called')));
const realPreview = await import('@/lib/api/jainaCreativePreview.client');
mock.module('@/lib/api/jainaCreativePreview.client', () => ({
  ...realPreview,
  fetchJainaCreativePreview: livePreview,
}));

// The tile's Backend read; `unavailable` is what production answers until the Backend deploys.
let spotlightLoad: HomeReadLoad<HomeCreativeSpotlightData> = { status: 'unavailable' };
const realHomeRead = await import('../../useHomeRead');
mock.module('../../useHomeRead', () => ({ ...realHomeRead, useHomeRead: () => spotlightLoad }));

const { default: CreativeTile } = await import('./Tile');
const { default: CreativeModule } = await import('./Module');
const { creativeTileState, CREATIVE_MISSING } = await import('./creativeModel');

afterEach(() => {
  cleanup();
  reportRead = {
    status: 'ready',
    report: EASY_FIT_REPORT,
    refreshedAt: null,
    isLoading: false,
    isError: false,
  };
  winners = TWO_WINNERS;
  spotlightLoad = { status: 'unavailable' };
  refetchReport.mockClear();
});

const frame = () => screen.getByTestId('home-tile-creative');

function readySpotlight(accounts = [EASY_FIT_ACCOUNT]) {
  const view = creativeTileState({ ...reportRead }, accounts);
  if (view.state !== 'ready') throw new Error('fixture is not ready');
  return view.spotlight;
}

describe('Creative tile', () => {
  it('headlines the number of ads the stored report judged, with its raw value', () => {
    render(<CreativeTile ctx={homeContext()} tile={creativeTile('m')} />);
    expect(frame().getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-creative-headline');
    expect(headline.getAttribute('data-value')).toBe('6');
    expect(frame().textContent).toContain(
      '2 winning · 1 underperforming · 2 need a new angle · 1 too early',
    );
  });

  it('draws only stored thumbnails, and a neutral placeholder where none is stored', () => {
    render(<CreativeTile ctx={homeContext()} tile={creativeTile('l')} />);
    const images = within(frame()).getAllByTestId('creative-thumb') as HTMLImageElement[];
    const stored = new Set(EASY_FIT_REPORT.verdicts.map((verdict) => verdict.thumbnailUrl));
    for (const image of images) expect(stored.has(image.getAttribute('src'))).toBe(true);
    expect(within(frame()).getAllByTestId('creative-thumb-placeholder').length).toBeGreaterThan(0);
  });

  it('shows the figure and one line at size s, no thumbnails', () => {
    render(<CreativeTile ctx={homeContext()} tile={creativeTile('s')} />);
    expect(within(frame()).queryAllByTestId('creative-thumb')).toHaveLength(0);
    expect(screen.getByTestId('home-tile-creative-headline').getAttribute('data-value')).toBe('6');
  });

  it('is missing, in one sentence, when no report is stored yet', () => {
    reportRead = {
      status: 'assembling',
      report: null,
      refreshedAt: null,
      isLoading: false,
      isError: false,
    };
    render(<CreativeTile ctx={homeContext()} tile={creativeTile()} />);
    expect(frame().getAttribute('data-module-state')).toBe('missing');
    expect(screen.getByTestId('home-tile-missing').textContent).toBe(CREATIVE_MISSING.noReport);
    expect(screen.queryByTestId('home-tile-creative-headline')).toBeNull();
    expect(screen.queryByTestId('home-tile-creative-open')).toBeNull();
  });

  it('is missing when the brand has no Meta ad account', () => {
    render(<CreativeTile ctx={homeContext({ adAccounts: [] })} tile={creativeTile()} />);
    expect(screen.getByTestId('home-tile-missing').textContent).toBe(
      CREATIVE_MISSING.noMetaAccount,
    );
  });

  it('is an error with a Retry when the read failed', () => {
    reportRead = {
      status: 'assembling',
      report: null,
      refreshedAt: null,
      isLoading: false,
      isError: true,
    };
    render(<CreativeTile ctx={homeContext()} tile={creativeTile()} />);
    expect(frame().getAttribute('data-module-state')).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetchReport).toHaveBeenCalledTimes(1);
  });

  it('is loading while the read is on its way, and never shows a figure', () => {
    reportRead = {
      status: 'assembling',
      report: null,
      refreshedAt: null,
      isLoading: true,
      isError: false,
    };
    render(<CreativeTile ctx={homeContext()} tile={creativeTile()} />);
    expect(frame().getAttribute('data-module-state')).toBe('loading');
    expect(screen.queryByTestId('home-tile-creative-headline')).toBeNull();
  });

  it('opens the expanded module, lazily, with the flywheel inside it', async () => {
    render(<CreativeTile ctx={homeContext()} tile={creativeTile()} />);
    fireEvent.click(screen.getByTestId('home-tile-creative-open'));
    await waitFor(() => expect(screen.getByTestId('creative-module')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('flywheel')).toBeTruthy());
    expect(livePreview).not.toHaveBeenCalled();
  });
});

describe('Creative module', () => {
  it('lists every judged ad with its stored reason and standing', () => {
    render(<CreativeModule ctx={homeContext()} spotlight={readySpotlight()} />);
    const cards = screen.getAllByTestId('creative-card');
    expect(cards).toHaveLength(6);
    expect(cards[0].textContent).toContain('Winning');
    expect(cards[0].textContent).toContain('$20.76 MXN');
    expect(screen.getByTestId('creative-module').textContent).toContain(
      'persistently expensive, not a fluke window',
    );
  });

  it('filters by standing', () => {
    render(<CreativeModule ctx={homeContext()} spotlight={readySpotlight()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Needs a new angle/ }));
    const cards = screen.getAllByTestId('creative-card');
    expect(cards).toHaveLength(2);
    for (const card of cards) expect(card.textContent).toContain('Needs a new angle');
  });

  it('never prints a money figure when the Meta accounts hold two currencies', () => {
    render(
      <CreativeModule
        ctx={homeContext({ adAccounts: [EASY_FIT_ACCOUNT, SECOND_USD_ACCOUNT] })}
        spotlight={readySpotlight([EASY_FIT_ACCOUNT, SECOND_USD_ACCOUNT])}
      />,
    );
    const module = screen.getByTestId('creative-module');
    for (const card of screen.getAllByTestId('creative-card')) {
      expect(card.textContent).not.toMatch(/MXN|USD/);
    }
    expect(module.textContent).toContain('0.80× cohort median');
    expect(module.textContent).toContain('more than one currency');
  });

  it('says once that hook rate, format and fatigue are not readable yet', () => {
    render(<CreativeModule ctx={homeContext()} spotlight={readySpotlight()} />);
    expect(screen.getAllByTestId('creative-not-readable')).toHaveLength(1);
    expect(screen.getByTestId('creative-not-readable').textContent).toMatch(
      /hook rate.*format.*fatigue.*not readable yet/i,
    );
  });

  it('shows the stored synopsis themes as written', () => {
    render(<CreativeModule ctx={homeContext()} spotlight={readySpotlight()} />);
    expect(screen.getByTestId('creative-module').textContent).toContain(
      'Video assets struggle to convert when used for retargeting.',
    );
  });

  it('swaps an expired stored thumbnail for the placeholder, never a live preview', () => {
    render(<CreativeModule ctx={homeContext()} spotlight={readySpotlight()} />);
    const before = screen.getAllByTestId('creative-thumb-placeholder').length;
    fireEvent.error(screen.getAllByTestId('creative-thumb')[0]);
    expect(screen.getAllByTestId('creative-thumb-placeholder')).toHaveLength(before + 1);
    expect(livePreview).not.toHaveBeenCalled();
  });

  it('links "Make variants" to the Optimizer only for an ad with a pending recommendation', () => {
    render(<CreativeModule ctx={homeContext()} spotlight={readySpotlight()} />);
    const links = within(screen.getByTestId('creative-cards')).getAllByRole('link', {
      name: /Make variants/,
    });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/scale?tab=performance');
  });

  it('notes a failed refresh while still showing the stored report', () => {
    reportRead = { ...reportRead, status: 'error' };
    render(<CreativeModule ctx={homeContext()} spotlight={readySpotlight()} />);
    expect(screen.getByTestId('creative-refresh-failed')).toBeTruthy();
  });
});

describe('the Home never reaches for a live creative preview', () => {
  const sources = ['Tile.tsx', 'Module.tsx', 'CreativeThumb.tsx', 'creativeModel.ts']
    .map((file) => join(import.meta.dir, file))
    .concat(
      ['Flywheel.tsx', 'PromoteWinnerDialog.tsx', 'flywheelModel.ts'].map((file) =>
        join(import.meta.dir, '..', 'flywheel', file),
      ),
    );

  it.each(
    sources,
  )('%s imports no live preview, no extremes read, no thumbnail recovery', (path) => {
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/jainaCreativePreview|useCreativeExtremes|usePaidCreativeRecovery/);
  });
});

describe('Creative tile with the Spotlight read', () => {
  const SPOTLIGHT: HomeCreativeSpotlightData = {
    window: '7d',
    currency: 'USD',
    asOf: '2026-11-04T05:05:36.334Z',
    ageDays: 0,
    totalSpend: 1000,
    adsWithSpend: 12,
    ads: [
      {
        adId: 'a1',
        adAccountId: 'act_1',
        adName: 'Ad one',
        title: 'Hook them',
        format: 'video',
        thumbnailUrl: 'https://cdn.example/a1.jpg',
        permalinkUrl: null,
        firstSeenAt: '2026-10-17T17:10:14Z',
        spend: 400,
        spendShare: 0.4,
        impressions: 1000,
        costPerResult: { value: 20, results: 20, kpi: 'leads', label: 'cost per lead' },
        hookRate: 0.25,
        hookRateUnavailable: null,
        frequency: 1.5,
        verdict: 'fading',
        verdictWhy: 'CTR fell 30% and the cost rose 25%.',
        intelVerdict: null,
        intelReason: null,
      },
      {
        adId: 'a2',
        adAccountId: 'act_1',
        adName: 'Ad two',
        title: null,
        format: 'image',
        thumbnailUrl: null,
        permalinkUrl: null,
        firstSeenAt: '2026-11-01T17:10:14Z',
        spend: 100,
        spendShare: 0.1,
        impressions: 500,
        costPerResult: { value: null, results: 0, kpi: 'leads', label: 'cost per lead' },
        hookRate: null,
        hookRateUnavailable: 'not_video',
        frequency: null,
        verdict: 'new',
        verdictWhy: 'Delivered this week and not the week before.',
        intelVerdict: null,
        intelReason: null,
      },
    ],
    otherCurrencies: [],
    source: { kind: 'paid_media.ads', ref: null, since: null, until: null },
  };
  const ready: HomeReadLoad<HomeCreativeSpotlightData> = {
    status: 'ready',
    generatedAt: '2026-11-04T12:00:00Z',
    data: SPOTLIGHT,
  };
  const ctx = homeContext({ adAccounts: [EASY_FIT_ACCOUNT] });

  it('adds what is fading to the tile, and the report keeps its headline', () => {
    spotlightLoad = ready;
    render(<CreativeTile ctx={ctx} tile={creativeTile('l')} />);
    expect(screen.getByTestId('home-tile-creative-spotlight').textContent).toBe(
      'Top 2 by spend: 1 fading · 1 new',
    );
    expect(
      screen.getByTestId('home-tile-creative-headline').getAttribute('data-source'),
    ).toBeNull();
  });

  it('opens hook rate, format and verdict per ad, with the read’s own unknowns', async () => {
    spotlightLoad = ready;
    render(<CreativeTile ctx={ctx} tile={creativeTile('l')} />);
    fireEvent.click(screen.getByTestId('home-tile-creative-open'));
    const ads = await screen.findAllByTestId('creative-spotlight-ad');
    expect(ads[0]?.getAttribute('data-verdict')).toBe('fading');
    expect(ads[0]?.textContent).toContain('Hook rate 25.0%');
    expect(ads[1]?.textContent).toContain('No hook rate: not a video');
    expect(ads[1]?.textContent).toContain('Frequency not reported');
    expect(ads[1]?.textContent).toContain('No result yet');
    expect(screen.queryByTestId('creative-not-readable')).toBeNull();
  });

  it('an expired thumbnail falls back to the placeholder, and never reaches for the Graph', async () => {
    spotlightLoad = ready;
    render(<CreativeTile ctx={ctx} tile={creativeTile('l')} />);
    fireEvent.click(screen.getByTestId('home-tile-creative-open'));
    const [first] = await screen.findAllByTestId('creative-spotlight-ad');
    const image = within(first as HTMLElement).getByTestId('creative-thumb');
    fireEvent.error(image);
    const placeholder = within(first as HTMLElement).getByTestId('creative-thumb-placeholder');
    expect(placeholder.getAttribute('data-expired')).toBe('true');
    expect(placeholder.textContent).toContain('Preview expired');
    expect(livePreview).not.toHaveBeenCalled();
  });

  it('a brand with no report still shows the ads that spent', () => {
    reportRead = {
      status: 'assembling',
      report: null,
      refreshedAt: null,
      isLoading: false,
      isError: false,
    };
    spotlightLoad = ready;
    render(<CreativeTile ctx={ctx} tile={creativeTile('m')} />);
    expect(frame().getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-creative-headline');
    expect(headline.getAttribute('data-value')).toBe('12');
    expect(headline.getAttribute('data-source')).toBe('spotlight');
  });

  it('without the read the tile and its honest line are as they were, never an error', async () => {
    spotlightLoad = { status: 'unavailable' };
    render(<CreativeTile ctx={ctx} tile={creativeTile('l')} />);
    expect(frame().getAttribute('data-module-state')).toBe('ready');
    expect(screen.queryByTestId('home-tile-creative-spotlight')).toBeNull();
    fireEvent.click(screen.getByTestId('home-tile-creative-open'));
    expect(await screen.findByTestId('creative-not-readable')).toBeTruthy();
  });
});
