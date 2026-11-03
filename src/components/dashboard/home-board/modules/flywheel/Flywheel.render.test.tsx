import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { OrganicWinners } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EASY_FIT_ACCOUNT, EASY_FIT_REPORT } from '../creative/__fixtures__/creativeReport';
import { NO_WINNERS, TWO_WINNERS } from './__fixtures__/organicWinners';

// `mock.module` replaces a module for the whole process, so this file runs on its own; every mock
// spreads the real module.
let winners: { data: OrganicWinners | undefined; isLoading: boolean; isError: boolean } = {
  data: TWO_WINNERS,
  isLoading: false,
  isError: false,
};
const refetchWinners = mock(() => {});
const promote = mock(() => {});
const realWinners = await import('@/hooks/useOrganicWinners');
mock.module('@/hooks/useOrganicWinners', () => ({
  ...realWinners,
  useOrganicWinners: () => ({ ...winners, refetch: refetchWinners }),
  usePromotionAdsets: () => ({
    data: {
      adAccountId: 'act_521903353286118',
      refused: null,
      adsets: [
        {
          id: '120251135197790236',
          name: 'BOF Cañadas',
          campaignName: 'Mensajes',
          status: 'ACTIVE',
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  usePromoteWinner: () => ({ mutate: promote, isPending: false, isError: false, data: undefined }),
}));

const { default: Flywheel } = await import('./Flywheel');
const { creativeTileState, needsNewCreative } = await import('../creative/creativeModel');
const { FLYWHEEL_SENTENCES } = await import('./flywheelModel');

const view = creativeTileState(
  { status: 'ready', report: EASY_FIT_REPORT, isLoading: false, isError: false },
  [EASY_FIT_ACCOUNT],
);
if (view.state !== 'ready') throw new Error('fixture is not ready');
const candidates = needsNewCreative(view.spotlight);

afterEach(() => {
  cleanup();
  winners = { data: TWO_WINNERS, isLoading: false, isError: false };
  promote.mockClear();
  refetchWinners.mockClear();
});

const BRAND = '148583e0-5538-462b-8d3a-acd25b80344e';
const lane = (name: RegExp) => fireEvent.click(screen.getByRole('tab', { name }));

describe('Flywheel', () => {
  it('counts each lane from its own read, and marks the third one not available', () => {
    render(
      <Flywheel
        brandId={BRAND}
        mode="operate"
        refreshCandidates={candidates}
        verbLabel="Create paused"
      />,
    );
    expect(screen.getByRole('tab', { name: /Organic → Paid/ }).textContent).toContain('2');
    expect(screen.getByRole('tab', { name: /Paid → Creative/ }).textContent).toContain('3');
    expect(screen.getByRole('tab', { name: /Creative → Organic/ }).textContent).toContain(
      'Not available',
    );
  });

  it('lists organic winners with their lifts; in operate mode an unpromoted one gets the verb', () => {
    render(
      <Flywheel
        brandId={BRAND}
        mode="operate"
        refreshCandidates={candidates}
        verbLabel="Create paused"
      />,
    );
    const items = screen.getAllByTestId('flywheel-winner');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Tu primer mes por $12');
    expect(items[0].textContent).toContain('Reach 4.2× · engagement 1.6× the account median');
    expect(within(items[1]).getByText('Running as ad')).toBeTruthy();
    expect(within(items[1]).queryByRole('button')).toBeNull();

    fireEvent.click(within(items[0]).getByRole('button', { name: 'Create paused' }));
    fireEvent.change(screen.getByLabelText('Ad set'), { target: { value: '120251135197790236' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create paused ad' }));
    expect(promote).toHaveBeenCalledWith({
      mediaId: '18000000000000001',
      adsetId: '120251135197790236',
      makeVariations: false,
    });
  });

  it('outside operate mode, links to where the promote action lives instead of acting', () => {
    render(
      <Flywheel
        brandId={BRAND}
        mode="recommend"
        refreshCandidates={candidates}
        verbLabel="Add to checklist"
      />,
    );
    const item = screen.getAllByTestId('flywheel-winner')[0];
    expect(within(item).queryByRole('button')).toBeNull();
    expect(
      within(item)
        .getByRole('link', { name: /Open in Organic/ })
        .getAttribute('href'),
    ).toBe('/organic?tab=metrics');
  });

  it('says why the organic lane is empty', () => {
    winners = { data: NO_WINNERS, isLoading: false, isError: false };
    render(
      <Flywheel
        brandId={BRAND}
        mode="operate"
        refreshCandidates={candidates}
        verbLabel="Create paused"
      />,
    );
    lane(/Organic → Paid/);
    expect(screen.getByTestId('flywheel-lane-empty').textContent).toBe(
      FLYWHEEL_SENTENCES.noWinners,
    );
  });

  it('offers a Retry when the winners read failed', () => {
    winners = { data: undefined, isLoading: false, isError: true };
    render(
      <Flywheel
        brandId={BRAND}
        mode="operate"
        refreshCandidates={candidates}
        verbLabel="Create paused"
      />,
    );
    lane(/Organic → Paid/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetchWinners).toHaveBeenCalledTimes(1);
  });

  it('lists the ads that need a new creative, with the stored brief title, and AI Studio', () => {
    render(
      <Flywheel
        brandId={BRAND}
        mode="operate"
        refreshCandidates={candidates}
        verbLabel="Create paused"
      />,
    );
    lane(/Paid → Creative/);
    const items = screen.getAllByTestId('flywheel-refresh');
    expect(items).toHaveLength(3);
    expect(items[2].textContent).toContain('Low-Barrier Enrollment Offer for Gym Sign-ups');
    expect(screen.getByRole('link', { name: /Open AI Studio/ }).getAttribute('href')).toBe(
      '/ai-studio',
    );
  });

  it('says the paid lane is empty when the report flags nothing', () => {
    render(
      <Flywheel brandId={BRAND} mode="operate" refreshCandidates={[]} verbLabel="Create paused" />,
    );
    lane(/Paid → Creative/);
    expect(screen.getByTestId('flywheel-lane-empty').textContent).toBe(
      FLYWHEEL_SENTENCES.nothingToRefresh,
    );
  });

  it('shows the Creative → Organic lane as not available, never with items', () => {
    render(
      <Flywheel
        brandId={BRAND}
        mode="operate"
        refreshCandidates={candidates}
        verbLabel="Create paused"
      />,
    );
    lane(/Creative → Organic/);
    expect(screen.getByTestId('flywheel-lane-unavailable').textContent).toBe(
      FLYWHEEL_SENTENCES.notAvailable,
    );
    expect(screen.queryAllByTestId('flywheel-winner')).toHaveLength(0);
    expect(screen.queryAllByTestId('flywheel-refresh')).toHaveLength(0);
  });
});
