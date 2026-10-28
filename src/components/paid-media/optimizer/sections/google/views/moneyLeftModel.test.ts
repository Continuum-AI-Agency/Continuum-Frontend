import { describe, expect, it } from 'bun:test';
import { GoogleTopCampaignsSchema } from '@continuum/contracts';
import { NOT_IN_THIS_READ } from '../googleReads';
import { CARDS, campaignsBeforeE1, campaignsFixture } from './__fixtures__/googleViews';
import { type BudgetLimitedCard, buildMoneyLeft } from './moneyLeftModel';

const G03 = CARDS.filter(
  (card): card is BudgetLimitedCard => card.variant === 'google_budget_limited',
);

describe('buildMoneyLeft', () => {
  const read = GoogleTopCampaignsSchema.parse(campaignsFixture());

  it('keeps budget-lost and rank-lost in separate columns, Google’s bounds as bounds', () => {
    const model = buildMoneyLeft(read, [], 'MXN');
    const search = model.rows.find((row) => row.id === '111');
    expect(search).toMatchObject({
      share: { text: '42%' },
      lostToBudget: { text: '10%' },
      lostToRank: { text: '48%' },
      budgetPerDay: { text: '$600 MXN/day' },
      rankOverBudget: true,
    });
    const brand = model.rows.find((row) => row.id === '333');
    expect(brand?.share.text).toBe('>90%');
    expect(brand?.lostToRank.text).toBe('<10%');
    expect(brand?.buys.text).toBe('Nothing lost to budget');
  });

  it('without a G03 card, what more budget buys is a labelled linear range from zero', () => {
    const model = buildMoneyLeft(read, [], 'MXN');
    const search = model.rows.find((row) => row.id === '111');
    // 4,200 over 7 days at 10% lost of 42% won: 600 × 0.238 = 142.86/day; 5 × 0.238 = 1.19.
    expect(search?.buys.text).toBe('+0–1.2 results/day for +$143 MXN/day');
    expect(search?.buysBasis).toBe('linear on these 7 days, not a projection');
  });

  it('uses the G03 projection when a pending card holds one for the campaign', () => {
    const model = buildMoneyLeft(read, G03, 'MXN');
    const pmax = model.rows.find((row) => row.id === '222');
    expect(pmax?.buys.text).toBe('At $600 MXN/day: about 2–2.4 leads/day (now 2)');
    expect(pmax?.buysBasis).toBe('Optimizer projection on 14 days');
  });

  it('ranks by the money left and leaves campaigns off Search out of the table, counted', () => {
    const model = buildMoneyLeft(read, [], 'MXN');
    expect(model.rows.map((row) => row.id)).toEqual(['222', '111', '333']);
    expect(model.offSearch).toBe(1);
    expect(model.budgetLimited).toBe(2);
    expect(Math.round(model.extraSpendPerDay)).toBe(726);
    expect(model.rankLimited).toBe(2);
  });

  it('says spend only when conversions are not counted', () => {
    const ambiguous = campaignsFixture();
    for (const row of ambiguous.rows) row.metrics.conversions = null;
    const model = buildMoneyLeft(ambiguous, [], 'MXN');
    expect(model.rows.find((row) => row.id === '111')?.buys.text).toBe(
      '+$143 MXN/day reaches them',
    );
  });

  it('reads "—" with the cache reason on a payload from before E1, never a zero', () => {
    const model = buildMoneyLeft(campaignsBeforeE1(), [], 'MXN');
    for (const row of model.rows) {
      for (const cell of [
        row.share,
        row.lostToBudget,
        row.lostToRank,
        row.budgetPerDay,
        row.buys,
      ]) {
        expect(cell).toEqual({ text: '—', reason: NOT_IN_THIS_READ });
      }
    }
    expect(model.extraSpendPerDay).toBe(0);
  });

  it('is empty when nothing spent', () => {
    const model = buildMoneyLeft(campaignsFixture({ rows: [] }), [], 'MXN');
    expect(model.rows).toEqual([]);
    expect(model.offSearch).toBe(0);
  });
});
