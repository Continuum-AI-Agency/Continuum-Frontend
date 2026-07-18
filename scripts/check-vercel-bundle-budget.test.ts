import { describe, expect, it } from 'bun:test';
import { isWithinBudget, maxAllowedBytes } from './check-vercel-bundle-budget.mjs';

describe('Vercel bundle budgets', () => {
  it('allows at most the configured percentage over the recorded baseline', () => {
    expect(maxAllowedBytes(1000, 10)).toBe(1100);
    expect(isWithinBudget(1100, 1000, 10)).toBe(true);
    expect(isWithinBudget(1101, 1000, 10)).toBe(false);
  });

  it('rounds fractional byte ceilings up', () => {
    expect(maxAllowedBytes(101, 10)).toBe(112);
  });
});
