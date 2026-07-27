import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AdSetSnapshot, PortfolioSuggestion } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import * as realData from '../useOptimizerData';

// Stub motion so open/close is synchronous — the explorer's reveal is not what this
// spec asserts, and height:'auto' animations don't settle deterministically in jsdom.
mock.module('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  useReducedMotion: () => true,
}));

mock.module('@/hooks/usePaidCreativeRecovery', () => ({
  usePaidCreativeRecovery: () => ({ freshUrlById: {}, recover: () => {} }),
}));

const createMutate = mock(() => {});

const suggestions: PortfolioSuggestion[] = [
  {
    objective: 'awareness',
    name: 'Awareness · Efficiency',
    level: 'adset',
    mode: 'efficiency',
    daily_total: 200,
    adset_ids: ['as-1'],
    summary: { adsets: 1, spend14: 1000, conv14: 0 },
    reason: 'Grouped by objective',
  },
  {
    objective: 'lead',
    name: 'Leads · Efficiency',
    level: 'adset',
    mode: 'efficiency',
    daily_total: 150,
    adset_ids: ['as-2'],
    summary: { adsets: 1, spend14: 2000, conv14: 50 },
    reason: 'Grouped by objective',
  },
];

const snapshots = [
  {
    id: 'as-1',
    name: 'Awareness set',
    currentBudget: 200,
    windows: { d14: { spend: 1000, impressions: 50000 } },
  },
  {
    id: 'as-2',
    name: 'Leads set',
    currentBudget: 150,
    windows: { d14: { spend: 2000, impressions: 20000, leads: 50 } },
  },
] as unknown as AdSetSnapshot[];

mock.module('../useOptimizerData', () => ({
  ...realData,
  useOptimizerAdAccounts: () => ({
    data: [
      { platform: 'meta', account_id: 'act_1', name: 'Acct', status: 'ACTIVE', currency: 'USD' },
    ],
  }),
  useOptimizerSuggestions: () => ({
    data: { suggestions, diagnostics: null, reason: null },
    isLoading: false,
    isError: false,
  }),
  useOptimizerAccountSnapshots: () => ({ data: snapshots, isLoading: false, isError: false }),
  useOptimizerMutations: () => ({
    create: { mutate: createMutate, isPending: false },
    enroll: { mutate: mock(() => {}), isPending: false },
    run: { mutate: mock(() => {}), isPending: false },
  }),
  // The explorer mounts the mosaic; keep its per-ad-set reads empty and inert.
  useOptimizerAdsetAds: () => ({ data: [], isLoading: false, isError: false }),
  useOptimizerAdDailyTrends: () => ({ data: [] }),
  useOptimizerAdAngles: () => ({ data: [] }),
}));

const { PortfolioSetup } = await import('./PortfolioSetup');

afterEach(() => {
  cleanup();
  createMutate.mockClear();
});

describe('PortfolioSetup — suggestion explorer', () => {
  it('keeps the explorer closed until a suggestion is explored', () => {
    render(<PortfolioSetup adAccountId="act_1" brandId="b1" currency="USD" />);
    expect(screen.getAllByRole('button', { name: /Explore ad sets/i }).length).toBe(2);
    expect(screen.queryByLabelText('Search ad sets')).toBeNull();
  });

  it('opens one suggestion into the split explorer with its ad sets', () => {
    render(<PortfolioSetup adAccountId="act_1" brandId="b1" currency="USD" />);
    fireEvent.click(screen.getAllByRole('button', { name: /Explore ad sets/i })[0]);

    expect(screen.getByLabelText('Search ad sets')).toBeTruthy();
    expect(screen.getByText('Awareness set')).toBeTruthy();
    expect(document.body.textContent).toContain('No ads in this ad set');
  });

  it('keeps exactly one explorer open when a second suggestion is explored', () => {
    render(<PortfolioSetup adAccountId="act_1" brandId="b1" currency="USD" />);
    const exploreButtons = screen.getAllByRole('button', { name: /Explore ad sets/i });

    fireEvent.click(exploreButtons[0]);
    expect(screen.getByText('Awareness set')).toBeTruthy();

    fireEvent.click(exploreButtons[1]);
    // The first explorer closed; only the second's ad set remains, and there is one search box.
    expect(screen.queryByText('Awareness set')).toBeNull();
    expect(screen.getByText('Leads set')).toBeTruthy();
    expect(screen.getAllByLabelText('Search ad sets').length).toBe(1);
  });

  it('closes the explorer when its own toggle is pressed again', () => {
    render(<PortfolioSetup adAccountId="act_1" brandId="b1" currency="USD" />);
    const explore = screen.getAllByRole('button', { name: /Explore ad sets/i })[0];

    fireEvent.click(explore);
    expect(screen.getByLabelText('Search ad sets')).toBeTruthy();

    fireEvent.click(explore);
    expect(screen.queryByLabelText('Search ad sets')).toBeNull();
  });

  it('still creates from the card with the suggested objective', () => {
    render(<PortfolioSetup adAccountId="act_1" brandId="b1" currency="USD" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Create$/i })[0]);

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0] as [{ config: { objective: string } }];
    expect(payload.config.objective).toBe('awareness');
  });
});
