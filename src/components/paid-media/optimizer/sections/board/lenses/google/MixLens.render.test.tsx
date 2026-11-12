import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AccountCandidate, AdAccount, PlatformCard } from '@continuum/contracts';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { platformCardOf } from '../../../platformCards/platformCardModel';
import { buildGoogleOverview } from '../../../platforms/googleAdsOverviewModel';
import type { GoogleAdsOverviewState } from '../../../platforms/useGoogleAdsOverview';
import {
  EASYFIT_ACCOUNT,
  EASYFIT_CAMPAIGNS,
  EASYFIT_CARDS,
  EASYFIT_PORTFOLIO,
  PINK_ACCOUNT,
  PINK_CAMPAIGNS,
  PINK_LINES,
  TANGASSI_ACCOUNT,
  TANGASSI_CAMPAIGNS,
  VIVO_ACCOUNT,
  VIVO_CAMPAIGNS,
} from './__fixtures__/mixAuctionSignalReads';
import {
  expectFitsAndThemes,
  fakeSupabase,
  googleBoard,
  renderWithQueries,
  type Served,
  slotOf,
} from './mixAuctionSignal.testing';

const served: Served = {
  account: {
    account_id: '5251780631',
    name: 'Easy Fit',
    currency: 'MXN',
    objective: 'lead',
    goal: 99,
    portfolioId: EASYFIT_PORTFOLIO,
  },
  cards: EASYFIT_CARDS,
  overview: EASYFIT_ACCOUNT,
  campaigns: EASYFIT_CAMPAIGNS,
  invoked: [],
};
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => fakeSupabase(served),
}));

const { default: MixLens, MixLensView, mixLensState } = await import('./MixLens');

afterEach(() => {
  cleanup();
  served.invoked.length = 0;
});

const account = (account_id: string, name: string): AdAccount => ({
  platform: 'google_ads',
  account_id,
  name,
  status: null,
  currency: 'MXN',
});

function ready(
  overview: ReturnType<typeof buildGoogleOverview>,
  name: string,
  resultBucket: 'leads' | 'purchases' | null,
): GoogleAdsOverviewState {
  return {
    status: 'ready',
    account: account('1', name),
    overview,
    resultBucket,
  };
}

const readyCards = (candidates: AccountCandidate[], extra: PlatformCard[] = []) => ({
  status: 'ready' as const,
  candidates,
  cards: [...candidates.flatMap((candidate) => platformCardOf(candidate) ?? []), ...extra],
});

const EASYFIT = ready(buildGoogleOverview(EASYFIT_ACCOUNT, EASYFIT_CAMPAIGNS), 'Easy Fit', 'leads');
const easyFitState = mixLensState({
  google: EASYFIT,
  cards: readyCards(EASYFIT_CARDS),
  campaigns: null,
  goal: 99,
});

const texts = (testId: string) => screen.getAllByTestId(testId).map((node) => node.textContent);

describe('MixLensView — by campaign type, Easy Fit in October', () => {
  it('m: the spend and the leads as two whole bars joined per type, each type priced against the goal', () => {
    const { container } = render(
      <MixLensView
        reason="PMax: 38% del gasto, 92% de las conversiones"
        size="m"
        state={easyFitState}
      />,
    );
    const frame = screen.getByTestId('board-module-mix');
    expect(frame.getAttribute('data-size')).toBe('m');
    expect(frame.getAttribute('data-module-state')).toBe('ready');
    // The window it covers sits beside the title: the result beside it reads seven days.
    expect(screen.getByTestId('mix-window').textContent).toBe('Last 31 days');
    expect(screen.getByTestId('board-module-mix-reason').textContent).toBe(
      'PMax: 38% del gasto, 92% de las conversiones',
    );
    expect(
      screen.getAllByTestId('mix-segment').map((node) => node.getAttribute('aria-label')),
    ).toEqual([
      'Search · share of spend: 62%',
      'Performance Max · share of spend: 38%',
      'Search · share of leads: 8%',
      'Performance Max · share of leads: 92%',
    ]);
    expect(screen.getAllByTestId('mix-ribbon')).toHaveLength(2);
    expect(texts('mix-row-shares')).toEqual([
      '62% of spend → 8% of leads',
      '38% of spend → 92% of leads',
    ]);
    expect(texts('mix-row-cost')).toEqual(['$502 MXN per lead', '$27.18 MXN per lead']);
    expect(texts('mix-goal')).toEqual(['407% over goal', '73% under goal']);
    const takeaway = screen.getByTestId('mix-takeaway');
    expect(takeaway.getAttribute('lang')).toBe('es');
    expect(takeaway.textContent).toBe(
      'Search lleva 62% del gasto y trae 8% de los leads ($502 MXN por lead); Performance Max lleva 38% y trae 92% ($27.18 MXN por lead).',
    );
    expect(screen.getByText('Oct 1 – Oct 31 · what Google reports')).toBeTruthy();
    expectFitsAndThemes(container);
  });

  it('s: one headline figure over the mini bars, with its legend and no sentence', () => {
    render(<MixLensView size="s" state={easyFitState} />);
    const headline = screen.getByTestId('mix-headline');
    expect(headline.textContent).toBe('62% → 8%Search · share of spend → share of leads');
    expect(headline.querySelector('[data-figure-raw]')?.getAttribute('data-figure-raw')).toBe('62');
    expect(screen.getByTestId('mix-legend').querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByTestId('mix-rows')).toBeNull();
    expect(screen.queryByTestId('mix-takeaway')).toBeNull();
  });

  it('Tangassi, no portfolio: the parts read as conversions and no goal is drawn', () => {
    const state = mixLensState({
      google: ready(buildGoogleOverview(TANGASSI_ACCOUNT, TANGASSI_CAMPAIGNS), 'Tangassi', null),
      cards: readyCards([]),
      campaigns: null,
      goal: null,
    });
    render(<MixLensView size="l" state={state} />);
    expect(texts('mix-row-cost')).toEqual(['$160 MXN per conversion', '$332 MXN per conversion']);
    expect(screen.queryAllByTestId('mix-goal')).toHaveLength(0);
  });
});

describe('MixLensView — when the results do not split', () => {
  it('Vivo 47: no lead counted per campaign, so only the spend splits, said once', () => {
    const state = mixLensState({
      google: ready(buildGoogleOverview(VIVO_ACCOUNT, VIVO_CAMPAIGNS), 'Vivo 47', 'leads'),
      cards: readyCards([]),
      campaigns: null,
      goal: null,
    });
    render(<MixLensView size="m" state={state} />);
    expect(screen.getByTestId('mix-no-results').textContent).toBe(
      'No leads in this window: only the spend splits here.',
    );
    expect(screen.queryAllByTestId('mix-ribbon')).toHaveLength(0);
    expect(texts('mix-row-cost')).toEqual(['no lead yet', 'no lead yet']);
  });

  it('Pink Elephant runs Search only: a pair of bars per campaign, spend alone', () => {
    const state = mixLensState({
      google: ready(
        buildGoogleOverview(PINK_ACCOUNT, PINK_CAMPAIGNS),
        'Pink Elephant',
        'purchases',
      ),
      cards: readyCards([]),
      campaigns: { data: PINK_CAMPAIGNS, isError: false, error: null },
      goal: null,
    });
    const { container } = render(<MixLensView size="m" state={state} />);
    expect(screen.getAllByTestId('mix-pair')).toHaveLength(3);
    expect(texts('mix-row-shares')).toEqual(['56% of spend', '33% of spend', '11% of spend']);
    expect(screen.getByTestId('mix-legend').textContent).toBe('Share of spend');
    expect(screen.getByTestId('mix-takeaway').textContent).toBe(
      'Cursos-pink-elephant-2025 lleva 56% del gasto; ITSM 2026, 33%.',
    );
    expectFitsAndThemes(container);
  });

  it('waits for the campaign read the split needs, and says when it fails', () => {
    const google = ready(buildGoogleOverview(PINK_ACCOUNT, PINK_CAMPAIGNS), 'Pink', 'purchases');
    const base = { google, cards: readyCards([]), goal: null };
    expect(
      mixLensState({
        ...base,
        campaigns: { data: undefined, isError: false, error: null },
      }),
    ).toEqual({ status: 'loading' });
    expect(
      mixLensState({
        ...base,
        campaigns: {
          data: undefined,
          isError: true,
          error: new Error('Quota exceeded.'),
        },
      }),
    ).toEqual({
      status: 'error',
      line: 'The campaigns could not be read: Quota exceeded.',
    });
  });
});

describe('MixLensView — by course line, against the split agreed with the client', () => {
  const state = mixLensState({
    google: { status: 'loading' },
    cards: readyCards([], [PINK_LINES]),
    campaigns: null,
    goal: null,
  });

  it('m: each line against its agreed share, read on the finding alone', () => {
    render(<MixLensView size="m" state={state} />);
    expect(screen.getAllByTestId('mix-line')).toHaveLength(3);
    expect(texts('mix-line-share')).toEqual([
      '40% · agreed 40%',
      '17% · agreed 20%',
      '44% · agreed 40%',
    ]);
    expect(screen.getAllByTestId('mix-line-agreed')).toHaveLength(3);
    expect(texts('mix-line-deviation')).toEqual(['0 pts', '-3 pts', '+4 pts']);
    expect(screen.getByTestId('mix-legend').textContent).toBe('On the agreed splitAgreed share');
    expect(screen.getByTestId('mix-takeaway').textContent).toBe(
      'ITSM lleva 40% del gasto contra 40% acordado; COBIT · BRM · IA · eventos, 17% contra 20%; ISO, 44% contra 40%.',
    );
    expect(screen.getByText("From the Optimizer's last cycle")).toBeTruthy();
    expect(screen.getByTestId('mix-window').textContent).toBe('Last 30 days');
  });

  it('s: the line furthest from its agreed share', () => {
    render(<MixLensView size="s" state={state} />);
    expect(screen.getByTestId('mix-headline').textContent).toBe(
      '44%ISO · share of spend, agreed 40%',
    );
    expect(screen.getAllByTestId('mix-line')).toHaveLength(1);
  });
});

const frameState = () => screen.getByTestId('board-module-mix').getAttribute('data-module-state');

describe('MixLensView — nothing to draw, and the frame says which', () => {
  it('loading holds the footprint, its window already named', () => {
    render(<MixLensView size="m" state={{ status: 'loading' }} />);
    expect(screen.getByTestId('mix-loading')).toBeTruthy();
    expect(frameState()).toBe('loading');
    expect(screen.getByTestId('mix-window').textContent).toBe('Last 30 days');
  });

  it('an account that is not granted is missing, said in one line', () => {
    const state = mixLensState({
      google: { status: 'no-grant' },
      cards: readyCards([]),
      campaigns: null,
      goal: null,
    });
    render(<MixLensView size="m" state={state} />);
    expect(frameState()).toBe('missing');
    expect(screen.getByTestId('mix-empty').textContent).toBe(
      'No Google Ads account is granted to this brand.',
    );
  });

  it('a read that failed is an error, with its own words', () => {
    const google = ready(buildGoogleOverview(PINK_ACCOUNT, PINK_CAMPAIGNS), 'Pink', 'purchases');
    const state = mixLensState({
      google,
      cards: readyCards([]),
      campaigns: {
        data: undefined,
        isError: true,
        error: new Error('Quota exceeded.'),
      },
      goal: null,
    });
    render(<MixLensView size="m" state={state} />);
    expect(frameState()).toBe('error');
    expect(screen.getByTestId('mix-empty').textContent).toBe(
      'The campaigns could not be read: Quota exceeded.',
    );
  });

  it('one campaign is no mix', () => {
    const one = buildGoogleOverview(TANGASSI_ACCOUNT, {
      ...TANGASSI_CAMPAIGNS,
      rows: TANGASSI_CAMPAIGNS.rows.slice(1),
    });
    const state = mixLensState({
      google: ready(one, 'Tangassi', null),
      cards: readyCards([]),
      campaigns: null,
      goal: null,
    });
    render(<MixLensView size="m" state={state} />);
    expect(frameState()).toBe('missing');
    expect(screen.getByTestId('mix-empty').textContent).toBe(
      'One campaign spent in this window: there is no mix to compare.',
    );
  });
});

describe('MixLens — on the board, through the browser client', () => {
  it("reads the Google tab's account over the reading's 30 complete days and draws the split", async () => {
    renderWithQueries(
      <MixLens
        ctx={googleBoard('22222222-2222-4222-8222-222222222222', 99)}
        slot={slotOf('mix', 'm', 'PMax: 38% del gasto, 92% de las conversiones')}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('mix-takeaway')).toBeTruthy());
    expect(screen.getByTestId('mix-takeaway').textContent).toContain(
      'Search lleva 62% del gasto y trae 8% de los leads',
    );
    expect(texts('mix-goal')).toEqual(['407% over goal', '73% under goal']);
    const scopes = served.invoked.map((body) => body.scope);
    expect(scopes).toEqual(expect.arrayContaining(['account_overview', 'top_campaigns']));
    const range = served.invoked[0]?.range as { since: string; until: string };
    const days = (Date.parse(range.until) - Date.parse(range.since)) / 86_400_000 + 1;
    expect(days).toBe(30);
    expect(served.invoked.every((body) => body.resultBucket === 'leads')).toBe(true);
  });
});
