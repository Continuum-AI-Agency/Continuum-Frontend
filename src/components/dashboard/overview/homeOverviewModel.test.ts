import { describe, expect, it } from 'bun:test';

import type { PaidAccountOverview } from '@/lib/paid-media/paid-overview.client';
import { deltaPercent, objectiveFigure, rankingKpisFor, sumOverviews } from './homeOverviewModel';

const tours = { id: 'tours', label: 'Tours booked', metric: 'purchases', role: 'primary' } as const;
const chats = {
  id: 'conversations',
  label: 'Conversations started',
  metric: 'conversations',
  role: 'secondary',
} as const;

const easyFit: PaidAccountOverview = {
  metrics: { spend: 23400, roas: 0, ctr: 1.2, purchases: 73, conversations: 525, leads: 40 },
  comparison: {
    spend: { current: 23400, previous: 20000, percentageChange: 17 },
    purchases: { current: 73, previous: 50, percentageChange: 46 },
    conversations: { current: 525, previous: 600, percentageChange: -12.5 },
  },
  trends: [
    { date: '2026-10-02', spend: 3000, purchases: 10, conversations: 70 },
    { date: '2026-10-01', spend: 3500, purchases: 12, conversations: 80 },
  ],
};

const olderEdge: PaidAccountOverview = {
  metrics: { spend: 1000, roas: 2, ctr: 1, purchases: 5, purchase_value: 2000 },
  comparison: {
    spend: { current: 1000, previous: 800, percentageChange: 25 },
    roas: { current: 2, previous: 1.5, percentageChange: 33 },
    purchases: { current: 5, previous: 4, percentageChange: 25 },
  },
};

describe('sumOverviews', () => {
  it('keeps a metric the edge never counted missing instead of zero', () => {
    const totals = sumOverviews([olderEdge]);
    expect(totals.current.conversations).toBeUndefined();
    expect(totals.current.purchase_value).toBe(2000);
    expect(totals.previous.purchase_value).toBe(1200);
  });

  it('adds accounts together and orders the daily series by date', () => {
    const totals = sumOverviews([easyFit, olderEdge]);
    expect(totals.current.purchases).toBe(78);
    expect(totals.current.spend).toBe(24400);
    expect(totals.series.purchases).toEqual([12, 10]);
    expect(totals.accountCount).toBe(2);
  });

  it('drops the previous total when one account has no comparison for it', () => {
    const totals = sumOverviews([easyFit, olderEdge]);
    expect(totals.previous.conversations).toBeUndefined();
    expect(totals.previous.purchases).toBe(54);
  });
});

describe('objectiveFigure', () => {
  it("prints Easy Fit's tours with their cost and change", () => {
    const figure = objectiveFigure(tours, sumOverviews([easyFit]));
    expect(figure.available).toBe(true);
    expect(figure.value).toBe(73);
    expect(figure.deltaPct).toBeCloseTo(46, 0);
    expect(figure.cost?.label).toBe('Cost per purchase');
    expect(figure.cost?.value).toBeCloseTo(23400 / 73, 5);
    expect(figure.cost?.previous).toBeCloseTo(20000 / 50, 5);
  });

  it('marks an objective unavailable when its count is missing', () => {
    const figure = objectiveFigure(chats, sumOverviews([olderEdge]));
    expect(figure.available).toBe(false);
    expect(figure.value).toBeNull();
    expect(figure.cost).toBeNull();
  });

  it('reads revenue against spend as ROAS', () => {
    const revenue = {
      id: 'r',
      label: 'Revenue',
      metric: 'purchase_value',
      role: 'primary',
    } as const;
    const figure = objectiveFigure(revenue, sumOverviews([olderEdge]));
    expect(figure.cost).toEqual({ label: 'ROAS', value: 2, previous: 1.5, kind: 'ratio' });
  });
});

describe('helpers', () => {
  it('has no change against a zero or missing baseline', () => {
    expect(deltaPercent(5, 0)).toBeNull();
    expect(deltaPercent(5, null)).toBeNull();
    expect(deltaPercent(15, 10)).toBe(50);
  });

  it('ranks conversations by their own count and cost', () => {
    expect(rankingKpisFor('conversations')).toEqual({
      volume: 'conversations',
      efficiency: 'cost_per_conversation',
    });
    expect(rankingKpisFor('spend').efficiency).toBeNull();
  });
});
