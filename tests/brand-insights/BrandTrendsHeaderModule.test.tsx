import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { BrandTrendsHeaderModule } from '@/components/brand-insights/BrandTrendsHeaderModule';
import { ToastProvider } from '@/components/ui/ToastProvider';
import type { BrandInsightsTrend, OrganicMetricsBrandInsights } from '@/lib/schemas/brandInsights';

afterEach(cleanup);

function renderModule(brandInsights: OrganicMetricsBrandInsights) {
  return render(
    <ToastProvider>
      <BrandTrendsHeaderModule brandId="brand-1" brandInsights={brandInsights} />
    </ToastProvider>,
  );
}

function trend(id: string, title: string): BrandInsightsTrend {
  return {
    id,
    title,
    description: `${title} is showing up everywhere this week.`,
    isSelected: false,
    timesUsed: 0,
  };
}

function insights(
  overrides: Partial<OrganicMetricsBrandInsights> = {},
): OrganicMetricsBrandInsights {
  return {
    trendsAndEvents: {
      trends: [
        trend('t1', 'Quiet luxury resurgence'),
        trend('t2', 'Founder POV reels'),
        trend('t3', 'Recipe remix format'),
      ],
      events: [],
      generatedAt: new Date().toISOString(),
    },
    questionsByNiche: { questionsByNiche: {} },
    weekStartDate: '2026-07-06',
    ...overrides,
  };
}

describe('BrandTrendsHeaderModule', () => {
  test('collapses the panel behind a trigger carrying the trend count', () => {
    renderModule(insights());

    expect(screen.getByRole('button', { name: /Trends/ })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    // The panel's own controls must not be in the DOM until the trigger is clicked —
    // that is the whole point of the move off the metrics scroll body.
    expect(screen.queryByText('Current trend signals')).toBeNull();
    expect(screen.queryByText('Quiet luxury resurgence')).toBeNull();
  });

  test('opens the full panel on click', () => {
    renderModule(insights());

    fireEvent.click(screen.getByRole('button', { name: /Trends/ }));

    expect(screen.getByText('Current trend signals')).toBeTruthy();
    expect(screen.getByText('Quiet luxury resurgence')).toBeTruthy();
    expect(screen.getByText('Founder POV reels')).toBeTruthy();
  });

  test('keeps the trigger quiet while the signals are fresh', () => {
    renderModule(insights());

    const trigger = screen.getByRole('button', { name: /Trends/ });
    expect(trigger.querySelector('.bg-warning')).toBeNull();
  });

  test('raises an indicator when the signals are older than a week', () => {
    const staleAt = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
    renderModule(
      insights({
        trendsAndEvents: {
          trends: [trend('t1', 'Quiet luxury resurgence')],
          events: [],
          generatedAt: staleAt,
        },
      }),
    );

    const trigger = screen.getByRole('button', { name: /Trends/ });
    expect(trigger.querySelector('.bg-warning')).not.toBeNull();
  });

  test('raises an indicator and drops the count when a brand has no signals', () => {
    renderModule({
      trendsAndEvents: { trends: [], events: [] },
      questionsByNiche: { questionsByNiche: {} },
    });

    const trigger = screen.getByRole('button', { name: /Trends/ });
    expect(trigger.querySelector('.bg-warning')).not.toBeNull();
    expect(trigger.textContent).toBe('Trends');
  });
});
