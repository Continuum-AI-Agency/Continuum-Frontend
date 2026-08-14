import { describe, expect, it } from 'bun:test';
import { createDefaultMetadata, createDefaultOnboardingState } from './state';
import { ensureActiveBrand } from './storage';

const owner = { id: 'user-1', email: 'duanecscott@gmail.com', role: 'owner' as const };

describe('ensureActiveBrand', () => {
  it('keeps the requested brand when one is passed', () => {
    const metadata = createDefaultMetadata('brand-a', owner);
    metadata.brands['brand-b'] = createDefaultOnboardingState(owner);

    expect(ensureActiveBrand(metadata, owner, 'brand-b').brandId).toBe('brand-b');
  });

  it('keeps activeBrandId when it is already set', () => {
    const metadata = createDefaultMetadata('brand-a', owner);

    expect(ensureActiveBrand(metadata, owner).brandId).toBe('brand-a');
  });

  // Root cause of the duplicate-brand stacking. activeBrandId is only populated
  // from a user_onboarding_states row with is_active = true, and a brand switch
  // leaves EVERY row false — so it reads null for users who already have brands.
  // This used to mint a fresh "<handle>'s Brand" on each load; in prod one
  // account accumulated 15 of them.
  it('adopts an existing brand instead of minting when activeBrandId is null', () => {
    const metadata = createDefaultMetadata('brand-a', owner);
    metadata.brands['brand-b'] = createDefaultOnboardingState(owner);
    metadata.activeBrandId = null;

    const result = ensureActiveBrand(metadata, owner);

    expect(Object.keys(result.metadata.brands)).toEqual(['brand-a', 'brand-b']);
    expect(['brand-a', 'brand-b']).toContain(result.brandId);
    expect(result.metadata.activeBrandId).toBe(result.brandId);
  });

  it('mints a brand only when there is genuinely nothing to adopt', () => {
    const metadata = { activeBrandId: null, brands: {} };

    const result = ensureActiveBrand(metadata, owner);

    expect(result.brandId).toBeTruthy();
    expect(Object.keys(result.metadata.brands)).toEqual([result.brandId]);
    expect(result.dirty).toBe(true);
  });
});
