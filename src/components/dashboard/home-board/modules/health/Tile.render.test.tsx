import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { HomeBoardTile } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { deriveDashboardSetup } from '@/components/dashboard/first-run/setupState';
import { EASY_FIT_GOOGLE, EASY_FIT_META, homeCtx } from '../pacing/__fixtures__/ctx';
import {
  GOOGLE_PORTFOLIO,
  META_PORTFOLIO,
  READ_NO_GUARDS,
  SUSPENDED_CARD,
} from './__fixtures__/doctor';
import type { DoctorReads } from './useDoctorReads';

// The tile's reads are replaced here; `mock.module` replaces them for the whole process, so this
// file runs on its own.
let reads: Omit<DoctorReads, 'retry'> = {
  portfolios: { status: 'pending' },
  accountReads: [],
  googleCards: null,
};
let retries = 0;
const realReads = await import('./useDoctorReads');
mock.module('./useDoctorReads', () => ({
  ...realReads,
  useDoctorReads: () => ({
    ...reads,
    retry: () => {
      retries += 1;
    },
  }),
}));

const { default: HealthTile } = await import('./Tile');

const tile: HomeBoardTile = { id: 'health', size: 'm', urgency: 3, score: 90, why: null };
const ctx = homeCtx({
  adAccounts: [EASY_FIT_META, EASY_FIT_GOOGLE],
  setup: deriveDashboardSetup({
    hasConnectedProviders: true,
    hasAssignedAccounts: true,
    brandBook: {
      brand_id: 'brand-1',
      status: 'ready',
      present: true,
      refreshed_at: '2026-07-01T00:00:00.000Z',
      assembled: { report: { readiness: null } },
    } as never,
  }),
});

const SUSPENDED: Omit<DoctorReads, 'retry'> = {
  portfolios: { status: 'ready', rows: [META_PORTFOLIO, GOOGLE_PORTFOLIO] },
  accountReads: [
    { account: EASY_FIT_META, status: 'success', data: READ_NO_GUARDS },
    { account: EASY_FIT_GOOGLE, status: 'success', data: READ_NO_GUARDS },
  ],
  googleCards: { status: 'ready', cards: [SUSPENDED_CARD] },
};

afterEach(() => {
  cleanup();
  reads = { portfolios: { status: 'pending' }, accountReads: [], googleCards: null };
  retries = 0;
});

describe('HealthTile', () => {
  it('says how many readable checks pass, and leads with the one to fix', () => {
    reads = SUSPENDED;
    render(<HealthTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-health').getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-health-headline');
    // portfolios + Google delivery + 2 measurement + 3 setup = 7 readable; Google fails.
    expect(headline.getAttribute('data-value')).toBe('6');
    expect(headline.getAttribute('data-total')).toBe('7');
    expect(headline.textContent).toContain('6 of 7');
    expect(headline.textContent).toContain('checks pass');
    const failing = screen.getByTestId('home-health-failing');
    expect(failing.className).toContain('hit-area-column');
    expect(failing.textContent).toContain('Google suspended this account’s campaigns');
    const fix = within(failing).getByRole('link', { name: 'Open in Google Ads' });
    expect(fix.className).toContain('hit-area');
    expect(fix.getAttribute('href')).toBe('https://ads.google.com/aw/campaigns');
    expect(screen.getByTestId('home-tile-health').textContent).not.toMatch(/\/ 100|score/i);
  });

  it('opens every check, the ones not readable yet set apart and never passing', async () => {
    reads = SUSPENDED;
    render(<HealthTile ctx={ctx} tile={tile} />);
    fireEvent.click(screen.getByTestId('home-tile-health-open'));
    expect(await screen.findByTestId('home-health-module')).toBeTruthy();
    const unreadable = screen.getByTestId('home-health-group-unreadable');
    expect(unreadable.textContent).toContain('Campaign and ad names follow the naming convention');
    expect(unreadable.textContent).toContain('No ad has run longer than 30 days');
    expect(screen.getByTestId('home-health-group-pass').textContent).not.toContain('naming');
    for (const list of screen.getAllByTestId('home-health-list')) {
      expect(list.className).toContain('hit-area-column');
    }
    for (const link of screen.getAllByTestId('home-health-fix')) {
      expect(link.className).toContain('hit-area');
    }
  });

  it('is missing, in one sentence, when nothing can be checked', () => {
    reads = { portfolios: { status: 'ready', rows: [] }, accountReads: [], googleCards: null };
    render(<HealthTile ctx={homeCtx({ adAccounts: [], setup: null })} tile={tile} />);
    expect(screen.getByTestId('home-tile-health').getAttribute('data-module-state')).toBe(
      'missing',
    );
    expect(screen.getByTestId('home-tile-missing').textContent).toContain(
      'Nothing here can be checked yet',
    );
  });

  it('is an error with a Retry when every read failed', () => {
    reads = {
      portfolios: { status: 'error' },
      accountReads: [
        { account: EASY_FIT_META, status: 'error', data: undefined },
        { account: EASY_FIT_GOOGLE, status: 'error', data: undefined },
      ],
      googleCards: { status: 'error' },
    };
    render(<HealthTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-health').getAttribute('data-module-state')).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retries).toBe(1);
  });

  it('is loading while a read is on its way', () => {
    render(<HealthTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-health').getAttribute('data-module-state')).toBe(
      'loading',
    );
  });
});
