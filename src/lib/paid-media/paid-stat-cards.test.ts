import { describe, expect, it } from 'bun:test';

import { buildPaidStatCards, type PaidOverviewInput } from './paid-stat-cards';

const overview: PaidOverviewInput = {
  metrics: {
    spend: 2345.6,
    roas: 4.12,
    ctr: 1.83,
    impressions: 184230,
    clicks: 3370,
    cpc: 0.7,
    cpa: 12.4,
    purchases: 189,
    purchase_value: 9670,
  },
  comparison: {
    spend: { previous: 2100, percentageChange: 11.7 },
    roas: { previous: 3.4, percentageChange: 21.2 },
    ctr: { previous: 2.0, percentageChange: -8.5 },
  },
  trends: [
    { spend: 300, roas: 3.9, ctr: 1.7 },
    { spend: 360, roas: 4.3, ctr: 1.9 },
  ],
};

describe('buildPaidStatCards', () => {
  it('builds spend, ROAS, and CTR cards', () => {
    const cards = buildPaidStatCards(overview);
    expect(cards.map((card) => card.id)).toEqual(['spend', 'roas', 'ctr']);
  });

  it('formats values by unit and carries the delta', () => {
    const [spend, roas, ctr] = buildPaidStatCards(overview);
    expect(spend.value).toBe('$2.3K');
    expect(spend.deltaPct).toBe(11.7);
    expect(roas.value).toBe('4.12x');
    expect(ctr.value).toBe('1.8%');
    expect(ctr.deltaPct).toBe(-8.5);
  });

  it('derives the daily bar series from trends', () => {
    const [spend] = buildPaidStatCards(overview);
    expect(spend.series).toEqual([300, 360]);
  });

  it('surfaces the prior window in the hover detail', () => {
    const [spend] = buildPaidStatCards(overview);
    expect(spend.detail[0]).toEqual({ label: 'Prev 7d', value: '$2.1K' });
  });

  it('degrades missing secondary metrics to a dash', () => {
    const cards = buildPaidStatCards({ metrics: { spend: 10, roas: 1, ctr: 1 } });
    const spend = cards[0];
    expect(spend.detail.find((row) => row.label === 'Impressions')?.value).toBe('—');
    expect(spend.deltaPct).toBeUndefined();
    expect(spend.series).toEqual([]);
  });
});
