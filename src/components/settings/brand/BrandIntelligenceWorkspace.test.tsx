import { describe, expect, test } from 'bun:test';
import type { BrandIntelligenceOverview } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { BrandIntelligenceWorkspace } from './BrandIntelligenceWorkspace';

const overview = {
  refreshedAt: '2026-07-27T12:00:00.000Z',
  enrichment: {
    status: 'ready',
    sections: {
      identity: 'ready',
      competitors: 'missing',
      creative_competition: 'ready',
      answer_visibility: 'ready',
    },
  },
  scorecard: {
    identityReadiness: {
      value: 82,
      band: 'strong',
      label: 'Identity readiness',
      explanation: 'Brand DNA is ready.',
    },
    evidenceCoverage: {
      value: 75,
      band: 'strong',
      label: 'Evidence coverage',
      explanation: 'Three sections are available.',
    },
    competitorCoverage: {
      value: null,
      band: null,
      label: 'Competitor coverage',
      explanation: 'Approve a competitor.',
    },
    observedVisibility: {
      value: null,
      band: null,
      label: 'Observed visibility',
      explanation: 'Simulated only.',
    },
  },
  coverage: [
    { section: 'identity', status: 'available', mode: 'inferred' },
    { section: 'competitors', status: 'missing', mode: 'inferred' },
    { section: 'creative_competition', status: 'available', mode: 'observed' },
    { section: 'answer_visibility', status: 'available', mode: 'simulated' },
  ],
  opportunities: [],
  competitors: [],
  answerVisibility: {
    methodology: {
      limitations: ['Simulated answers are not observed engine responses.'],
    },
  },
  sourceVersions: { brandBook: '2026-07-27T12:00:00.000Z' },
} as unknown as BrandIntelligenceOverview;

describe('BrandIntelligenceWorkspace', () => {
  test('renders explainable scores and keeps simulated visibility unmeasured', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <BrandIntelligenceWorkspace
          brandId="6db1f6b3-e2ed-47e3-a5a8-0a76c93ddfe6"
          brandName="Acme"
          brandBook={null}
          initialOverview={overview}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Identity readiness')).toBeTruthy();
    expect(screen.getByText('Observed visibility')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Competition' })).toBeTruthy();
  });
});
