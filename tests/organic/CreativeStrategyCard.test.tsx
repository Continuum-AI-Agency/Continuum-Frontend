import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { CreativeInsight, CreativeStrategyReport } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

import type { CreativeStrategyReadState } from '@/hooks/useCreativeStrategyReport';

// The card reads a materialized row under RLS; the network hop is not what these
// tests are about. Everything below is the rendered hierarchy of a ready report.
let readState: CreativeStrategyReadState = {
  status: 'assembling',
  report: null,
  refreshedAt: null,
};

mock.module('@/hooks/useCreativeStrategyReport', () => ({
  useCreativeStrategyReport: () => readState,
}));

const { CreativeStrategyCard } = await import('@/components/organic/CreativeStrategyCard');

afterEach(cleanup);

function insight(id: string, label: string): CreativeInsight {
  return {
    id,
    kind: 'hook',
    archetype: null,
    surface: 'organic',
    label,
    description: `${label} keeps viewers past the first second.`,
    recommendation: `Reuse ${label} on the next reel.`,
    tags: [],
    confidence: 0.82,
    performanceSummary: null,
    audience: null,
    evidence: [],
    exemplars: [],
  };
}

function report(): CreativeStrategyReport {
  return {
    brandId: 'brand-1',
    windowDays: 90,
    generatedAt: '2026-07-14T00:00:00.000Z',
    insights: [insight('i1', 'Cold open question'), insight('i2', 'Before/after reveal')],
    hookLeaderboard: [
      {
        label: 'Cold open question',
        archetype: null,
        count: 6,
        avgMetric: 0.41,
        metricName: 'hook_rate',
      },
      {
        label: 'Pattern interrupt',
        archetype: null,
        count: 3,
        avgMetric: 0.28,
        metricName: 'hook_rate',
      },
      { label: 'Direct address', archetype: null, count: 1, avgMetric: null, metricName: null },
    ],
    angleLeaderboard: [
      {
        label: 'Founder POV',
        archetype: null,
        count: 4,
        avgMetric: 2.6,
        metricName: 'engagement_rate',
      },
    ],
    audienceSnapshot: null,
    sourceCounts: { topOrganicPosts: 9, topAds: 4, analyzed: 13 },
  };
}

function renderReady() {
  readState = { status: 'ready', report: report(), refreshedAt: '2026-07-14T00:00:00.000Z' };
  return render(<CreativeStrategyCard brandId="brand-1" />);
}

describe('CreativeStrategyCard', () => {
  test('carries the brand accent so it reads as the focal card on a flat tab', () => {
    const { container } = renderReady();

    const card = container.querySelector('[data-tour-id="organic-whats-working"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('border-primary/30');
    expect(card?.className).toContain('bg-primary/[0.04]');
  });

  test('titles the card above the section tier of its peers', () => {
    renderReady();

    const title = screen.getByText("What's Working");
    expect(title.className).toContain('text-base');
    expect(title.className).toContain('font-semibold');
  });

  test('ranks the hook and angle leaderboards and tones them by rank', () => {
    renderReady();

    const chips = screen.getAllByTestId('creative-leaderboard-chip');
    // 3 hooks + 1 angle.
    expect(chips).toHaveLength(4);

    const [winner, runnerUp, third] = chips;
    expect(winner?.textContent).toContain('#1');
    expect(winner?.textContent).toContain('Cold open question');
    expect(winner?.textContent).toContain('6');
    expect(winner?.className).toContain('bg-primary/10');

    expect(runnerUp?.textContent).toContain('#2');
    expect(runnerUp?.className).toContain('bg-secondary/10');

    expect(third?.textContent).toContain('#3');
    expect(third?.className).toContain('bg-muted');

    // Each leaderboard restarts at #1 — rank is per-board, not per-card.
    expect(chips[3]?.textContent).toContain('#1');
    expect(chips[3]?.textContent).toContain('Founder POV');
  });

  test('opens no scroll container of its own — the metrics body is the only scroller', () => {
    const { container } = renderReady();

    expect(container.querySelectorAll('.overflow-y-auto')).toHaveLength(0);
    // The insight table must grow with its rows instead of capping at a height.
    const tableContainer = container.querySelector('[data-slot="table-container"]');
    expect(tableContainer?.getAttribute('style') ?? '').not.toContain('max-height');
  });
});
