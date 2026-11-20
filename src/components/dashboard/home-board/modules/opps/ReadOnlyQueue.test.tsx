import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { RecommendationRow } from '@continuum/contracts';
import { cleanup } from '@testing-library/react';
import { moveRec } from '@/components/paid-media/optimizer/sections/crossPlatformMove/moveFixtures';
import { render } from '@/i18n/__tests__/render';
import { EASY_FIT_SIZED_AND_UNSIZED } from '../checklist/__fixtures__/recommendations';
import { EASY_FIT_PORTFOLIOS } from './__fixtures__/portfolios';

const realOptimizer = await import('@/components/paid-media/optimizer/useOptimizerData');
const portfolio = EASY_FIT_PORTFOLIOS[0];
if (!portfolio) throw new Error('Missing queue test portfolio');
let performance = {
  isSuccess: true,
  isError: false,
  data: {
    portfolio,
    latest_run: null,
    latest_items: [],
    recommendations: [] as RecommendationRow[],
    history: [],
    hero_brief: null,
  },
};

mock.module('@/components/paid-media/optimizer/useOptimizerData', () => ({
  ...realOptimizer,
  useOptimizerPerformance: () => performance,
  useOptimizerEnrolledAdsets: () => ({ data: [] }),
  useOptimizerAccountSnapshots: () => ({ data: [] }),
  useOptimizerAudienceProposals: () => ({ data: [] }),
  useCurrentMoves: () => ({ current: [], notes: new Map() }),
  useOptimizerMutations: () => {
    throw new Error('Read-only queue mounted a write-capable host');
  },
}));

const { ReadOnlyQueue } = await import('./ReadOnlyQueue');
afterEach(() => {
  cleanup();
  performance = {
    ...performance,
    isSuccess: true,
    isError: false,
    data: { ...performance.data, recommendations: [] },
  };
});

describe('Read-only opportunity inspection', () => {
  it('keeps a move-only queue inspectable with real leg amounts and no execution control', () => {
    performance = {
      ...performance,
      isSuccess: true,
      isError: false,
      data: { ...performance.data, recommendations: [moveRec()] },
    };
    const screen = render(<ReadOnlyQueue brandId="test-brand" portfolio={portfolio} />);
    expect(screen.queryByText('Nothing is recorded in this queue.')).toBeNull();
    expect(screen.getAllByTestId('home-draft-move-leg')).toHaveLength(4);
    expect(screen.container.textContent).toContain('59.25');
    expect(screen.container.textContent).toContain('EF | Leads | Broad MX');
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('reads the real queue boundary without mounting its mutation hosts', () => {
    const screen = render(<ReadOnlyQueue brandId="test-brand" portfolio={portfolio} />);
    expect(screen.getByText('Nothing is recorded in this queue.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('reports a failed read rather than a successful empty queue', () => {
    performance = { ...performance, isSuccess: false, isError: true };
    const screen = render(<ReadOnlyQueue brandId="test-brand" portfolio={portfolio} />);
    expect(screen.getByRole('alert').textContent).toContain('could not be read');
    expect(screen.queryByText('Nothing is recorded in this queue.')).toBeNull();
  });

  it('keeps stored reasons available inside expandable evidence with every decision disabled', () => {
    performance = {
      ...performance,
      isSuccess: true,
      isError: false,
      data: { ...performance.data, recommendations: EASY_FIT_SIZED_AND_UNSIZED },
    };
    const screen = render(<ReadOnlyQueue brandId="test-brand" portfolio={portfolio} />);
    const details = screen.container.querySelectorAll('details[data-home-queue-key]');
    expect(details.length).toBeGreaterThan(0);
    const reason = EASY_FIT_SIZED_AND_UNSIZED[0]?.reason;
    expect(reason).toBeTruthy();
    expect(screen.container.textContent).toContain(reason as string);
    expect(
      screen.container.querySelector('[data-testid="home-draft-recommendation-evidence"]'),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
