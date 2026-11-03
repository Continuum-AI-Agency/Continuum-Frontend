import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { HomeBoardTile } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { homeCtx } from './__fixtures__/ctx';
import {
  EASY_FIT_FLIGHT,
  EASY_FIT_RUN,
  NO_FLIGHT,
  OCTOBER_FLIGHT,
  ready,
  USD_FLIGHT,
  USD_RUN,
} from './__fixtures__/pacing';
import type { PacingRunRead, PortfoliosRead } from './pacingModel';

// The tile's reads are replaced here; `mock.module` replaces them for the whole process, so this
// file runs on its own.
let portfolios: PortfoliosRead = { status: 'pending' };
let runs = new Map<string, PacingRunRead>();
let retries = 0;
const realReads = await import('./usePacingReads');
mock.module('./usePacingReads', () => ({
  ...realReads,
  usePacingReads: () => ({
    portfolios,
    runs,
    today: '2026-11-03',
    retry: () => {
      retries += 1;
    },
  }),
}));

const { default: PacingTile } = await import('./Tile');

const tile: HomeBoardTile = { id: 'pacing', size: 'm', urgency: 2, score: 37, why: null };
const ctx = homeCtx();

afterEach(() => {
  cleanup();
  portfolios = { status: 'pending' };
  runs = new Map();
  retries = 0;
});

describe('PacingTile', () => {
  it('leads with this period’s spend in the main currency, against plan and expected', () => {
    portfolios = { status: 'ready', rows: [EASY_FIT_FLIGHT, NO_FLIGHT, USD_FLIGHT] };
    runs = new Map([
      [EASY_FIT_FLIGHT.id, ready(EASY_FIT_RUN)],
      [USD_FLIGHT.id, ready(USD_RUN)],
    ]);
    render(<PacingTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-pacing').getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-pacing-headline');
    expect(headline.getAttribute('data-value')).toBe('1541.36');
    expect(headline.getAttribute('data-currency')).toBe('MXN');
    expect(headline.textContent).toContain('$1,541 MXN');
    const body = screen.getByTestId('home-tile-pacing').textContent ?? '';
    expect(body).toContain('$90K MXN plan');
    expect(body).toContain('$6,000 MXN expected by Nov 2');
    expect(body).toContain('$4,459 MXN behind (74%)');
    // The other currency stands apart, never added in.
    expect(screen.getByTestId('home-pacing-other-currency').textContent).toContain('$205 USD');
    expect(body).not.toMatch(/projected|landing/i);
  });

  it('opens per-portfolio rows, a flight not yet paced said so', async () => {
    portfolios = { status: 'ready', rows: [EASY_FIT_FLIGHT, OCTOBER_FLIGHT] };
    runs = new Map([[EASY_FIT_FLIGHT.id, ready(EASY_FIT_RUN)]]);
    render(<PacingTile ctx={ctx} tile={tile} />);
    fireEvent.click(screen.getByTestId('home-tile-pacing-open'));
    expect(await screen.findByTestId('home-pacing-module')).toBeTruthy();
    const rows = screen.getAllByTestId('home-pacing-row');
    expect(rows.map((row) => row.getAttribute('data-kind'))).toEqual(['running', 'ended']);
    expect(rows[0]?.textContent).toContain('Conversaciones Whatsapp');
    expect(rows[1]?.textContent).toContain('Ended Oct 31');
    const links = screen.getAllByTestId('home-pacing-row-link');
    for (const link of links) expect(link.className).toContain('hit-area');
    expect(screen.getByTestId('home-pacing-rows').className).toContain('hit-area-column');
  });

  it('is missing, in one sentence with the Optimizer link, when no portfolio has a plan', () => {
    portfolios = { status: 'ready', rows: [NO_FLIGHT] };
    render(<PacingTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-pacing').getAttribute('data-module-state')).toBe(
      'missing',
    );
    expect(screen.getByTestId('home-tile-missing').textContent).toContain(
      'No portfolio has a budget plan for this period',
    );
    const link = screen.getByRole('link', { name: /Optimizer/ });
    expect(link.getAttribute('href')).toBe('/scale?tab=performance');
    expect(screen.queryByTestId('home-tile-pacing-headline')).toBeNull();
  });

  it('is an error with a Retry when the portfolios could not be read', () => {
    portfolios = { status: 'error' };
    render(<PacingTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-pacing').getAttribute('data-module-state')).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retries).toBe(1);
  });

  it('is loading while a running flight is still being read', () => {
    portfolios = { status: 'ready', rows: [EASY_FIT_FLIGHT] };
    runs = new Map([[EASY_FIT_FLIGHT.id, { status: 'pending' }]]);
    render(<PacingTile ctx={ctx} tile={tile} />);
    expect(screen.getByTestId('home-tile-pacing').getAttribute('data-module-state')).toBe(
      'loading',
    );
  });
});
