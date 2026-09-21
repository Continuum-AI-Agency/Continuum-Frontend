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

    // The rank tones are Badge variants (violet / teal / muted). They used to be solid
    // `bg-*/10` fills; the base-nova badge is outline-and-tinted-text now, so the fill
    // classes survive only as `[a&]:hover:` states — which is why `bg-primary/10` and
    // `bg-secondary/10` still matched as substrings while `bg-muted` did not, and the
    // first two assertions were passing for the wrong reason. Pin the text tone, which
    // is what actually distinguishes the three ranks.
    const [winner, runnerUp, third] = chips;
    expect(winner?.textContent).toContain('#1');
    expect(winner?.textContent).toContain('Cold open question');
    expect(winner?.textContent).toContain('6');
    expect(winner?.className).toContain('text-primary');

    expect(runnerUp?.textContent).toContain('#2');
    expect(runnerUp?.className).toContain('text-sky-700');

    expect(third?.textContent).toContain('#3');
    expect(third?.className).toContain('text-muted-foreground');

    // Each leaderboard restarts at #1 — rank is per-board, not per-card.
    expect(chips[3]?.textContent).toContain('#1');
    expect(chips[3]?.textContent).toContain('Founder POV');
  });

  // This used to pin the opposite — no scroller at all, the table growing with its rows.
  // `feat(frontend): improve organic, paid media, and app workflows` (6aea9972) capped the
  // insight table at 420px with a sticky header so a long mined list scrolls in place
  // instead of stretching the card down the tab. The invariant worth keeping is that the
  // card opens exactly ONE scroller, and it is the table body.
  test('opens exactly one scroll container — the capped insight table', () => {
    const { container } = renderReady();

    const scrollers = container.querySelectorAll('.overflow-y-auto');
    expect(scrollers).toHaveLength(1);

    const tableContainer = container.querySelector('[data-slot="table-container"]');
    expect(scrollers[0]).toBe(tableContainer);
    expect(tableContainer?.getAttribute('style') ?? '').toContain('max-height');
  });
});
