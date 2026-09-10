import { describe, expect, it } from 'bun:test';
import { isPaidTier, isTemplateForgeTier } from '../tier';

describe('isPaidTier', () => {
  it('returns false for tier 0 (free)', () => {
    expect(isPaidTier(0)).toBe(false);
  });

  it('returns true for tier 1', () => {
    expect(isPaidTier(1)).toBe(true);
  });

  it('returns true for any positive tier', () => {
    expect(isPaidTier(2)).toBe(true);
    expect(isPaidTier(99)).toBe(true);
  });

  it('returns false for negative values (safety)', () => {
    expect(isPaidTier(-1)).toBe(false);
  });
});

describe('isTemplateForgeTier', () => {
  it('opens at tier 3 and above', () => {
    expect(isTemplateForgeTier(3)).toBe(true);
    expect(isTemplateForgeTier(9)).toBe(true);
  });

  // The distinction the binary gates could not express: a paying brand that still may not
  // provision collections in a shared render workspace.
  it('is closed for every paid tier below it', () => {
    expect(isTemplateForgeTier(1)).toBe(false);
    expect(isTemplateForgeTier(2)).toBe(false);
    expect(isPaidTier(2)).toBe(true);
  });

  it('is closed for free', () => {
    expect(isTemplateForgeTier(0)).toBe(false);
  });
});
