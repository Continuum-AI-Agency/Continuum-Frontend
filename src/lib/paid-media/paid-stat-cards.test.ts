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
    const cards = buildPaidStatCards(overview, 'MXN');
    expect(cards.map((card) => card.id)).toEqual(['spend', 'roas', 'ctr']);
  });

  it('formats values by unit and carries the delta', () => {
    const [spend, roas, ctr] = buildPaidStatCards(overview, 'MXN');
    expect(spend.value).toBe('2,346 MXN');
    expect(spend.deltaPct).toBe(11.7);
    expect(roas.value).toBe('4.12x');
    expect(ctr.value).toBe('1.8%');
    expect(ctr.deltaPct).toBe(-8.5);
  });

  it('derives the daily bar series from trends', () => {
    const [spend] = buildPaidStatCards(overview, 'MXN');
    expect(spend.series).toEqual([300, 360]);
  });

  it('surfaces the prior window in the hover detail', () => {
    const [spend] = buildPaidStatCards(overview, 'MXN');
    expect(spend.detail[0]).toEqual({ label: 'Prev 7d', value: '2,100 MXN' });
  });

  // PP-L3-home-paid-prints-dollar-signs-no-currency: the payload's own currency outranks the
  // account record's; an unknown currency prints the bare figure, never `$`. Each card carries
  // the raw figure, its unit and its currency so the strip can stamp provenance.
  it('labels money with the payload currency first, the account currency second, never $', () => {
    const [fromPayload] = buildPaidStatCards({ ...overview, currency: 'MXN' }, 'USD');
    expect(fromPayload.value).toBe('2,346 MXN');
    expect(fromPayload).toMatchObject({ raw: 2345.6, unit: 'currency', currency: 'MXN' });
    const [fromAccount] = buildPaidStatCards({ ...overview, currency: null }, 'MXN');
    expect(fromAccount.value).toBe('2,346 MXN');
    const [unknown] = buildPaidStatCards(overview, null);
    expect(unknown.value).toBe('2,346');
    expect(unknown.currency).toBeNull();
  });

  it('degrades missing secondary metrics to a dash', () => {
    const cards = buildPaidStatCards({ metrics: { spend: 10, roas: 1, ctr: 1 } }, null);
    const spend = cards[0];
    expect(spend.detail.find((row) => row.label === 'Impressions')?.value).toBe('—');
    expect(spend.deltaPct).toBeUndefined();
    expect(spend.series).toEqual([]);
  });
});
