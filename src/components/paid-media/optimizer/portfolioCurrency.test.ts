import { describe, expect, it } from 'bun:test';
import { portfolioCurrency } from './portfolioCurrency';

// PP-DT-E-google-portfolio-money-without-currency (deep test 2026-10-31). Easy Fit 2026's Google
// portfolio b9cebbcf is stamped MXN (optimizer_list_portfolios), but its detail hero printed
// "24.13" beside a headline that said "$24.13 MXN": the hero was handed the selected META
// account's currency, and a Google customer's account row carries none. A portfolio's money is
// in the portfolio's own currency.
describe('portfolioCurrency — the currency a portfolio’s own figures are in', () => {
  it('reads the code stamped on the portfolio, whatever its account row says', () => {
    expect(portfolioCurrency({ currency: 'MXN' }, null)).toBe('MXN');
    expect(portfolioCurrency({ currency: 'MXN' }, undefined)).toBe('MXN');
  });

  it('normalizes a stamped code the way the formatter reads one', () => {
    expect(portfolioCurrency({ currency: ' mxn ' }, null)).toBe('MXN');
  });

  it("falls back on the portfolio's own account when nothing is stamped", () => {
    expect(portfolioCurrency({ currency: null }, 'MXN')).toBe('MXN');
    expect(portfolioCurrency({}, 'usd')).toBe('USD');
    expect(portfolioCurrency({ currency: '' }, 'MXN')).toBe('MXN');
  });

  it('stays unknown — a bare figure — when neither carries a usable code', () => {
    expect(portfolioCurrency({ currency: null }, null)).toBeNull();
    expect(portfolioCurrency({ currency: 'pesos' }, '$')).toBeNull();
  });
});
