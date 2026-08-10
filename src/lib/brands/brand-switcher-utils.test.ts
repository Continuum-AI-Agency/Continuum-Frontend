import { describe, expect, it } from 'bun:test';
// Imported by path, not '@/lib/...': CommandPalette.test.tsx mock.module's this
// module process-wide, and Bun patches the live export object either way — keep the
// surface under test to the two labellers it cannot clobber.
import { getActiveBrandLabel, getBrandMenuItemLabel } from './brand-switcher-utils';

// Onboarding derives the brand name from the scraped site title, so re-running it
// mints a second distinct row with the identical name (prod: "Tienda Online de
// Bocamasarte" ×2, "duanecscott's Brand" ×14). The switcher has to tell them apart.
describe('getBrandMenuItemLabel', () => {
  const boca1 = { id: 'a5bb3adc-1111-2222-3333-4444cafe0001', name: 'Bocamasarte' };
  const boca2 = { id: 'cb8ef88f-1111-2222-3333-4444cafe0002', name: 'Bocamasarte' };
  const batech = { id: 'ffffffff-1111-2222-3333-4444cafe0003', name: 'Batech' };

  it('leaves a unique name untouched', () => {
    expect(getBrandMenuItemLabel(batech, [boca1, boca2, batech])).toBe('Batech');
  });

  it('appends a distinct id tail to each side of a name collision', () => {
    const first = getBrandMenuItemLabel(boca1, [boca1, boca2, batech]);
    const second = getBrandMenuItemLabel(boca2, [boca1, boca2, batech]);

    expect(first).toBe('Bocamasarte — …fe0001');
    expect(second).toBe('Bocamasarte — …fe0002');
    expect(first).not.toBe(second);
  });

  it('never disambiguates a brand against itself', () => {
    expect(getBrandMenuItemLabel(boca1, [boca1])).toBe('Bocamasarte');
  });

  it('treats whitespace-different names as the same name', () => {
    const padded = { id: 'zzzzzzzz-0004', name: '  Bocamasarte ' };
    expect(getBrandMenuItemLabel(padded, [boca1, padded])).toBe('Bocamasarte — …z-0004');
  });

  it('collides on the placeholder too, so two unnamed brands stay distinguishable', () => {
    const a = { id: 'aaaaaaaa-0005', name: null };
    const b = { id: 'bbbbbbbb-0006', name: '' };
    expect(getBrandMenuItemLabel(a, [a, b])).toBe('Untitled brand — …a-0005');
    expect(getBrandMenuItemLabel(b, [a, b])).toBe('Untitled brand — …b-0006');
  });

  it('returns the bare name when no sibling list is supplied', () => {
    expect(getBrandMenuItemLabel(boca1)).toBe('Bocamasarte');
    expect(getBrandMenuItemLabel({ id: 'x', name: null })).toBe('Untitled brand');
  });
});

describe('getActiveBrandLabel', () => {
  it('names the active brand and falls back when it is not in the list', () => {
    const brands = [
      { id: 'b1', name: 'Batech' },
      { id: 'b2', name: 'Bocamasarte' },
    ];
    expect(getActiveBrandLabel(brands, 'b2')).toBe('Bocamasarte');
    expect(getActiveBrandLabel(brands, 'missing')).toBe('Brands');
  });
});
