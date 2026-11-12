import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AccountCandidate, AdAccount, GoogleTopCampaigns } from '@continuum/contracts';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { platformCardOf } from '../../../platformCards/platformCardModel';
import { buildGoogleOverview } from '../../../platforms/googleAdsOverviewModel';
import type { GoogleAdsOverviewState } from '../../../platforms/useGoogleAdsOverview';
import {
  EASYFIT_ACCOUNT,
  EASYFIT_CAMPAIGNS,
  EASYFIT_CARDS,
  EASYFIT_SUSPENDED_1031,
  PINK_ACCOUNT,
  PINK_CAMPAIGNS,
  VIVO_ACCOUNT,
  VIVO_CAMPAIGNS,
  VIVO_CARDS,
  VIVO_PORTFOLIO,
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
    account_id: '3710693645',
    name: 'Vivo 47',
    currency: 'MXN',
    objective: 'lead',
    goal: null,
    portfolioId: VIVO_PORTFOLIO,
  },
  cards: VIVO_CARDS,
  overview: VIVO_ACCOUNT,
  campaigns: VIVO_CAMPAIGNS,
  invoked: [],
};
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => fakeSupabase(served),
}));

const { default: AuctionLens, AuctionLensView, auctionLensState } = await import('./AuctionLens');
const { buildAuctionDark } = await import('./auctionModel');

afterEach(() => {
  cleanup();
  served.invoked.length = 0;
});

const OCTOBER = { since: '2026-10-01', until: '2026-10-31' };

const account = (name: string): AdAccount => ({
  platform: 'google_ads',
  account_id: '1',
  name,
  status: null,
  currency: 'MXN',
});

const readyCards = (candidates: AccountCandidate[]) => ({
  status: 'ready' as const,
  candidates,
  cards: candidates.flatMap((candidate) => platformCardOf(candidate) ?? []),
});

function sharesState(
  read: GoogleTopCampaigns,
  overview: Parameters<typeof buildGoogleOverview>[0],
  candidates: AccountCandidate[],
  cardsUnread = false,
) {
  const google: GoogleAdsOverviewState = {
    status: 'ready',
    account: account('Google'),
    overview: buildGoogleOverview(overview, read),
    resultBucket: 'leads',
  };
  return auctionLensState({
    google,
    cards: cardsUnread ? { status: 'error' } : readyCards(candidates),
    dark: null,
    campaigns: { data: read, isError: false, error: null },
    readWindow: OCTOBER,
  });
}

function darkState(candidates: AccountCandidate[], today: string, readWindow: typeof OCTOBER) {
  const cards = readyCards(candidates);
  return auctionLensState({
    google: { status: 'loading' },
    cards,
    dark: buildAuctionDark(cards.candidates, cards.cards, readWindow, today),
    campaigns: { data: undefined, isError: false, error: null },
    readWindow,
  });
}

const texts = (testId: string) => screen.getAllByTestId(testId).map((node) => node.textContent);
const frameState = () =>
  screen.getByTestId('board-module-auction').getAttribute('data-module-state');
const labels = (testId: string) =>
  screen.getAllByTestId(testId).map((node) => node.getAttribute('aria-label'));

describe('AuctionLensView — Vivo 47: EKATAR loses 74% to budget, and its raise waits', () => {
  const state = sharesState(VIVO_CAMPAIGNS, VIVO_ACCOUNT, VIVO_CARDS);

  it('m: a stacked bar per campaign, the V3 case marked and its raise locked', () => {
    const { container } = render(
      <AuctionLensView reason="EKATAR pierde 74% por presupuesto" size="m" state={state} />,
    );
    expect(frameState()).toBe('ready');
    expect(screen.getByTestId('auction-window').textContent).toBe('Last 31 days');
    const rows = screen.getAllByTestId('auction-row');
    expect(
      rows.map((row) => [row.getAttribute('data-v3'), row.getAttribute('data-locked')]),
    ).toEqual([
      ['true', 'true'],
      ['false', 'false'],
    ]);
    expect(labels('auction-part-budget')).toEqual(['VIVO 47-EKATAR · Lost to budget: 74%']);
    expect(labels('auction-part-rank')).toEqual(['SALES-PMAX-OCTUBRE · Lost to rank: 78%']);
    // What Google did not report is the empty track, never a share drawn as zero.
    expect(screen.getAllByTestId('auction-part-unread')).toHaveLength(2);
    expect(screen.queryAllByTestId('auction-part-shown')).toHaveLength(0);
    expect(texts('auction-row-shares')).toEqual([
      'Shown —Lost to budget 74%Lost to rank —',
      'Shown —Lost to budget —Lost to rank 78%',
    ]);
    expect(texts('auction-v3')).toEqual(['50% or more lost to budget']);
    expect(texts('auction-locked')).toEqual(['Raise locked']);
    expect(screen.getByTestId('auction-lock-note').textContent).toBe(
      'Raise locked for VIVO 47-EKATAR: fix the primary conversion first, then the budget card proposes the raise against real leads.',
    );
    expect(screen.getByTestId('auction-legend').textContent).toContain('Not in this read');
    expect(texts('auction-reasons')).toEqual([
      '— Google reported no impression share for this window.',
    ]);
    expect(screen.getByTestId('auction-takeaway').textContent).toBe(
      'VIVO 47-EKATAR pierde 74% de sus impresiones por presupuesto: subir el presupuesto espera la corrección de la conversión; SALES-PMAX-OCTUBRE pierde 78% por ranking, que el presupuesto no recupera.',
    );
    expect(
      screen.getByText("Oct 1 – Oct 31 · Google's impression share on Search, per campaign"),
    ).toBeTruthy();
    expectFitsAndThemes(container);
  });

  it('s: the share lost to budget as the headline, over its one bar', () => {
    render(<AuctionLensView size="s" state={state} />);
    expect(screen.getByTestId('auction-headline').textContent).toBe(
      '74%VIVO 47-EKATAR · lost to budget',
    );
    expect(screen.getAllByTestId('auction-row')).toHaveLength(1);
    expect(screen.queryByTestId('auction-legend')).toBeNull();
    expect(screen.queryByTestId('auction-takeaway')).toBeNull();
  });

  it('says so when the Optimizer’s cards did not answer: no lock can be told', () => {
    render(
      <AuctionLensView size="m" state={sharesState(VIVO_CAMPAIGNS, VIVO_ACCOUNT, [], true)} />,
    );
    expect(screen.getByTestId('auction-cards-unread')).toBeTruthy();
    expect(screen.queryAllByTestId('auction-locked')).toHaveLength(0);
  });
});

describe('AuctionLensView — Pink Elephant: three campaigns under the V3 line', () => {
  it('draws each loss to budget with no mark and no lock', () => {
    render(<AuctionLensView size="m" state={sharesState(PINK_CAMPAIGNS, PINK_ACCOUNT, [])} />);
    expect(labels('auction-part-budget')).toEqual([
      'Cursos-pink-elephant-2025 · Lost to budget: 16%',
      'ITSM 2026 · Lost to budget: 21%',
      'Eventos 2026 · Lost to budget: 38%',
    ]);
    expect(screen.queryAllByTestId('auction-v3')).toHaveLength(0);
    expect(screen.getByTestId('auction-takeaway').textContent).toBe(
      'Eventos 2026 pierde 38% de sus impresiones por presupuesto.',
    );
  });

  it('with no campaign on Search, one line says so', () => {
    const pmaxOnly = {
      ...EASYFIT_CAMPAIGNS,
      rows: EASYFIT_CAMPAIGNS.rows.filter((row) => row.labels?.channel_type === 'PERFORMANCE_MAX'),
    };
    render(<AuctionLensView size="m" state={sharesState(pmaxOnly, EASYFIT_ACCOUNT, [])} />);
    expect(frameState()).toBe('missing');
    expect(screen.getByTestId('auction-empty').textContent).toBe(
      'No campaign served on Search in this window.',
    );
  });
});

describe('AuctionLensView — the frame says what the lens could show', () => {
  const base = {
    cards: readyCards([]),
    dark: null,
    campaigns: { data: undefined, isError: false, error: null },
    readWindow: OCTOBER,
  };

  it('loading while the reads answer, its window already named', () => {
    render(
      <AuctionLensView
        size="m"
        state={auctionLensState({ ...base, google: { status: 'loading' } })}
      />,
    );
    expect(frameState()).toBe('loading');
    expect(screen.getByTestId('auction-window').textContent).toBe('Last 30 days');
  });

  it('missing without a Google connection, error when Google refused the read', () => {
    render(
      <AuctionLensView
        size="m"
        state={auctionLensState({
          ...base,
          google: { status: 'no-connection' },
        })}
      />,
    );
    expect(frameState()).toBe('missing');
    expect(screen.getByTestId('auction-empty').textContent).toBe(
      'Google Ads is not connected for this brand.',
    );
    cleanup();
    render(
      <AuctionLensView
        size="m"
        state={auctionLensState({
          ...base,
          google: {
            status: 'error',
            account: null,
            message: 'USER_PERMISSION_DENIED',
          },
        })}
      />,
    );
    expect(frameState()).toBe('error');
    expect(screen.getByTestId('auction-empty').textContent).toBe(
      'Google Ads could not be read: USER_PERMISSION_DENIED',
    );
  });
});

describe('AuctionLensView — the account does not deliver: the calendar of days without ads', () => {
  it('Easy Fit, Nov 2 (E1): every day since Oct 8, 11 of them dark, shaded by spend', () => {
    const state = darkState(EASYFIT_CARDS, '2026-11-02', {
      since: '2026-10-03',
      until: '2026-11-01',
    });
    const { container } = render(<AuctionLensView size="l" state={state} />);
    expect(frameState()).toBe('ready');
    expect(screen.getByTestId('auction-window').textContent).toBe('Last 30 days');
    expect(screen.getByTestId('auction-dark-days').textContent).toBe('11 days without ads');
    expect(screen.getAllByTestId('auction-day-dark')).toHaveLength(11);
    expect(screen.getAllByTestId('auction-day-served')).toHaveLength(14);
    expect(labels('auction-day-dark')[0]).toBe('Oct 15: No ad shown');
    expect(labels('auction-day-served')[0]).toBe('Oct 8: $5,100 MXN spent');
    expect(screen.getByTestId('auction-legend').textContent).toBe(
      'Ads shown · shade is the spendNo ad shown',
    );
    expect(screen.queryByTestId('auction-delivery-status')).toBeNull();
    expect(screen.getByTestId('auction-takeaway').textContent).toBe(
      'La cuenta no mostró anuncios 11 días (15–19 oct y 26–31 oct): unas 409 conversiones perdidas al promedio de los días servidos.',
    );
    expect(
      screen.getByText(
        "Oct 8 – Nov 1 · the days Google showed no ad, from the Optimizer's last cycle",
      ),
    ).toBeTruthy();
    expectFitsAndThemes(container);
  });

  it('Easy Fit, Oct 31 (G12): suspended, no ad since Oct 26, and where it is fixed', () => {
    const state = darkState([EASYFIT_SUSPENDED_1031], '2026-10-31', {
      since: '2026-10-01',
      until: '2026-10-30',
    });
    render(<AuctionLensView size="m" state={state} />);
    expect(screen.getAllByTestId('auction-day-dark')).toHaveLength(5);
    // The card says nothing of the days before the run: they are drawn as unread, not served.
    expect(screen.getAllByTestId('auction-day-unknown')).toHaveLength(25);
    expect(screen.queryAllByTestId('auction-day-served')).toHaveLength(0);
    const status = screen.getByTestId('auction-delivery-status');
    expect(status.getAttribute('data-tone')).toBe('suspended');
    expect(status.textContent).toContain('Google suspended this account’s campaigns');
    expect(status.querySelector('a')?.getAttribute('href')).toBe(
      'https://ads.google.com/aw/campaigns',
    );
    expect(screen.getByTestId('auction-takeaway').textContent).toBe(
      'Google suspendió la cuenta: sin anuncios desde el 26 oct (5 días), con $670 MXN al día de presupuesto esperando.',
    );
  });

  it('s: the count of dark days over the last two weeks of the calendar', () => {
    const state = darkState(EASYFIT_CARDS, '2026-11-02', {
      since: '2026-10-03',
      until: '2026-11-01',
    });
    render(<AuctionLensView size="s" state={state} />);
    expect(screen.getByTestId('auction-headline').textContent).toBe('11days without ads');
    expect(screen.getAllByTestId('auction-day-dark')).toHaveLength(7);
    expect(screen.queryByTestId('auction-takeaway')).toBeNull();
  });
});

describe('AuctionLens — on the board, through the browser client', () => {
  it('reads the campaigns over 30 complete days and draws Vivo 47’s locked raise', async () => {
    renderWithQueries(
      <AuctionLens
        ctx={googleBoard('33333333-3333-4333-8333-333333333333', null)}
        slot={slotOf('auction', 'm', 'EKATAR pierde 74% por presupuesto')}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('auction-takeaway')).toBeTruthy());
    expect(frameState()).toBe('ready');
    expect(screen.getByTestId('auction-window').textContent).toBe('Last 30 days');
    expect(texts('auction-locked')).toEqual(['Raise locked']);
    const read = served.invoked.find((body) => body.scope === 'top_campaigns');
    const range = read?.range as { since: string; until: string };
    expect((Date.parse(range.until) - Date.parse(range.since)) / 86_400_000 + 1).toBe(30);
  });
});
