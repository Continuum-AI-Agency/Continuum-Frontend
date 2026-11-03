import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OrganicWinners } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PaidCreativeReadState } from '@/hooks/usePaidCreativeReport';
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
