import { afterEach, describe, expect, it } from 'bun:test';
import { readBrand } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';

import { HealthCard, OpportunitiesCard } from './HomeOverview';
import { HomeReadingStrip } from './HomeReadingStrip';

afterEach(() => cleanup());

const portfolio = {
  id: 'p-1',
  name: 'Leads // Google Ads only',
  applyMode: 'recommend' as const,
  status: 'active' as const,
  autopilotPaused: false,
  pendingRecommendations: 2,
  pendingBudgetMoves: 0,
  staleForDays: null,
  rosterAbsent: false,
};

describe('HomeReadingStrip', () => {
  it('says how the Home reads a brand that approves changes', () => {
    const reading = readBrand({
      accounts: { ads: 2, organic: 1 },
      savedGoal: { id: 'tours', label: 'Tours booked', metric: 'purchases', role: 'primary' },
      business: null,
      portfolios: [portfolio],
      approvalRequired: false,
    });
    const { container, getByText } = render(<HomeReadingStrip reading={reading} />);
    expect(container.querySelector('[data-home-reading]')?.getAttribute('data-home-reading')).toBe(
      'approve',
    );
    expect(getByText('Tours booked')).toBeTruthy();
    expect(getByText('You approve')).toBeTruthy();
    expect(getByText('Opportunities')).toBeTruthy();
    expect(getByText('2 recommendations waiting in Leads // Google Ads only')).toBeTruthy();
  });

  it('reads a brand in onboarding from its Brand Book', () => {
    const reading = readBrand({
      accounts: { ads: 0, organic: 0 },
      savedGoal: null,
      business: { calls: ['Shop the new collection'], descriptions: ['Online store'] },
      portfolios: [],
      approvalRequired: false,
    });
    const { getByText } = render(<HomeReadingStrip reading={reading} />);
    expect(getByText('Revenue')).toBeTruthy();
    expect(getByText('Read from your Brand Book: it describes a store')).toBeTruthy();
    expect(getByText('Setting up')).toBeTruthy();
    expect(getByText('Setup')).toBeTruthy();
  });
});

describe('Home cards the reading adds', () => {
  it('links each health issue to its portfolio', () => {
    const { getByRole } = render(
      <HealthCard
        issues={[{ portfolioId: 'p-1', title: 'Leads lost the campaigns it manages' }]}
      />,
    );
    const link = getByRole('link', { name: 'Leads lost the campaigns it manages' });
    expect(link.getAttribute('href')).toBe(
      '/scale?tab=performance&optimizerView=portfolios&portfolio=p-1',
    );
  });

  it('sends a suggestion without a portfolio to the portfolio creator', () => {
    const { getByRole, queryByText } = render(
      <OpportunitiesCard
        opportunities={[{ portfolioId: null, title: 'Group your campaigns', count: 0 }]}
      />,
    );
    expect(getByRole('link', { name: 'Group your campaigns' }).getAttribute('href')).toBe(
      '/scale?tab=performance&optimizerView=create',
    );
    expect(queryByText('0')).toBeNull();
  });
});
