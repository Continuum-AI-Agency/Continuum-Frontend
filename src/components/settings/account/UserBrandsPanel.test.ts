import { describe, expect, it } from 'bun:test';
import { matchesBrandSearch } from './UserBrandsPanel';

const brand = {
  id: 'brand-alpha-123',
  name: 'Alpha Creative Studio',
  completed: true,
  logoPath: null,
  logoUrl: null,
  role: 'owner',
};

describe('matchesBrandSearch', () => {
  it('matches normalized brand names', () => {
    expect(matchesBrandSearch(brand, 'alpha creative')).toBe(true);
  });

  it('matches fuzzy subsequences', () => {
    expect(matchesBrandSearch(brand, 'acstudio')).toBe(true);
  });

  it('matches role and id fields', () => {
    expect(matchesBrandSearch(brand, 'owner')).toBe(true);
    expect(matchesBrandSearch(brand, 'alpha123')).toBe(true);
  });

  it('rejects unrelated queries', () => {
    expect(matchesBrandSearch(brand, 'zebra')).toBe(false);
  });
});
