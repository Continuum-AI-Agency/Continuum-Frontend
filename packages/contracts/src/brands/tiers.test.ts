import { describe, expect, it } from 'bun:test';
import { BRAND_TIER_TEMPLATE_FORGE, brandTierAllowsTemplateForge } from './tiers';

describe('brandTierAllowsTemplateForge', () => {
  it('opens at the named tier and above', () => {
    expect(brandTierAllowsTemplateForge(BRAND_TIER_TEMPLATE_FORGE)).toBe(true);
    expect(brandTierAllowsTemplateForge(9)).toBe(true);
  });

  it('is closed below it, including for every paying tier underneath', () => {
    expect(brandTierAllowsTemplateForge(0)).toBe(false);
    expect(brandTierAllowsTemplateForge(1)).toBe(false);
    expect(brandTierAllowsTemplateForge(2)).toBe(false);
  });

  // The gate reads a column that can be absent on a row the API did not select fully, and an
  // unknown tier must never open a capability that provisions collections in a shared workspace.
  it('refuses rather than assumes when the tier is not a number', () => {
    expect(brandTierAllowsTemplateForge(null)).toBe(false);
    expect(brandTierAllowsTemplateForge(undefined)).toBe(false);
    expect(brandTierAllowsTemplateForge(Number.NaN)).toBe(false);
  });
});
